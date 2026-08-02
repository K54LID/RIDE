import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { sql } from '../lib/db.js';
import { HttpError } from '../lib/errors.js';
import { notify } from '../lib/notify.js';

/**
 * Stories: 24-hour media, viewer tracking, woof reactions, replies.
 *
 * Expiry is a WHERE clause, not a cron — a story past expires_at simply
 * stops matching. Rows age out of relevance instantly and can be
 * garbage-collected any time later without a correctness deadline.
 */

const IdParam = z.object({ id: z.string().uuid() });

const storyRoutes: FastifyPluginAsync = async (app) => {
  app.post('/v1/stories', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const { media_id } = z.object({ media_id: z.string().uuid() }).parse(req.body);

    const story = await sql.begin(async (tx) => {
      const [media] = await tx<Array<{ kind: string }>>`
        SELECT kind::text AS kind FROM media
        WHERE id = ${media_id} AND owner_id = ${req.accountId}
      `;
      if (!media) throw new HttpError(400, 'MEDIA_NOT_OWNED');

      const [created] = await tx<Array<{ id: string; expires_at: string }>>`
        INSERT INTO stories (author_id, kind, media_id, storage_key)
        VALUES (${req.accountId}, ${media.kind}, ${media_id}, NULL)
        RETURNING id, expires_at
      `;
      return created!;
    });

    reply.code(201);
    return story;
  });

  /**
   * The rail: me first, then every member with live stories, unseen
   * before seen. Stories are visible app-wide by default — the old
   * follows gate meant a fresh account saw nobody's stories and
   * nobody saw theirs. The author's story_visibility setting is the
   * boundary now: 'everyone'/'members' shows to all members, 'friends'
   * needs an accepted friendship, 'nobody' keeps them to the author.
   * One aggregate query — the rail renders on every Home load and
   * cannot afford N+1.
   */
  app.get('/v1/stories', { preHandler: [app.requireAuth] }, async (req) => {
    const me = req.accountId!;
    const rows = await sql`
      SELECT s.author_id,
             p.display_name,
             p.handle,
             count(*)::int AS story_count,
             count(*) FILTER (WHERE v.viewer_id IS NULL)::int AS unseen_count,
             max(s.created_at) AS latest_at,
             (SELECT ph.media_id FROM profile_photos ph
              WHERE ph.account_id = s.author_id 
                AND NOT ph.is_private AND ph.media_id IS NOT NULL
              ORDER BY ph.position LIMIT 1) AS avatar_media_id
      FROM stories s
      JOIN profiles p ON p.account_id = s.author_id
      LEFT JOIN user_settings st ON st.account_id = s.author_id
      LEFT JOIN story_views v ON v.story_id = s.id AND v.viewer_id = ${me}
      WHERE s.expires_at > now()
        AND (
          s.author_id = ${me}
          OR COALESCE(st.story_visibility, 'everyone') IN ('everyone', 'members')
          OR (COALESCE(st.story_visibility, 'everyone') = 'friends' AND EXISTS (
                SELECT 1 FROM friendships fr
                WHERE fr.accepted_at IS NOT NULL
                  AND ((fr.requester_id = ${me} AND fr.addressee_id = s.author_id)
                    OR (fr.requester_id = s.author_id AND fr.addressee_id = ${me}))
             ))
        )
        AND NOT EXISTS (
          SELECT 1 FROM blocks b
          WHERE (b.blocker_id = ${me} AND b.blocked_id = s.author_id)
             OR (b.blocker_id = s.author_id AND b.blocked_id = ${me})
        )
      GROUP BY s.author_id, p.display_name, p.handle, st.story_visibility
      ORDER BY (s.author_id = ${me}) DESC,
               (count(*) FILTER (WHERE v.viewer_id IS NULL) > 0) DESC,
               max(s.created_at) DESC
    `;
    return { authors: rows };
  });

  /**
   * One author's live stories, oldest first — the viewing order.
   * Mirrors the rail's visibility rules; the rail hiding an author is
   * not protection if this endpoint hands their stories to anyone with
   * the id.
   */
  app.get('/v1/stories/author/:id', { preHandler: [app.requireAuth] }, async (req) => {
    const { id } = IdParam.parse(req.params);
    const me = req.accountId!;
    const rows = await sql`
      SELECT s.id, s.kind::text AS kind, s.media_id, s.created_at,
             (v.viewer_id IS NOT NULL) AS seen,
             (SELECT count(*)::int FROM story_views sv WHERE sv.story_id = s.id) AS view_count,
             (SELECT count(*)::int FROM story_reactions sr WHERE sr.story_id = s.id) AS reaction_count,
             (SELECT count(*)::int FROM story_replies rp WHERE rp.story_id = s.id) AS reply_count
      FROM stories s
      LEFT JOIN user_settings st ON st.account_id = s.author_id
      LEFT JOIN story_views v ON v.story_id = s.id AND v.viewer_id = ${me}
      WHERE s.author_id = ${id} AND s.expires_at > now()
        AND (
          s.author_id = ${me}
          OR COALESCE(st.story_visibility, 'everyone') IN ('everyone', 'members')
          OR (COALESCE(st.story_visibility, 'everyone') = 'friends' AND EXISTS (
                SELECT 1 FROM friendships fr
                WHERE fr.accepted_at IS NOT NULL
                  AND ((fr.requester_id = ${me} AND fr.addressee_id = s.author_id)
                    OR (fr.requester_id = s.author_id AND fr.addressee_id = ${me}))
             ))
        )
        AND NOT EXISTS (
          SELECT 1 FROM blocks b
          WHERE (b.blocker_id = ${me} AND b.blocked_id = s.author_id)
             OR (b.blocker_id = s.author_id AND b.blocked_id = ${me})
        )
      ORDER BY s.created_at
    `;
    return { stories: rows };
  });

  app.post('/v1/stories/:id/view', { preHandler: [app.requireAuth] }, async (req) => {
    const { id } = IdParam.parse(req.params);
    await sql`
      INSERT INTO story_views (story_id, viewer_id) VALUES (${id}, ${req.accountId})
      ON CONFLICT DO NOTHING
    `;
    return { ok: true };
  });

  app.post('/v1/stories/:id/react', { preHandler: [app.requireAuth] }, async (req) => {
    const { id } = IdParam.parse(req.params);
    const me = req.accountId!;

    await sql.begin(async (tx) => {
      const [story] = await tx<Array<{ author_id: string }>>`
        SELECT author_id FROM stories WHERE id = ${id} AND expires_at > now()
      `;
      if (!story) throw new HttpError(404, 'STORY_GONE');

      const inserted = await tx`
        INSERT INTO story_reactions (story_id, account_id) VALUES (${id}, ${me})
        ON CONFLICT DO NOTHING RETURNING story_id
      `;
      if (inserted.length > 0) {
        await notify(tx, { accountId: story.author_id, actorId: me, kind: 'woof',
                           payload: { story_id: id } });
      }
    });
    return { ok: true };
  });

  app.post('/v1/stories/:id/reply', { preHandler: [app.requireAuth] }, async (req) => {
    const { id } = IdParam.parse(req.params);
    const { body } = z.object({ body: z.string().trim().min(1).max(500) }).parse(req.body);
    const me = req.accountId!;

    const conversationId = await sql.begin(async (tx) => {
      const [story] = await tx<Array<{ author_id: string }>>`
        SELECT author_id FROM stories WHERE id = ${id} AND expires_at > now()
      `;
      if (!story) throw new HttpError(404, 'STORY_GONE');
      if (story.author_id === me) throw new HttpError(400, 'CANNOT_REPLY_SELF');

      const blocked = await tx`
        SELECT 1 FROM blocks
        WHERE (blocker_id = ${me} AND blocked_id = ${story.author_id})
           OR (blocker_id = ${story.author_id} AND blocked_id = ${me})
      `;
      if (blocked.length > 0) throw new HttpError(403, 'BLOCKED');

      await tx`
        INSERT INTO story_replies (story_id, sender_id, body)
        VALUES (${id}, ${me}, ${body})
      `;

      /**
       * Replying to a story is the start of a conversation, so it now
       * lands in the private chat as a real message tagged with the
       * story it answers. Previously it only produced a notification
       * and a line in the author's viewer panel — there was nothing to
       * reply back to.
       *
       * Reuses the existing 1:1 conversation if there is one, exactly
       * as /v1/chats/open does, so a story reply doesn't fork a second
       * thread with the same person.
       */
      const [existing] = await tx<Array<{ id: string }>>`
        SELECT cm.conversation_id AS id
        FROM conversation_members cm
        JOIN conversation_members other
          ON other.conversation_id = cm.conversation_id
         AND other.account_id = ${story.author_id}
        WHERE cm.account_id = ${me}
          AND (SELECT count(*) FROM conversation_members x
               WHERE x.conversation_id = cm.conversation_id) = 2
        LIMIT 1
      `;

      let convId = existing?.id;
      if (!convId) {
        const [created] = await tx<Array<{ id: string }>>`
          INSERT INTO conversations DEFAULT VALUES RETURNING id
        `;
        convId = created!.id;
        await tx`
          INSERT INTO conversation_members (conversation_id, account_id)
          VALUES (${convId}, ${me}), (${convId}, ${story.author_id})
        `;
      } else {
        // A reply resurfaces a thread either side had cleared.
        await tx`
          UPDATE conversation_members SET is_archived = false
          WHERE conversation_id = ${convId} AND is_archived
        `;
      }

      await tx`
        INSERT INTO messages (conversation_id, sender_id, kind, body, story_id)
        VALUES (${convId}, ${me}, 'text', ${body}, ${id})
      `;
      await tx`UPDATE conversations SET last_message_at = now() WHERE id = ${convId}`;

      await notify(tx, { accountId: story.author_id, actorId: me, kind: 'story_reply',
                         payload: { story_id: id, conversation_id: convId } });
      return convId;
    });

    return { ok: true, conversation_id: conversationId };
  });

  /** Author only: who watched, who woofed, what they said. */
  app.get('/v1/stories/:id/viewers', { preHandler: [app.requireAuth] }, async (req) => {
    const { id } = IdParam.parse(req.params);
    const me = req.accountId!;

    const [story] = await sql<Array<{ author_id: string }>>`
      SELECT author_id FROM stories WHERE id = ${id}
    `;
    if (!story) throw new HttpError(404, 'STORY_GONE');
    if (story.author_id !== me) throw new HttpError(403, 'NOT_YOUR_STORY');

    const viewers = await sql`
      SELECT v.viewer_id, v.viewed_at, p.display_name, p.handle,
             (SELECT ph.media_id FROM profile_photos ph
              WHERE ph.account_id = v.viewer_id 
                AND NOT ph.is_private AND ph.media_id IS NOT NULL
              ORDER BY ph.position LIMIT 1) AS avatar_media_id,
             (r.account_id IS NOT NULL) AS woofed
      FROM story_views v
      JOIN profiles p ON p.account_id = v.viewer_id
      LEFT JOIN story_reactions r ON r.story_id = v.story_id AND r.account_id = v.viewer_id
      WHERE v.story_id = ${id}
      ORDER BY v.viewed_at DESC
      LIMIT 200
    `;
    const replies = await sql`
      SELECT rp.body, rp.created_at, p.display_name, p.handle, rp.sender_id,
             (SELECT ph.media_id FROM profile_photos ph
              WHERE ph.account_id = rp.sender_id 
                AND NOT ph.is_private AND ph.media_id IS NOT NULL
              ORDER BY ph.position LIMIT 1) AS avatar_media_id
      FROM story_replies rp
      JOIN profiles p ON p.account_id = rp.sender_id
      WHERE rp.story_id = ${id}
      ORDER BY rp.id DESC
      LIMIT 100
    `;
    return { viewers, replies };
  });

  app.delete('/v1/stories/:id', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const rows = await sql`
      DELETE FROM stories WHERE id = ${id} AND author_id = ${req.accountId} RETURNING id
    `;
    if (rows.length === 0) throw new HttpError(404, 'STORY_GONE');
    reply.code(204);
  });
};

export default storyRoutes;
