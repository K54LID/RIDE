import type { FastifyPluginAsync } from 'fastify';
import { sql } from '../lib/db.js';

const notificationRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/notifications', { preHandler: [app.requireAuth] }, async (req) => {
    // Each row carries enough to be a destination, not just a line of
    // text: the actor's id (tap → their profile) and, when the payload
    // references a post, that post's id plus a thumbnail/excerpt.
    const rows = await sql`
      -- 'message' is deliberately excluded: an unread message belongs on
      -- the Chat tab, not in Alerts. Duplicating it in both meant
      -- clearing Alerts to find out you still had messages waiting.
      SELECT n.id::text AS id, n.kind, n.payload, n.read_at, n.created_at,
             n.actor_id,
             p.display_name AS actor_name, p.handle AS actor_handle,
             -- The face belongs on the row: "@someone woofed you" with
             -- no picture is a line of text you have to read, not a
             -- person you recognise.
             (SELECT ph.media_id FROM profile_photos ph
              WHERE ph.account_id = n.actor_id AND ph.position = 0
                AND NOT ph.is_private AND ph.media_id IS NOT NULL
              LIMIT 1) AS actor_avatar_media_id,
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
        AND n.kind <> 'message'
      ORDER BY n.id DESC
      LIMIT 60
    `;
    const [unread] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM notifications
      WHERE account_id = ${req.accountId} AND read_at IS NULL
        AND kind <> 'message'
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
