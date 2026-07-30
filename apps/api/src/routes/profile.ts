import type { FastifyPluginAsync } from 'fastify';
import { sql } from '../lib/db.js';
import { HttpError } from '../lib/errors.js';
import { ProfileCoreSchema } from '../lib/profileSchema.js';

/** Fresh fragment per call — postgres.js query objects are single-use. */
const selectMe = (accountId: string) => sql`
  SELECT p.account_id,
         p.display_name, p.handle, p.bio, p.court_value,
         p.gender, p.pronouns, p.orientation, p.relationship_status,
         p.body_type, p.looking_for, p.interests, p.languages, p.tribes,
         p.height_cm, p.weight_kg, p.birth_date,
         p.verification::text AS verification,
         p.vip_until, p.ghost_mode,
         COALESCE(b.balance, 0)::int AS coin_balance,
         (SELECT count(*)::int FROM woofs w WHERE w.target_id = p.account_id) AS woofs_received,
         (SELECT count(*)::int FROM follows f WHERE f.followee_id = p.account_id) AS followers,
         (SELECT count(*)::int FROM follows f WHERE f.follower_id = p.account_id) AS following,
         (SELECT COALESCE(sum(g.quantity), 0)::int
            FROM gift_collections g WHERE g.account_id = p.account_id) AS gifts_received
  FROM profiles p
  LEFT JOIN coin_balances b ON b.account_id = p.account_id
  WHERE p.account_id = ${accountId}
`;

const profileRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/me', { preHandler: [app.requireAuth] }, async (req) => {
    const rows = await selectMe(req.accountId!);
    if (!rows[0]) throw new HttpError(404, 'PROFILE_NOT_FOUND');
    return rows[0];
  });

  app.patch('/v1/me', { preHandler: [app.requireAuth] }, async (req) => {
    const parsed = ProfileCoreSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'INVALID_BODY', parsed.error.issues[0]?.message);
    }
    const b = parsed.data;
    if (Object.keys(b).length === 0) throw new HttpError(400, 'NOTHING_TO_UPDATE');

    // birth_date is intentionally absent: age is set once at the 18+ gate
    // and is not user-editable afterwards.
    try {
      await sql`
        UPDATE profiles SET
          display_name        = COALESCE(${b.display_name ?? null}, display_name),
          handle              = COALESCE(${b.handle ?? null}, handle),
          bio                 = COALESCE(${b.bio ?? null}, bio),
          gender              = COALESCE(${b.gender ?? null}, gender),
          pronouns            = COALESCE(${b.pronouns ?? null}, pronouns),
          orientation         = COALESCE(${b.orientation ?? null}, orientation),
          relationship_status = COALESCE(${b.relationship_status ?? null}, relationship_status),
          body_type           = COALESCE(${b.body_type ?? null}, body_type),
          looking_for         = COALESCE(${b.looking_for ?? null}, looking_for),
          interests           = COALESCE(${b.interests ?? null}, interests),
          languages           = COALESCE(${b.languages ?? null}, languages),
          tribes              = COALESCE(${b.tribes ?? null}, tribes),
          height_cm           = COALESCE(${b.height_cm ?? null}, height_cm),
          weight_kg           = COALESCE(${b.weight_kg ?? null}, weight_kg),
          updated_at          = now()
        WHERE account_id = ${req.accountId}
      `;
    } catch (err) {
      const pg = err as { code?: string };
      if (pg.code === '23505') {
        throw new HttpError(409, 'HANDLE_TAKEN', 'That handle is already in use.');
      }
      throw err;
    }

    const rows = await selectMe(req.accountId!);
    return rows[0];
  });
};

export default profileRoutes;

import { z as zx } from 'zod';

/**
 * Profile photo gallery. Position 0 is the primary; the partial unique
 * index in the schema enforces one primary per account. All mutations
 * renumber inside a transaction so positions stay dense — gaps would
 * make "make this primary" ambiguous.
 */
