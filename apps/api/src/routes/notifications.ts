import type { FastifyPluginAsync } from 'fastify';
import { sql } from '../lib/db.js';

const notificationRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/notifications', { preHandler: [app.requireAuth] }, async (req) => {
    const rows = await sql`
      SELECT n.id::text AS id, n.kind, n.payload, n.read_at, n.created_at,
             p.display_name AS actor_name, p.handle AS actor_handle,
             (p.verification = 'approved') AS actor_verified
      FROM notifications n
      LEFT JOIN profiles p ON p.account_id = n.actor_id
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
