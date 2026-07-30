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
   * The rail: me first, then people I follow with live stories, unseen
   * before seen. One aggregate query — the rail renders on every Home
   * load and cannot afford N+1.
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
              WHERE ph.account_id = s.author_id AND ph.position = 0
                AND NOT ph.is_private AND ph.media_id IS NOT NULL
              LIMIT 1) AS avatar_media_id
      FROM stories s
      JOIN profiles p ON p.account_id = s.author_id
      LEFT JOIN story_views v ON v.story_id = s.id AND v.viewer_id = ${me}
      WHERE s.expires_at > now()
        AND (
          s.author_id = ${me}
          OR EXISTS (SELECT 1 FROM follows f
                     WHERE f.follower_id = ${me} AND f.followee_id = s.author_id)
        )
        AND NOT EXISTS (
          SELECT 1 FROM blocks b
          WHERE (b.blocker_id = ${me} AND b.blocked_id = s.author_id)
             OR (b.blocker_id = s.author_id AND b.blocked_id = ${me})
        )
      GROUP BY s.author_id, p.display_name, p.handle
      ORDER BY (s.author_id = ${me}) DESC,
               (count(*) FILTER (WHERE v.viewer_id IS NULL) > 0) DESC,
               max(s.created_at) DESC
    `;
    return { authors: rows };
  });

  /** One author's live stories, oldest first — the viewing order. */
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
      LEFT JOIN story_views v ON v.story_id = s.id AND v.viewer_id = ${me}
      WHERE s.author_id = ${id} AND s.expires_at > now()
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

    await sql.begin(async (tx) => {
      const [story] = await tx<Array<{ author_id: string }>>`
        SELECT author_id FROM stories WHERE id = ${id} AND expires_at > now()
      `;
      if (!story) throw new HttpError(404, 'STORY_GONE');
      if (story.author_id === me) throw new HttpError(400, 'CANNOT_REPLY_SELF');

      await tx`
        INSERT INTO story_replies (story_id, sender_id, body)
        VALUES (${id}, ${me}, ${body})
      `;
      await notify(tx, { accountId: story.author_id, actorId: me, kind: 'story_reply',
                         payload: { story_id: id } });
    });
    return { ok: true };
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
             (r.account_id IS NOT NULL) AS woofed
      FROM story_views v
      JOIN profiles p ON p.account_id = v.viewer_id
      LEFT JOIN story_reactions r ON r.story_id = v.story_id AND r.account_id = v.viewer_id
      WHERE v.story_id = ${id}
      ORDER BY v.viewed_at DESC
      LIMIT 200
    `;
    const replies = await sql`
      SELECT rp.body, rp.created_at, p.display_name, p.handle
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