export const profilePhotoRoutes = async (app: import('fastify').FastifyInstance) => {
  const list = (accountId: string) => sql`
    SELECT id, media_id, position, is_private
    FROM profile_photos
    WHERE account_id = ${accountId} AND media_id IS NOT NULL
    ORDER BY position
  `;

  app.get('/v1/me/photos', { preHandler: [app.requireAuth] }, async (req) => {
    return { photos: await list(req.accountId!) };
  });

  app.post('/v1/me/photos', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const { media_id } = zx.object({ media_id: zx.string().uuid() }).parse(req.body);
    const me = req.accountId!;

    const photo = await sql.begin(async (tx) => {
      const [m] = await tx<Array<{ kind: string }>>`
        SELECT kind::text AS kind FROM media
        WHERE id = ${media_id} AND owner_id = ${me}
      `;
      if (!m) throw new HttpError(400, 'MEDIA_NOT_OWNED');
      if (m.kind !== 'image') throw new HttpError(400, 'PHOTOS_ONLY');

      const counted = await tx<Array<{ n: number }>>`
        SELECT count(*)::int AS n FROM profile_photos
        WHERE account_id = ${me} AND media_id IS NOT NULL
      `;
      // COUNT always returns a row, but the row type is indexed-access
      // checked, so read it defensively rather than destructuring.
      const n = counted[0]?.n ?? 0;
      if (n >= 60) throw new HttpError(400, 'PHOTO_LIMIT', 'Up to 60 photos');

      const [created] = await tx`
        INSERT INTO profile_photos (account_id, media_id, storage_key, position)
        VALUES (${me}, ${media_id}, NULL, ${n})
        RETURNING id, media_id, position
      `;
      return created;
    });

    reply.code(201);
    return photo;
  });

  app.post('/v1/me/photos/:id/primary', { preHandler: [app.requireAuth] }, async (req) => {
    const { id } = zx.object({ id: zx.string().uuid() }).parse(req.params);
    const me = req.accountId!;

    await sql.begin(async (tx) => {
      const rows = await tx<Array<{ id: string; position: number }>>`
        SELECT id, position FROM profile_photos
        WHERE account_id = ${me} AND media_id IS NOT NULL
        ORDER BY position FOR UPDATE
      `;
      const target = rows.find((r) => r.id === id);
      if (!target) throw new HttpError(404, 'PHOTO_NOT_FOUND');

      // Move target to front, everything else keeps relative order.
      const order = [id, ...rows.filter((r) => r.id !== id).map((r) => r.id)];
      // Two-phase renumber dodges the unique index on position 0.
      for (const [i, pid] of order.entries()) {
        await tx`UPDATE profile_photos SET position = ${i + 100} WHERE id = ${pid}`;
      }
      for (const [i, pid] of order.entries()) {
        await tx`UPDATE profile_photos SET position = ${i} WHERE id = ${pid}`;
      }
    });
    return { ok: true };
  });

  app.delete('/v1/me/photos/:id', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const { id } = zx.object({ id: zx.string().uuid() }).parse(req.params);
    const me = req.accountId!;

    await sql.begin(async (tx) => {
      const removed = await tx`
        DELETE FROM profile_photos WHERE id = ${id} AND account_id = ${me} RETURNING 1
      `;
      if (removed.length === 0) throw new HttpError(404, 'PHOTO_NOT_FOUND');
      const rest = await tx<Array<{ id: string }>>`
        SELECT id FROM profile_photos
        WHERE account_id = ${me} AND media_id IS NOT NULL
        ORDER BY position FOR UPDATE
      `;
      for (const [i, r] of rest.entries()) {
        await tx`UPDATE profile_photos SET position = ${i + 100} WHERE id = ${r.id}`;
      }
      for (const [i, r] of rest.entries()) {
        await tx`UPDATE profile_photos SET position = ${i} WHERE id = ${r.id}`;
      }
    });
    reply.code(204);
  });
};
