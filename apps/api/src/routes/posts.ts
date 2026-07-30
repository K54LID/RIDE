import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { sql } from '../lib/db.js';
import { HttpError } from '../lib/errors.js';
import { notify } from '../lib/notify.js';

/**
 * Text posts only for now — media needs object storage, which isn't
 * configured. The `media` array is already in the response shape so the
 * client doesn't need reworking when uploads land.
 */

const CreateSchema = z.object({
  body: z.string().trim().max(2000).optional(),
  media_ids: z.array(z.string().uuid()).max(10).optional(),
  visibility: z.enum(['public', 'followers', 'friends', 'private']).default('public'),
  place_name: z.string().trim().max(120).optional(),
}).refine((v) => (v.body && v.body.length > 0) || (v.media_ids && v.media_ids.length > 0), {
  message: 'A post needs text or media',
});

const EditSchema = z.object({
  body: z.string().trim().max(2000),
});

const postRoutes: FastifyPluginAsync = async (app) => {
  app.post('/v1/posts', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const parsed = CreateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'INVALID_BODY', parsed.error.issues[0]?.message);
    }
    const { body, media_ids, visibility, place_name } = parsed.data;

    const post = await sql.begin(async (tx) => {
      const kind = media_ids && media_ids.length > 0 ? 'media'
                 : place_name ? 'checkin' : 'text';
      const [created] = await tx<Array<{ id: string }>>`
        INSERT INTO posts (author_id, kind, body, visibility, place_name)
        VALUES (${req.accountId}, ${kind}, ${body ?? null}, ${visibility}, ${place_name ?? null})
        RETURNING id
      `;

      if (media_ids && media_ids.length > 0) {
        // Ownership check inside the transaction: attaching someone
        // else's upload to your post would otherwise be trivial.
        const owned = await tx<Array<{ id: string; kind: string }>>`
          SELECT id, kind::text AS kind FROM media
          WHERE id = ANY(${media_ids}) AND owner_id = ${req.accountId}
        `;
        if (owned.length !== media_ids.length) {
          throw new HttpError(400, 'MEDIA_NOT_OWNED');
        }
        for (const [i, mid] of media_ids.entries()) {
          const m = owned.find((o) => o.id === mid)!;
          await tx`
            INSERT INTO post_media (post_id, media_id, kind, position)
            VALUES (${created!.id}, ${mid}, ${m.kind}, ${i})
          `;
        }
      }
      return created!;
    });

    reply.code(201);
    return { id: post.id };
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
      SELECT p.id, p.author_id, p.body, p.kind::text AS kind, p.place_name,
             p.like_count, p.comment_count, p.created_at,
             pr.display_name AS author_name,
             pr.handle       AS author_handle,
             pr.court_value  AS author_court_value,
             (pr.verification = 'approved') AS author_verified,
             EXISTS (
               SELECT 1 FROM post_likes pl
               WHERE pl.post_id = p.id AND pl.account_id = ${req.accountId}
             ) AS liked,
             EXISTS (
               SELECT 1 FROM saved_posts sp
               WHERE sp.post_id = p.id AND sp.account_id = ${req.accountId}
             ) AS saved
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

    const ids = rows.map((r) => r.id as string);
    const media = ids.length
      ? await sql<Array<{ post_id: string; media_id: string; kind: string; position: number }>>`
          SELECT post_id, media_id, kind::text AS kind, position
          FROM post_media
          WHERE post_id = ANY(${ids}) AND media_id IS NOT NULL
          ORDER BY position
        `
      : [];

    const byPost = new Map<string, Array<{ id: string; kind: string; url: string }>>();
    for (const m of media) {
      const list = byPost.get(m.post_id) ?? [];
      list.push({ id: m.media_id, kind: m.kind, url: `/v1/media/${m.media_id}` });
      byPost.set(m.post_id, list);
    }

    return {
      posts: rows.map((r) => ({ ...r, media: byPost.get(r.id as string) ?? [] })),
      next_cursor: rows.length === 20 ? rows[rows.length - 1]!.created_at : null,
    };
  });

  /** Bookmark toggle. Private to the saver; the author never knows. */
  app.post('/v1/posts/:id/save', { preHandler: [app.requireAuth] }, async (req) => {
    const { id } = req.params as { id: string };
    const removed = await sql`
      DELETE FROM saved_posts
      WHERE post_id = ${id} AND account_id = ${req.accountId} RETURNING 1
    `;
    if (removed.length > 0) return { saved: false };
    await sql`
      INSERT INTO saved_posts (account_id, post_id) VALUES (${req.accountId}, ${id})
      ON CONFLICT DO NOTHING
    `;
    return { saved: true };
  });

  app.get('/v1/saved', { preHandler: [app.requireAuth] }, async (req) => {
    const rows = await sql`
      SELECT p.id, p.author_id, p.body, p.kind::text AS kind, p.place_name,
             p.like_count, p.comment_count, p.created_at,
             pr.display_name AS author_name,
             pr.handle       AS author_handle,
             pr.court_value  AS author_court_value,
             (pr.verification = 'approved') AS author_verified,
             true AS saved,
             EXISTS (SELECT 1 FROM post_likes pl
                     WHERE pl.post_id = p.id AND pl.account_id = ${req.accountId}) AS liked
      FROM saved_posts sp
      JOIN posts p ON p.id = sp.post_id AND p.deleted_at IS NULL
      JOIN profiles pr ON pr.account_id = p.author_id
      WHERE sp.account_id = ${req.accountId}
      ORDER BY sp.created_at DESC
      LIMIT 100
    `;
    const ids = rows.map((r) => r.id as string);
    const media = ids.length
      ? await sql<Array<{ post_id: string; media_id: string; kind: string }>>`
          SELECT post_id, media_id, kind::text AS kind FROM post_media
          WHERE post_id = ANY(${ids}) AND media_id IS NOT NULL ORDER BY position
        `
      : [];
    const byPost = new Map<string, Array<{ id: string; kind: string; url: string }>>();
    for (const m of media) {
      const list = byPost.get(m.post_id) ?? [];
      list.push({ id: m.media_id, kind: m.kind, url: `/v1/media/${m.media_id}` });
      byPost.set(m.post_id, list);
    }
    return { posts: rows.map((r) => ({ ...r, media: byPost.get(r.id as string) ?? [] })) };
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

      const [post] = await tx<Array<{ author_id: string }>>`
        SELECT author_id FROM posts WHERE id = ${id}
      `;
      if (post) {
        await notify(tx, { accountId: post.author_id, actorId: req.accountId!,
                           kind: 'post_like', payload: { post_id: id } });
      }
      return true;
    });

    return { liked };
  });

  app.patch('/v1/posts/:id', { preHandler: [app.requireAuth] }, async (req) => {
    const { id } = req.params as { id: string };
    const parsed = EditSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'INVALID_BODY', parsed.error.issues[0]?.message);
    }
    const rows = await sql`
      UPDATE posts SET body = ${parsed.data.body}
      WHERE id = ${id} AND author_id = ${req.accountId} AND deleted_at IS NULL
      RETURNING id, body
    `;
    if (rows.length === 0) throw new HttpError(404, 'POST_NOT_FOUND');
    return rows[0];
  });

  app.delete('/v1/posts/:id', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    /**
     * Hard delete. A soft delete left the row, its likes, its comments
     * and its media rows behind — which is what "deleted posts come
     * back" looks like from the outside. Foreign keys cascade from
     * posts, so one DELETE clears post_media, post_likes, comments and
     * saved_posts with it.
     */
    const removed = await sql.begin(async (tx) => {
      const media = await tx<Array<{ media_id: string | null }>>`
        SELECT media_id FROM post_media WHERE post_id = ${id}
      `;
      const rows = await tx`
        DELETE FROM posts WHERE id = ${id} AND author_id = ${req.accountId}
        RETURNING id
      `;
      if (rows.length === 0) return false;

      // Media rows are owned by the account, not the post, so they are
      // not cascaded. Drop the ones this post introduced.
      const ids = media.map((m) => m.media_id).filter((v): v is string => v !== null);
      if (ids.length > 0) {
        await tx`
          DELETE FROM media WHERE id = ANY(${ids}) AND owner_id = ${req.accountId}
        `;
      }
      return true;
    });

    if (!removed) throw new HttpError(404, 'POST_NOT_FOUND');
    reply.code(204);
  });
};

export default postRoutes;
