import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { sql } from '../lib/db.js';
import { HttpError } from '../lib/errors.js';
import { notify } from '../lib/notify.js';

/**
 * The social graph: woofs, follows, friendships, comments.
 *
 * These are the actions every leaderboard and half the achievements read
 * from. Without them the rest of the app has nothing to count.
 */

const IdParam = z.object({ id: z.string().uuid() });

async function assertNotBlocked(a: string, b: string) {
  const rows = await sql`
    SELECT 1 FROM blocks
    WHERE (blocker_id = ${a} AND blocked_id = ${b})
       OR (blocker_id = ${b} AND blocked_id = ${a})
  `;
  if (rows.length > 0) throw new HttpError(403, 'BLOCKED');
}

const socialRoutes: FastifyPluginAsync = async (app) => {
  /**
   * Woof. One per pair per UTC day, enforced by a unique index — the
   * catch on 23505 turns the race into an idempotent success rather than
   * an error the user has to understand.
   */
  app.post('/v1/users/:id/woof', { preHandler: [app.requireAuth] }, async (req) => {
    const { id } = IdParam.parse(req.params);
    const me = req.accountId!;
    if (id === me) throw new HttpError(400, 'CANNOT_WOOF_SELF');
    await assertNotBlocked(me, id);

    /**
     * One woof per pair per 12 hours. The window is checked and the row
     * inserted in one transaction, and the SELECT takes a lock on the
     * pair so two simultaneous taps cannot both pass the check.
     */
    const result = await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(hashtextextended(${me + ':' + id}, 7))`;

      const [recent] = await tx<Array<{ next_at: string }>>`
        SELECT (created_at + interval '12 hours') AS next_at
        FROM woofs
        WHERE sender_id = ${me} AND target_id = ${id}
          AND created_at > now() - interval '12 hours'
        ORDER BY created_at DESC LIMIT 1
      `;
      if (recent) return { cooling: true, next_at: recent.next_at };

      await tx`INSERT INTO woofs (sender_id, target_id) VALUES (${me}, ${id})`;
      await notify(tx, { accountId: id, actorId: me, kind: 'woof' });
      return { cooling: false, next_at: null };
    });

    if (result.cooling) {
      throw new HttpError(429, 'WOOF_COOLDOWN',
        'You can woof this person again in a few hours');
    }

    const [count] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM woofs WHERE target_id = ${id}
    `;
    return { ok: true, total_woofs: count?.n ?? 0 };
  });

  app.post('/v1/users/:id/follow', { preHandler: [app.requireAuth] }, async (req) => {
    const { id } = IdParam.parse(req.params);
    const me = req.accountId!;
    if (id === me) throw new HttpError(400, 'CANNOT_FOLLOW_SELF');
    await assertNotBlocked(me, id);

    const following = await sql.begin(async (tx) => {
      const removed = await tx`
        DELETE FROM follows WHERE follower_id = ${me} AND followee_id = ${id} RETURNING 1
      `;
      if (removed.length > 0) return false;
      await tx`INSERT INTO follows (follower_id, followee_id) VALUES (${me}, ${id})`;
      await notify(tx, { accountId: id, actorId: me, kind: 'follow' });
      return true;
    });

    return { following };
  });

  app.post('/v1/users/:id/friend', { preHandler: [app.requireAuth] }, async (req) => {
    const { id } = IdParam.parse(req.params);
    const me = req.accountId!;
    if (id === me) throw new HttpError(400, 'CANNOT_FRIEND_SELF');
    await assertNotBlocked(me, id);

    const state = await sql.begin(async (tx) => {
      // If they already asked us, this is an accept rather than a request.
      const incoming = await tx`
        UPDATE friendships SET accepted_at = now()
        WHERE requester_id = ${id} AND addressee_id = ${me} AND accepted_at IS NULL
        RETURNING 1
      `;
      if (incoming.length > 0) {
        await notify(tx, { accountId: id, actorId: me, kind: 'friend_accepted' });
        return 'accepted';
      }

      const existing = await tx`
        SELECT accepted_at FROM friendships
        WHERE (requester_id = ${me} AND addressee_id = ${id})
      `;
      if (existing.length > 0) return 'pending';

      await tx`
        INSERT INTO friendships (requester_id, addressee_id) VALUES (${me}, ${id})
        ON CONFLICT DO NOTHING
      `;
      await notify(tx, { accountId: id, actorId: me, kind: 'friend_request' });
      return 'requested';
    });

    return { state };
  });

  app.delete('/v1/users/:id/friend', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const me = req.accountId!;
    await sql`
      DELETE FROM friendships
      WHERE (requester_id = ${me} AND addressee_id = ${id})
         OR (requester_id = ${id} AND addressee_id = ${me})
    `;
    reply.code(204);
  });

  app.post('/v1/users/:id/block', { preHandler: [app.requireAuth] }, async (req) => {
    const { id } = IdParam.parse(req.params);
    const me = req.accountId!;
    if (id === me) throw new HttpError(400, 'CANNOT_BLOCK_SELF');

    // Blocking severs the graph both ways; leaving a stale follow would
    // keep the blocked person's posts in the blocker's feed.
    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO blocks (blocker_id, blocked_id) VALUES (${me}, ${id})
        ON CONFLICT DO NOTHING
      `;
      await tx`
        DELETE FROM follows
        WHERE (follower_id = ${me} AND followee_id = ${id})
           OR (follower_id = ${id} AND followee_id = ${me})
      `;
      await tx`
        DELETE FROM friendships
        WHERE (requester_id = ${me} AND addressee_id = ${id})
           OR (requester_id = ${id} AND addressee_id = ${me})
      `;
    });
    return { ok: true };
  });

  /**
   * Who follows this person, and who they follow.
   *
   * Each row carries `i_follow` so the list can offer Follow / Following
   * inline — without it the client would need a second request per row
   * just to label a button. Blocked people are omitted in both
   * directions, same as everywhere else.
   */
  const FollowListQuery = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).max(5000).default(0),
  });

  const followList = async (
    direction: 'followers' | 'following',
    targetId: string,
    me: string,
    limit: number,
    offset: number,
  ) => {
    const rows = direction === 'followers'
      ? await sql`
          SELECT p.account_id, p.display_name, p.handle,
                 (p.verification = 'approved') AS verified,
                 (SELECT ph.media_id FROM profile_photos ph
                  WHERE ph.account_id = p.account_id AND ph.position = 0
                    AND NOT ph.is_private AND ph.media_id IS NOT NULL
                  LIMIT 1) AS avatar_media_id,
                 EXISTS (SELECT 1 FROM follows f2
                         WHERE f2.follower_id = ${me}
                           AND f2.followee_id = p.account_id) AS i_follow
          FROM follows f
          JOIN profiles p ON p.account_id = f.follower_id
          JOIN accounts a ON a.id = p.account_id AND a.status = 'active'
          WHERE f.followee_id = ${targetId}
            AND NOT p.ghost_mode
            AND NOT EXISTS (
              SELECT 1 FROM blocks b
              WHERE (b.blocker_id = ${me} AND b.blocked_id = p.account_id)
                 OR (b.blocker_id = p.account_id AND b.blocked_id = ${me})
            )
          ORDER BY f.created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `
      : await sql`
          SELECT p.account_id, p.display_name, p.handle,
                 (p.verification = 'approved') AS verified,
                 (SELECT ph.media_id FROM profile_photos ph
                  WHERE ph.account_id = p.account_id AND ph.position = 0
                    AND NOT ph.is_private AND ph.media_id IS NOT NULL
                  LIMIT 1) AS avatar_media_id,
                 EXISTS (SELECT 1 FROM follows f2
                         WHERE f2.follower_id = ${me}
                           AND f2.followee_id = p.account_id) AS i_follow
          FROM follows f
          JOIN profiles p ON p.account_id = f.followee_id
          JOIN accounts a ON a.id = p.account_id AND a.status = 'active'
          WHERE f.follower_id = ${targetId}
            AND NOT p.ghost_mode
            AND NOT EXISTS (
              SELECT 1 FROM blocks b
              WHERE (b.blocker_id = ${me} AND b.blocked_id = p.account_id)
                 OR (b.blocker_id = p.account_id AND b.blocked_id = ${me})
            )
          ORDER BY f.created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `;
    return { people: rows, has_more: rows.length === limit };
  };

  app.get('/v1/users/:id/followers', { preHandler: [app.requireAuth] }, async (req) => {
    const raw = (req.params as { id: string }).id;
    const id = raw === 'me' ? req.accountId! : IdParam.parse(req.params).id;
    const { limit, offset } = FollowListQuery.parse(req.query);
    return followList('followers', id, req.accountId!, limit, offset);
  });

  app.get('/v1/users/:id/following', { preHandler: [app.requireAuth] }, async (req) => {
    const raw = (req.params as { id: string }).id;
    const id = raw === 'me' ? req.accountId! : IdParam.parse(req.params).id;
    const { limit, offset } = FollowListQuery.parse(req.query);
    return followList('following', id, req.accountId!, limit, offset);
  });

  app.post('/v1/report', { preHandler: [app.requireAuth] }, async (req) => {
    const body = z.object({
      subject_type: z.enum(['account', 'post', 'comment', 'message', 'story']),
      subject_id: z.string().max(64),
      reason: z.string().trim().min(1).max(80),
      details: z.string().trim().max(1000).optional(),
    }).parse(req.body);

    await sql`
      INSERT INTO reports (reporter_id, subject_type, subject_id, reason, details)
      VALUES (${req.accountId}, ${body.subject_type}, ${body.subject_id},
              ${body.reason}, ${body.details ?? null})
    `;
    return { ok: true };
  });

  // ---- comments ----

  app.get('/v1/posts/:id/comments', { preHandler: [app.requireAuth] }, async (req) => {
    const { id } = IdParam.parse(req.params);
    const rows = await sql`
      SELECT c.id, c.body, c.created_at, c.author_id,
             p.display_name AS author_name, p.handle AS author_handle,
             (p.verification = 'approved') AS author_verified,
             (SELECT ph.media_id FROM profile_photos ph
              WHERE ph.account_id = c.author_id AND ph.position = 0
                AND NOT ph.is_private AND ph.media_id IS NOT NULL
              LIMIT 1) AS author_avatar_media_id
      FROM comments c
      JOIN profiles p ON p.account_id = c.author_id
      WHERE c.post_id = ${id} AND c.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM blocks b
          WHERE (b.blocker_id = ${req.accountId} AND b.blocked_id = c.author_id)
             OR (b.blocker_id = c.author_id AND b.blocked_id = ${req.accountId})
        )
      ORDER BY c.created_at
      LIMIT 100
    `;
    return { comments: rows };
  });

  app.post('/v1/posts/:id/comments', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const { body } = z.object({ body: z.string().trim().min(1).max(1000) }).parse(req.body);

    const comment = await sql.begin(async (tx) => {
      const [post] = await tx<{ author_id: string }[]>`
        SELECT author_id FROM posts WHERE id = ${id} AND deleted_at IS NULL
      `;
      if (!post) throw new HttpError(404, 'POST_NOT_FOUND');

      const [created] = await tx`
        INSERT INTO comments (post_id, author_id, body)
        VALUES (${id}, ${req.accountId}, ${body})
        RETURNING id, body, created_at
      `;
      await tx`UPDATE posts SET comment_count = comment_count + 1 WHERE id = ${id}`;
      await notify(tx, {
        accountId: post.author_id, actorId: req.accountId!, kind: 'comment',
        payload: { post_id: id },
      });
      return created;
    });

    reply.code(201);
    return comment;
  });

  app.delete('/v1/comments/:id', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    await sql.begin(async (tx) => {
      const [c] = await tx<{ post_id: string }[]>`
        UPDATE comments SET deleted_at = now()
        WHERE id = ${id} AND author_id = ${req.accountId} AND deleted_at IS NULL
        RETURNING post_id
      `;
      if (!c) throw new HttpError(404, 'COMMENT_NOT_FOUND');
      await tx`
        UPDATE posts SET comment_count = GREATEST(0, comment_count - 1) WHERE id = ${c.post_id}
      `;
    });
    reply.code(204);
  });
};

export default socialRoutes;
