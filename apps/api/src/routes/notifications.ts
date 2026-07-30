import type { FastifyPluginAsync } from 'fastify';
import { sql } from '../lib/db.js';

const notificationRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/notifications', { preHandler: [app.requireAuth] }, async (req) => {
    // Each row carries enough to be a destination, not just a line of
    // text: the actor's id (tap → their profile) and, when the payload
    // references a post, that post's id plus a thumbnail/excerpt.
    const rows = await sql`
      SELECT n.id::text AS id, n.kind, n.payload, n.read_at, n.created_at,
             n.actor_id,
             p.display_name AS actor_name, p.handle AS actor_handle,
             (p.verification = 'approved') AS actor_verified,
             po.id AS post_id,
             left(po.body, 90) AS post_excerpt,
             pm.media_id AS post_media_id
      FROM notifications n
      LEFT JOIN profiles p ON p.account_id = n.actor_id
      LEFT JOIN posts po ON po.id = (
        CASE WHEN n.payload ? 'post_id' THEN (n.payload->>'post_id')::uuid END
      ) AND po.deleted_at IS NULL
      LEFT JOIN LATERAL (
        SELECT media_id FROM post_media
        WHERE post_id = po.id AND media_id IS NOT NULL
        ORDER BY position LIMIT 1
      ) pm ON true
      WHERE n.account_id = ${req.accountId}
      ORDER BY n.id DESC
      LIMIT 60
    `;
    const [unread] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM notifications
      WHERE account_id = ${req.accountId} AND read_at IS NULL
    `;
    return { notifications: rows, unread: unread?.n ?? 0 };
  });

  app.post('/v1/notifications/read', { preHandler: [app.requireAuth] }, async (req) => {
    await sql`
      UPDATE notifications SET read_at = now()
      WHERE account_id = ${req.accountId} AND read_at IS NULL
    `;
    return { ok: true };
  });
};

export default notificationRoutes;
