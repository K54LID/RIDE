import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { sql } from '../lib/db.js';
import { redis } from '../lib/redis.js';
import { HttpError } from '../lib/errors.js';
import { notify } from '../lib/notify.js';

/**
 * Messaging, v1: HTTP polling.
 *
 * WebSockets would need a dependency this deploy pipeline has twice
 * proven hostile to, so the thread polls every 2.5s with an `after`
 * cursor and the list every 5s. At this scale that's a handful of
 * indexed queries per active user — a load Postgres won't notice, and
 * the client-visible latency ceiling is one poll interval. The endpoint
 * shapes don't change when a socket transport is added later.
 *
 * Typing indicators live in Redis with a 4-second TTL: pure ephemera,
 * lost harmlessly if Redis blinks.
 */

const IdParam = z.object({ id: z.string().uuid() });

async function memberOr403(conversationId: string, accountId: string): Promise<void> {
  const rows = await sql`
    SELECT 1 FROM conversation_members
    WHERE conversation_id = ${conversationId} AND account_id = ${accountId}
  `;
  if (rows.length === 0) throw new HttpError(403, 'NOT_A_MEMBER');
}

const chatRoutes: FastifyPluginAsync = async (app) => {
  /**
   * Find-or-create the 1:1 conversation with another account. The
   * advisory lock on the ordered pair makes the find-then-create race
   * produce one conversation, not two.
   */
  app.post('/v1/chats/open', { preHandler: [app.requireAuth] }, async (req) => {
    const { account_id } = z.object({ account_id: z.string().uuid() }).parse(req.body);
    const me = req.accountId!;
    if (account_id === me) throw new HttpError(400, 'CANNOT_CHAT_SELF');

    const blocked = await sql`
      SELECT 1 FROM blocks
      WHERE (blocker_id = ${me} AND blocked_id = ${account_id})
         OR (blocker_id = ${account_id} AND blocked_id = ${me})
    `;
    if (blocked.length > 0) throw new HttpError(403, 'BLOCKED');

    const conversationId = await sql.begin(async (tx) => {
      await tx`
        SELECT pg_advisory_xact_lock(
          hashtextextended(least(${me}::text, ${account_id}::text) || ':' ||
                           greatest(${me}::text, ${account_id}::text), 42))
      `;

      const [existing] = await tx<Array<{ conversation_id: string }>>`
        SELECT cm.conversation_id
        FROM conversation_members cm
        JOIN conversation_members other
          ON other.conversation_id = cm.conversation_id
         AND other.account_id = ${account_id}
        WHERE cm.account_id = ${me}
          AND (SELECT count(*) FROM conversation_members x
               WHERE x.conversation_id = cm.conversation_id) = 2
        LIMIT 1
      `;
      if (existing) {
        // Deliberately opening the chat resurfaces it for me if I had
        // deleted it — otherwise the thread stays invisible in my list
        // even as I write into it.
        await tx`
          UPDATE conversation_members SET is_archived = false
          WHERE conversation_id = ${existing.conversation_id}
            AND account_id = ${me} AND is_archived
        `;
        return existing.conversation_id;
      }

      const [conv] = await tx<Array<{ id: string }>>`
        INSERT INTO conversations DEFAULT VALUES RETURNING id
      `;
      await tx`
        INSERT INTO conversation_members (conversation_id, account_id)
        VALUES (${conv!.id}, ${me}), (${conv!.id}, ${account_id})
      `;
      return conv!.id;
    });

    return { conversation_id: conversationId };
  });

  /** Conversation list with peer, preview, unread count, presence. */
  app.get('/v1/chats', { preHandler: [app.requireAuth] }, async (req) => {
    const me = req.accountId!;
    const rows = await sql`
      SELECT c.id,
             c.last_message_at,
             mine.is_pinned AS pinned,
             peer.account_id AS peer_id,
             pp.display_name AS peer_name,
             pp.handle       AS peer_handle,
             (pp.verification = 'approved') AS peer_verified,
             (SELECT ph.media_id FROM profile_photos ph
              WHERE ph.account_id = peer.account_id AND ph.position = 0
                AND NOT ph.is_private AND ph.media_id IS NOT NULL
              LIMIT 1) AS peer_avatar_media_id,
             CASE WHEN COALESCE(st.show_online, true)
                  THEN (pa.last_seen_at > now() - interval '5 minutes')
                  END AS peer_online,
             CASE WHEN COALESCE(st.show_last_seen, true)
                  THEN pa.last_seen_at END AS peer_last_seen,
             lm.body        AS last_body,
             lm.kind::text  AS last_kind,
             lm.sender_id   AS last_sender_id,
             lm.deleted_at IS NOT NULL AS last_deleted,
             (SELECT count(*)::int FROM messages m
              WHERE m.conversation_id = c.id
                AND m.sender_id <> ${me}
                AND m.deleted_at IS NULL
                AND m.created_at > COALESCE(mine.last_read_at, 'epoch')
                AND m.created_at > COALESCE(mine.cleared_at, 'epoch')) AS unread
      FROM conversations c
      JOIN conversation_members mine
        ON mine.conversation_id = c.id AND mine.account_id = ${me}
      JOIN conversation_members peer
        ON peer.conversation_id = c.id AND peer.account_id <> ${me}
      JOIN profiles pp ON pp.account_id = peer.account_id
      JOIN accounts pa ON pa.id = peer.account_id
      LEFT JOIN user_settings st ON st.account_id = peer.account_id
      LEFT JOIN LATERAL (
        SELECT body, kind, sender_id, deleted_at FROM messages m
        WHERE m.conversation_id = c.id
          AND m.created_at > COALESCE(mine.cleared_at, 'epoch')
        ORDER BY m.id DESC LIMIT 1
      ) lm ON true
      WHERE NOT mine.is_archived
      ORDER BY mine.is_pinned DESC, c.last_message_at DESC
      LIMIT 50
    `;
    const total = rows.reduce((n, r) => n + Number(r.unread ?? 0), 0);
    return { chats: rows, total_unread: total };
  });

  /**
   * Message window. `after` fetches only what's new — the poll path.
   * Without it, the latest page loads for thread open.
   */
  app.get('/v1/chats/:id/messages', { preHandler: [app.requireAuth] }, async (req) => {
    const { id } = IdParam.parse(req.params);
    const me = req.accountId!;

    // Membership check doubles as the cleared_at lookup: a member who
    // deleted the chat sees only what arrived after that moment.
    const [mine] = await sql<Array<{ cleared_at: string | null }>>`
      SELECT cleared_at FROM conversation_members
      WHERE conversation_id = ${id} AND account_id = ${me}
    `;
    if (!mine) throw new HttpError(403, 'NOT_A_MEMBER');

    const q = z.object({
      after: z.coerce.number().int().optional(),
      before: z.coerce.number().int().optional(),
    }).parse(req.query);

    const rows = await sql`
      SELECT m.id, m.sender_id, m.kind::text AS kind, m.body, m.media_id,
             m.reply_to_id, m.edited_at, m.deleted_at, m.created_at,
             rm.body AS reply_body,
             rp.display_name AS reply_author,
             (SELECT json_object_agg(r.emoji, r.cnt) FROM (
                SELECT emoji, count(*)::int AS cnt FROM message_reactions
                WHERE message_id = m.id GROUP BY emoji
             ) r) AS reactions,
             mr.emoji AS my_reaction
      FROM messages m
      LEFT JOIN messages rm ON rm.id = m.reply_to_id
      LEFT JOIN profiles rp ON rp.account_id = rm.sender_id
      LEFT JOIN message_reactions mr ON mr.message_id = m.id AND mr.account_id = ${me}
      WHERE m.conversation_id = ${id}
        AND m.created_at > COALESCE(${mine.cleared_at}::timestamptz, 'epoch')
        ${q.after ? sql`AND m.id > ${q.after}` : sql``}
        ${q.before ? sql`AND m.id < ${q.before}` : sql``}
      ORDER BY m.id ${q.before ? sql`DESC` : q.after ? sql`ASC` : sql`DESC`}
      LIMIT 50
    `;
    const messages = (q.after ? rows : [...rows].reverse());

    // Peer read-cursor drives the ✓✓, typing comes from Redis.
    const [peer] = await sql<Array<{ account_id: string; last_read_at: string | null }>>`
      SELECT account_id, last_read_at FROM conversation_members
      WHERE conversation_id = ${id} AND account_id <> ${me}
    `;
    let peerTyping = false;
    if (peer) {
      try {
        peerTyping = (await redis.exists(`typing:${id}:${peer.account_id}`)) === 1;
      } catch { /* typing goes quiet if redis is down */ }
    }

    return {
      messages,
      peer_last_read_at: peer?.last_read_at ?? null,
      peer_typing: peerTyping,
    };
  });

  app.post('/v1/chats/:id/messages', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const me = req.accountId!;
    await memberOr403(id, me);

    const b = z.object({
      body: z.string().trim().max(4000).optional(),
      media_id: z.string().uuid().optional(),
      reply_to_id: z.coerce.number().int().optional(),
    }).refine((v) => (v.body && v.body.length > 0) || v.media_id,
              { message: 'Message needs text or media' })
      .parse(req.body);

    const message = await sql.begin(async (tx) => {
      let kind = 'text';
      if (b.media_id) {
        const [m] = await tx<Array<{ kind: string }>>`
          SELECT kind::text AS kind FROM media
          WHERE id = ${b.media_id} AND owner_id = ${me}
        `;
        if (!m) throw new HttpError(400, 'MEDIA_NOT_OWNED');
        kind = m.kind;
      }
      if (b.reply_to_id) {
        const ok = await tx`
          SELECT 1 FROM messages WHERE id = ${b.reply_to_id} AND conversation_id = ${id}
        `;
        if (ok.length === 0) throw new HttpError(400, 'REPLY_NOT_IN_THREAD');
      }

      const [created] = await tx<Array<{ id: number; created_at: string }>>`
        INSERT INTO messages (conversation_id, sender_id, kind, body, media_id, reply_to_id)
        VALUES (${id}, ${me}, ${kind}, ${b.body ?? null}, ${b.media_id ?? null},
                ${b.reply_to_id ?? null})
        RETURNING id, created_at
      `;
      await tx`UPDATE conversations SET last_message_at = now() WHERE id = ${id}`;
      // A new message resurfaces the thread for anyone who deleted it —
      // otherwise messages would land invisibly in an archived chat.
      await tx`
        UPDATE conversation_members SET is_archived = false
        WHERE conversation_id = ${id} AND is_archived
      `;

      // Push to the other participant. Inside the transaction so a
      // failed send cannot exist for a message that never landed.
      const [peer] = await tx<Array<{ account_id: string }>>`
        SELECT account_id FROM conversation_members
        WHERE conversation_id = ${id} AND account_id <> ${me}
      `;
      if (peer) {
        await notify(tx, { accountId: peer.account_id, actorId: me, kind: 'message',
                           payload: { conversation_id: id } });
      }
      // Sending is also reading — your own view is current up to now.
      await tx`
        UPDATE conversation_members SET last_read_at = now()
        WHERE conversation_id = ${id} AND account_id = ${me}
      `;
      return created!;
    });

    try { await redis.del(`typing:${id}:${me}`); } catch { /* fine */ }
    reply.code(201);
    return message;
  });

  /** Pin toggle: pinned chats sort to the top of the list. Per-member. */
  app.post('/v1/chats/:id/pin', { preHandler: [app.requireAuth] }, async (req) => {
    const { id } = IdParam.parse(req.params);
    const rows = await sql<Array<{ is_pinned: boolean }>>`
      UPDATE conversation_members SET is_pinned = NOT is_pinned
      WHERE conversation_id = ${id} AND account_id = ${req.accountId}
      RETURNING is_pinned
    `;
    if (rows.length === 0) throw new HttpError(403, 'NOT_A_MEMBER');
    return { pinned: rows[0]!.is_pinned };
  });

  /**
   * Delete a chat — for me only. History up to now disappears from my
   * view (cleared_at watermark) and the thread leaves my list
   * (is_archived) until someone writes again. The other member's copy
   * is untouched; a shared thread is not mine to erase for them.
   */
  app.delete('/v1/chats/:id', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const rows = await sql`
      UPDATE conversation_members
      SET is_archived = true, is_pinned = false,
          cleared_at = now(), last_read_at = now()
      WHERE conversation_id = ${id} AND account_id = ${req.accountId}
      RETURNING 1
    `;
    if (rows.length === 0) throw new HttpError(403, 'NOT_A_MEMBER');
    reply.code(204);
  });

  app.post('/v1/chats/:id/read', { preHandler: [app.requireAuth] }, async (req) => {
    const { id } = IdParam.parse(req.params);
    await sql`
      UPDATE conversation_members SET last_read_at = now()
      WHERE conversation_id = ${id} AND account_id = ${req.accountId}
    `;
    return { ok: true };
  });

  app.post('/v1/chats/:id/typing', { preHandler: [app.requireAuth] }, async (req) => {
    const { id } = IdParam.parse(req.params);
    await memberOr403(id, req.accountId!);
    try { await redis.set(`typing:${id}:${req.accountId}`, '1', 'EX', 4); } catch { /* fine */ }
    return { ok: true };
  });

  app.patch('/v1/messages/:id', { preHandler: [app.requireAuth] }, async (req) => {
    const mid = z.coerce.number().int().parse((req.params as { id: string }).id);
    const { body } = z.object({ body: z.string().trim().min(1).max(4000) }).parse(req.body);
    const rows = await sql`
      UPDATE messages SET body = ${body}, edited_at = now()
      WHERE id = ${mid} AND sender_id = ${req.accountId}
        AND deleted_at IS NULL AND kind = 'text'
      RETURNING id
    `;
    if (rows.length === 0) throw new HttpError(404, 'MESSAGE_NOT_FOUND');
    return { ok: true };
  });

  /** Soft delete: the bubble stays as "deleted" so threads keep shape. */
  app.delete('/v1/messages/:id', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const mid = z.coerce.number().int().parse((req.params as { id: string }).id);
    const rows = await sql`
      UPDATE messages SET deleted_at = now(), body = NULL, media_id = NULL
      WHERE id = ${mid} AND sender_id = ${req.accountId} AND deleted_at IS NULL
      RETURNING id
    `;
    if (rows.length === 0) throw new HttpError(404, 'MESSAGE_NOT_FOUND');
    reply.code(204);
  });

  app.post('/v1/messages/:id/react', { preHandler: [app.requireAuth] }, async (req) => {
    const mid = z.coerce.number().int().parse((req.params as { id: string }).id);
    const { emoji } = z.object({ emoji: z.string().min(1).max(8) }).parse(req.body);
    const me = req.accountId!;

    const [msg] = await sql<Array<{ conversation_id: string }>>`
      SELECT conversation_id FROM messages WHERE id = ${mid} AND deleted_at IS NULL
    `;
    if (!msg) throw new HttpError(404, 'MESSAGE_NOT_FOUND');
    await memberOr403(msg.conversation_id, me);

    // Same emoji again removes it; a different one replaces it.
    const removed = await sql`
      DELETE FROM message_reactions
      WHERE message_id = ${mid} AND account_id = ${me} AND emoji = ${emoji}
      RETURNING 1
    `;
    if (removed.length === 0) {
      await sql`
        INSERT INTO message_reactions (message_id, account_id, emoji)
        VALUES (${mid}, ${me}, ${emoji})
        ON CONFLICT (message_id, account_id)
        DO UPDATE SET emoji = ${emoji}, created_at = now()
      `;
    }
    return { ok: true };
  });
};

export default chatRoutes;
