import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { sql } from '../lib/db.js';
import { HttpError } from '../lib/errors.js';

/**
 * Private albums.
 *
 * A photo marked private is invisible to everyone until its owner
 * grants a specific person access. Grants are per-viewer rows, so
 * revoking is a DELETE and can never accidentally expose someone else.
 *
 * Access is checked on the server for every private photo read — the
 * client is never trusted to hide them, because "hidden in the UI" is
 * not hidden.
 */

const albumRoutes: FastifyPluginAsync = async (app) => {
  /** Flip a photo between the public grid and the private album. */
  app.patch('/v1/me/photos/:id/privacy', { preHandler: [app.requireAuth] }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { is_private } = z.object({ is_private: z.boolean() }).parse(req.body);

    const rows = await sql`
      UPDATE profile_photos SET is_private = ${is_private}
      WHERE id = ${id} AND account_id = ${req.accountId}
      RETURNING id, is_private
    `;
    if (rows.length === 0) throw new HttpError(404, 'PHOTO_NOT_FOUND');
    return rows[0];
  });

  /** Who currently holds a key to my album. */
  app.get('/v1/albums/grants', { preHandler: [app.requireAuth] }, async (req) => {
    const rows = await sql`
      SELECT g.viewer_id, g.granted_at, p.display_name, p.handle,
             (SELECT ph.media_id FROM profile_photos ph
              WHERE ph.account_id = g.viewer_id AND ph.position = 0
                AND NOT ph.is_private AND ph.media_id IS NOT NULL
              LIMIT 1) AS avatar_media_id
      FROM album_grants g
      JOIN profiles p ON p.account_id = g.viewer_id
      WHERE g.owner_id = ${req.accountId}
      ORDER BY g.granted_at DESC
    `;
    return { grants: rows };
  });

  /** Grant or revoke in one call — the lock button is a toggle. */
  app.post('/v1/albums/grants', { preHandler: [app.requireAuth] }, async (req) => {
    const { account_id, granted } = z.object({
      account_id: z.string().uuid(),
      granted: z.boolean(),
    }).parse(req.body);

    const me = req.accountId!;
    if (account_id === me) throw new HttpError(400, 'CANNOT_GRANT_SELF');

    if (!granted) {
      await sql`
        DELETE FROM album_grants WHERE owner_id = ${me} AND viewer_id = ${account_id}
      `;
      return { granted: false };
    }

    const blocked = await sql`
      SELECT 1 FROM blocks
      WHERE (blocker_id = ${me} AND blocked_id = ${account_id})
         OR (blocker_id = ${account_id} AND blocked_id = ${me})
    `;
    if (blocked.length > 0) throw new HttpError(403, 'BLOCKED');

    await sql`
      INSERT INTO album_grants (owner_id, viewer_id) VALUES (${me}, ${account_id})
      ON CONFLICT DO NOTHING
    `;
    return { granted: true };
  });

  /** Do I hold a key to this person's album? Drives the lock button. */
  app.get('/v1/albums/grants/:id', { preHandler: [app.requireAuth] }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const me = req.accountId!;

    const [given] = await sql`
      SELECT 1 AS ok FROM album_grants WHERE owner_id = ${me} AND viewer_id = ${id}
    `;
    const [received] = await sql`
      SELECT 1 AS ok FROM album_grants WHERE owner_id = ${id} AND viewer_id = ${me}
    `;
    return { i_granted: Boolean(given), they_granted: Boolean(received) };
  });

  /**
   * Another person's photos. Public ones always; private ones only with
   * a grant. The filter is in SQL so a bug in the client cannot leak.
   */
  app.get('/v1/users/:id/photos', { preHandler: [app.requireAuth] }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const me = req.accountId!;

    const rows = await sql`
      SELECT ph.id, ph.media_id, ph.position, ph.is_private
      FROM profile_photos ph
      WHERE ph.account_id = ${id}
        AND ph.media_id IS NOT NULL
        AND (
          NOT ph.is_private
          OR ph.account_id = ${me}
          OR EXISTS (
            SELECT 1 FROM album_grants g
            WHERE g.owner_id = ${id} AND g.viewer_id = ${me}
          )
        )
      ORDER BY ph.is_private, ph.position
    `;

    const [locked] = await sql<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM profile_photos
      WHERE account_id = ${id} AND is_private AND media_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM album_grants g
          WHERE g.owner_id = ${id} AND g.viewer_id = ${me}
        )
    `;

    return { photos: rows, locked_count: id === me ? 0 : (locked?.n ?? 0) };
  });

  /** Full public profile of another person. */
  app.get('/v1/users/:id', { preHandler: [app.requireAuth] }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const me = req.accountId!;

    // Their block hides me from them entirely; my own block still
    // shows me the profile with an i_blocked flag, because the only
    // way to change my mind is a working Unblock button somewhere.
    const theyBlocked = await sql`
      SELECT 1 FROM blocks WHERE blocker_id = ${id} AND blocked_id = ${me}
    `;
    if (theyBlocked.length > 0) throw new HttpError(403, 'BLOCKED');

    const [user] = await sql`
      SELECT p.account_id, p.display_name, p.handle, p.bio, p.court_value,
             p.gender, p.pronouns, p.orientation, p.relationship_status,
             p.looking_for, p.interests, p.languages, p.tribes,
             p.height_cm, p.weight_kg,
             (p.verification = 'approved') AS verified,
             (p.vip_until IS NOT NULL AND p.vip_until > now()) AS vip,
             date_part('year', age(p.birth_date))::int AS age,
             CASE WHEN COALESCE(st.show_online, true)
                  THEN (a.last_seen_at > now() - interval '5 minutes') END AS online,
             (SELECT count(*)::int FROM woofs w WHERE w.target_id = p.account_id
                AND w.created_at > COALESCE(p.stats_reset_at, 'epoch')) AS woofs_received,
             -- Counts the same people the followers list will actually
             -- show: active accounts, not ghosted, not blocked either
             -- way. A count that disagrees with its own list is worse
             -- than a smaller number.
             (SELECT count(*)::int FROM follows f
               JOIN profiles fp ON fp.account_id = f.follower_id
               JOIN accounts fa ON fa.id = f.follower_id AND fa.status = 'active'
              WHERE f.followee_id = p.account_id
                AND f.created_at > COALESCE(p.stats_reset_at, 'epoch')
                AND NOT fp.ghost_mode
                AND NOT EXISTS (
                  SELECT 1 FROM blocks b
                  WHERE (b.blocker_id = ${me} AND b.blocked_id = f.follower_id)
                     OR (b.blocker_id = f.follower_id AND b.blocked_id = ${me})
                )) AS followers,
             (SELECT count(*)::int FROM gift_transfers g WHERE g.receiver_id = p.account_id
                AND g.created_at > COALESCE(p.stats_reset_at, 'epoch')) AS gifts_received,
             EXISTS (SELECT 1 FROM blocks b
                     WHERE b.blocker_id = ${me} AND b.blocked_id = p.account_id) AS i_blocked,
             EXISTS (SELECT 1 FROM follows f
                     WHERE f.follower_id = ${me} AND f.followee_id = p.account_id) AS i_follow,
             EXISTS (SELECT 1 FROM woofs w
                     WHERE w.sender_id = ${me} AND w.target_id = p.account_id
                       AND (w.created_at AT TIME ZONE 'UTC')::date
                           = (now() AT TIME ZONE 'UTC')::date) AS woofed_today
      FROM profiles p
      JOIN accounts a ON a.id = p.account_id AND a.status = 'active'
      LEFT JOIN user_settings st ON st.account_id = p.account_id
      WHERE p.account_id = ${id} AND NOT p.ghost_mode
    `;
    if (!user) throw new HttpError(404, 'USER_NOT_FOUND');

    const gifts = await sql`
      SELECT g.slug, g.name, g.asset_key, g.rarity::text AS rarity, c.quantity::int AS quantity
      FROM gift_collections c
      JOIN gift_catalog g ON g.id = c.gift_id
      WHERE c.account_id = ${id} AND c.quantity > 0
      ORDER BY g.coin_cost DESC
    `;
    return { user, gifts };
  });
};

export default albumRoutes;
