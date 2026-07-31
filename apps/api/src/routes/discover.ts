import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { sql } from '../lib/db.js';
import { HttpError } from '../lib/errors.js';
import { distanceBucket } from '../lib/geo.js';
import { sendLocationPrompt } from '../lib/botCommands.js';

/**
 * Discovery with advanced filters.
 *
 * Distance is returned as a bucket label, never as metres — exact
 * distances from several vantage points reconstruct a position by
 * trilateration. See lib/geo.ts.
 */

const FiltersSchema = z.object({
  q: z.string().trim().max(60).optional(),
  gender: z.string().trim().max(30).optional(),
  age_min: z.coerce.number().int().min(18).max(120).optional(),
  age_max: z.coerce.number().int().min(18).max(120).optional(),
  looking_for: z.string().trim().max(200).optional(),  // comma-separated
  languages: z.string().trim().max(200).optional(),
  interests: z.string().trim().max(200).optional(),
  max_km: z.coerce.number().int().min(1).max(500).optional(),
  verified_only: z.coerce.boolean().optional(),
  online_only: z.coerce.boolean().optional(),
  sort: z.enum(['active', 'new', 'court', 'nearby', 'global']).default('active'),
  limit: z.coerce.number().int().min(1).max(50).default(24),
  offset: z.coerce.number().int().min(0).max(500).default(0),
});

const csv = (s?: string) =>
  s ? s.split(',').map((x) => x.trim()).filter(Boolean) : null;

const discoverRoutes: FastifyPluginAsync = async (app) => {
  /**
   * Ask for a location fix in the bot chat.
   *
   * The Mini App can't reliably get GPS across Telegram clients, but the
   * bot chat can with a request_location keyboard — the same one /start
   * sends. Discover's 📍 button calls this and then closes the Mini App,
   * so the share button is already waiting in the chat behind it.
   *
   * This reads telegram_identities, which the invariants forbid joining
   * into a *public* response. Nothing telegram-derived is returned here:
   * the caller only learns whether their own prompt was sent, and the
   * chat id never leaves the server.
   */
  app.post('/v1/discover/request-location', { preHandler: [app.requireAuth] }, async (req) => {
    const [identity] = await sql<Array<{ telegram_id: string; language_code: string | null }>>`
      SELECT telegram_id::text, language_code
      FROM telegram_identities WHERE account_id = ${req.accountId}
    `;
    if (!identity) throw new HttpError(409, 'NO_TELEGRAM_IDENTITY');

    try {
      await sendLocationPrompt(identity.telegram_id, identity.language_code);
    } catch (err) {
      req.log.error({ err }, 'location prompt failed');
      throw new HttpError(502, 'PROMPT_FAILED');
    }
    return { sent: true };
  });

  app.get('/v1/discover', { preHandler: [app.requireAuth] }, async (req) => {
    const f = FiltersSchema.parse(req.query);
    const me = req.accountId!;

    const lookingFor = csv(f.looking_for);
    const languages = csv(f.languages);
    const interests = csv(f.interests);

    // Age filters convert to birth_date bounds so the index is usable —
    // computing age per row would defeat it.
    const today = new Date();
    const bornAfter = f.age_max
      ? new Date(Date.UTC(today.getUTCFullYear() - f.age_max - 1, today.getUTCMonth(), today.getUTCDate()))
      : null;
    const bornBefore = f.age_min
      ? new Date(Date.UTC(today.getUTCFullYear() - f.age_min, today.getUTCMonth(), today.getUTCDate()))
      : null;

    // Global ignores location entirely and shows random online people —
    // it replaces the map view, which never worked, without pretending
    // to place anyone on a map. It still respects the other filters.
    const isGlobal = f.sort === 'global';

    const rows = await sql`
      SELECT p.account_id, p.display_name, p.handle, p.bio, p.court_value,
             p.gender, p.interests, p.languages, p.looking_for,
             (p.verification = 'approved') AS verified,
             date_part('year', age(p.birth_date))::int AS age,
             a.last_seen_at,
             (a.last_seen_at > now() - interval '5 minutes') AS online,
             (SELECT ph.media_id FROM profile_photos ph
              WHERE ph.account_id = p.account_id AND ph.position = 0
                AND NOT ph.is_private AND ph.media_id IS NOT NULL
              LIMIT 1) AS avatar_media_id,
             CASE WHEN ml.cell IS NOT NULL AND ul.cell IS NOT NULL
                  THEN ST_Distance(ml.cell, ul.cell) END AS distance_m
      FROM profiles p
      JOIN accounts a ON a.id = p.account_id
      LEFT JOIN user_locations ul ON ul.account_id = p.account_id
      LEFT JOIN user_locations ml ON ml.account_id = ${me}
      WHERE a.status = 'active'
        AND p.account_id <> ${me}
        AND NOT p.ghost_mode
        AND NOT EXISTS (
          SELECT 1 FROM blocks b
          WHERE (b.blocker_id = ${me} AND b.blocked_id = p.account_id)
             OR (b.blocker_id = p.account_id AND b.blocked_id = ${me})
        )
        ${f.q ? sql`AND (p.display_name ILIKE ${'%' + f.q + '%'} OR p.handle ILIKE ${'%' + f.q + '%'})` : sql``}
        ${f.gender ? sql`AND p.gender = ${f.gender}` : sql``}
        ${bornAfter ? sql`AND p.birth_date > ${bornAfter}` : sql``}
        ${bornBefore ? sql`AND p.birth_date <= ${bornBefore}` : sql``}
        ${lookingFor ? sql`AND p.looking_for && ${lookingFor}` : sql``}
        ${languages ? sql`AND p.languages && ${languages}` : sql``}
        ${interests ? sql`AND p.interests && ${interests}` : sql``}
        ${f.verified_only ? sql`AND p.verification = 'approved'` : sql``}
        ${isGlobal || f.online_only ? sql`AND a.last_seen_at > now() - interval '5 minutes'` : sql``}
        ${!isGlobal && f.sort === 'nearby'
          ? sql`AND ul.cell IS NOT NULL AND ml.cell IS NOT NULL` : sql``}
        ${!isGlobal && f.max_km ? sql`AND ul.cell IS NOT NULL AND ml.cell IS NOT NULL
                         AND ST_DWithin(ml.cell, ul.cell, ${f.max_km * 1000})` : sql``}
      ORDER BY
        ${isGlobal ? sql`random()` : sql``}
        ${f.sort === 'court' ? sql`p.court_value DESC` : sql``}
        ${f.sort === 'new' ? sql`a.created_at DESC` : sql``}
        ${f.sort === 'nearby' ? sql`distance_m ASC NULLS LAST` : sql``}
        ${f.sort === 'active' ? sql`a.last_seen_at DESC` : sql``}
      LIMIT ${f.limit} OFFSET ${f.offset}
    `;

    return {
      people: rows.map((r) => ({
        account_id: r.account_id,
        display_name: r.display_name,
        handle: r.handle,
        bio: r.bio,
        age: r.age,
        gender: r.gender,
        court_value: r.court_value,
        verified: r.verified,
        online: r.online,
        interests: r.interests,
        avatar_media_id: r.avatar_media_id,
        // Bucket only. Never the raw number.
        distance: isGlobal || r.distance_m === null ? null : distanceBucket(Number(r.distance_m)),
      })),
      has_more: rows.length === f.limit,
    };
  });
};

export default discoverRoutes;
