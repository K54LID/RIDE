import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { sql } from '../lib/db.js';
import { HttpError } from '../lib/errors.js';

/**
 * Text posts only for now — media needs object storage, which isn't
 * configured. The `media` array is already in the response shape so the
 * client doesn't need reworking when uploads land.
 */

const CreateSchema = z.object({
  body: z.string().trim().min(1).max(2000),
  visibility: z.enum(['public', 'followers', 'friends', 'private']).default('public'),
  place_name: z.string().trim().max(120).optional(),
});

const postRoutes: FastifyPluginAsync = async (app) => {
  app.post('/v1/posts', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const parsed = CreateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'INVALID_BODY', parsed.error.issues[0]?.message);
    }
    const { body, visibility, place_name } = parsed.data;

    const [post] = await sql`
      INSERT INTO posts (author_id, kind, body, visibility, place_name)
      VALUES (${req.accountId}, ${place_name ? 'checkin' : 'text'},
              ${body}, ${visibility}, ${place_name ?? null})
      RETURNING id, body, visibility::text AS visibility, place_name, created_at
    `;
    reply.code(201);
    return post;
  });

  /**
   * Feed: own posts plus public posts from people followed. Keyset
   * pagination on created_at — OFFSET degrades badly once a feed grows,
   * and this is the query that will be hit most often in the app.
   */
  app.get('/v1/feed', { preHandler: [app.requireAuth] }, async (req) => {
    const before = (req.query as { before?: string }).before;
    const cursor = before ? new Date(before) : null;

    const rows = await sql`
      SELECT p.id, p.body, p.kind::text AS kind, p.place_name,
             p.like_count, p.comment_count, p.created_at,
             pr.display_name AS author_name,
             pr.handle       AS author_handle,
             pr.court_value  AS author_court_value,
             (pr.verification = 'approved') AS author_verified,
             EXISTS (
               SELECT 1 FROM post_likes pl
               WHERE pl.post_id = p.id AND pl.account_id = ${req.accountId}
             ) AS liked
      FROM posts p
      JOIN profiles pr ON pr.account_id = p.author_id
      WHERE p.deleted_at IS NULL
        AND (
          p.author_id = ${req.accountId}
          OR (p.visibility = 'public' AND EXISTS (
                SELECT 1 FROM follows f
                WHERE f.follower_id = ${req.accountId} AND f.followee_id = p.author_id
             ))
        )
        AND NOT EXISTS (
          SELECT 1 FROM blocks b
          WHERE (b.blocker_id = ${req.accountId} AND b.blocked_id = p.author_id)
             OR (b.blocker_id = p.author_id AND b.blocked_id = ${req.accountId})
        )
        ${cursor ? sql`AND p.created_at < ${cursor}` : sql``}
      ORDER BY p.created_at DESC
      LIMIT 20
    `;

    return {
      posts: rows.map((r) => ({ ...r, media: [] })),
      next_cursor: rows.length === 20 ? rows[rows.length - 1]!.created_at : null,
    };
  });

  app.post('/v1/posts/:id/like', { preHandler: [app.requireAuth] }, async (req) => {
    const { id } = req.params as { id: string };

    // Toggle, counted in one transaction so like_count can't drift.
    const liked = await sql.begin(async (tx) => {
      const removed = await tx`
        DELETE FROM post_likes
        WHERE post_id = ${id} AND account_id = ${req.accountId}
        RETURNING 1
      `;
      if (removed.length > 0) {
        await tx`UPDATE posts SET like_count = GREATEST(0, like_count - 1) WHERE id = ${id}`;
        return false;
      }
      await tx`
        INSERT INTO post_likes (post_id, account_id) VALUES (${id}, ${req.accountId})
      `;
      await tx`UPDATE posts SET like_count = like_count + 1 WHERE id = ${id}`;
      return true;
    });

    return { liked };
  });

  app.delete('/v1/posts/:id', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const rows = await sql`
      UPDATE posts SET deleted_at = now()
      WHERE id = ${id} AND author_id = ${req.accountId} AND deleted_at IS NULL
      RETURNING id
    `;
    if (rows.length === 0) throw new HttpError(404, 'POST_NOT_FOUND');
    reply.code(204);
  });
};

export default postRoutes;
