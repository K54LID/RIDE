import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { sql } from '../lib/db.js';
import { HttpError } from '../lib/errors.js';
import { OnboardingSchema, ageOn, MIN_AGE } from '../lib/profileSchema.js';

/**
 * POST /v1/onboarding — creates account + identity + profile atomically.
 *
 * Runs on verifyTma, not requireAuth: the one route that must work while
 * no account exists yet.
 *
 * The 18+ gate lives in three layers deliberately — client, this
 * handler, and a CHECK constraint in the schema. The first is courtesy,
 * the second gives a clean error, the third is the guarantee.
 */
const onboardingRoutes: FastifyPluginAsync = async (app) => {
  /**
   * Is this handle free?
   *
   * Runs on verifyTma rather than requireAuth for the same reason the
   * POST below does: the caller is usually mid-onboarding and has no
   * account yet. It answers about handles only — no profile, no id, no
   * hint about who holds a taken one.
   *
   * This is a courtesy, not the guarantee. The unique index on
   * profiles.handle is the guarantee: someone can always take the name
   * between this answer and the submit, and the 409 path handles that.
   */
  app.get('/v1/handles/available', async (req) => {
    app.verifyTma(req);
    const { handle } = z.object({
      handle: z.string().trim().regex(/^[a-zA-Z0-9_]{3,24}$/),
    }).parse(req.query);

    const rows = await sql`
      SELECT 1 FROM profiles WHERE lower(handle) = lower(${handle}) LIMIT 1
    `;
    return { handle, available: rows.length === 0 };
  });

  app.post('/v1/onboarding', async (req) => {
    const tma = app.verifyTma(req);

    const parsed = OnboardingSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'INVALID_BODY', parsed.error.issues[0]?.message);
    }
    const b = parsed.data;

    const birth = new Date(`${b.birth_date}T00:00:00Z`);
    if (Number.isNaN(birth.getTime()) || birth.getUTCFullYear() < 1900) {
      throw new HttpError(400, 'INVALID_BIRTH_DATE');
    }
    if (ageOn(new Date(), birth) < MIN_AGE) {
      throw new HttpError(403, 'UNDERAGE');
    }

    try {
      const result = await sql.begin(async (tx) => {
        const [account] = await tx<{ id: string }[]>`
          INSERT INTO accounts DEFAULT VALUES RETURNING id
        `;
        const accountId = account!.id;

        await tx`
          INSERT INTO telegram_identities (account_id, telegram_id, language_code, is_premium)
          VALUES (${accountId}, ${tma.user.id},
                  ${tma.user.language_code ?? null},
                  ${tma.user.is_premium ?? false})
        `;

        await tx`
          INSERT INTO profiles (
            account_id, display_name, handle, birth_date, bio,
            gender, pronouns, orientation, relationship_status, body_type,
            looking_for, interests, languages, tribes,
            height_cm, weight_kg, age_gate_passed_at
          ) VALUES (
            ${accountId}, ${b.display_name}, ${b.handle},
            ${b.birth_date}, ${b.bio ?? null},
            ${b.gender ?? null}, ${b.pronouns ?? null}, ${b.orientation ?? null},
            ${b.relationship_status ?? null}, ${b.body_type ?? null},
            ${b.looking_for ?? null}, ${b.interests ?? null},
            ${b.languages ?? null}, ${b.tribes ?? null},
            ${b.height_cm ?? null}, ${b.weight_kg ?? null}, now()
          )
        `;

        await tx`INSERT INTO coin_balances (account_id, balance) VALUES (${accountId}, 0)`;
        return { accountId };
      });

      return { ok: true, account_id: result.accountId };
    } catch (err) {
      const pg = err as { code?: string; constraint_name?: string };
      // Duplicate telegram_id: double-tap or retry after timeout.
      // Idempotent success beats a confusing error.
      if (pg.code === '23505') {
        if (pg.constraint_name === 'profiles_handle_key') {
          throw new HttpError(409, 'HANDLE_TAKEN', 'That handle is already in use.');
        }
        return { ok: true, already_onboarded: true };
      }
      throw err;
    }
  });
};

export default onboardingRoutes;
