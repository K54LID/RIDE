import type { FastifyPluginAsync } from 'fastify';
import { sql } from '../lib/db.js';
import { HttpError } from '../lib/errors.js';
import { ProfileCoreSchema } from '../lib/profileSchema.js';

/** Fresh fragment per call — postgres.js query objects are single-use. */
const selectMe = (accountId: string) => sql`
  SELECT p.display_name, p.handle, p.bio, p.court_value,
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
