import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { sql } from '../lib/db.js';
import { HttpError } from '../lib/errors.js';

/**
 * POST /v1/onboarding — creates account + identity + profile atomically.
 *
 * Runs on verifyTma, not requireAuth: this is the one route that must
 * work while no account exists yet.
 *
 * The 18+ gate lives in three layers on purpose: client UI, this
 * handler, and the CHECK constraint in the schema. The first is
 * courtesy, the second gives a clean error, the third is the guarantee.
 */

const BodySchema = z.object({
  display_name: z.string().trim().min(1).max(50),
  birth_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'),
  gender: z.string().trim().max(30).optional(),
  bio: z.string().trim().max(500).optional(),
});

function ageOn(today: Date, birth: Date): number {
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = today.getUTCMonth() - birth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getUTCDate() < birth.getUTCDate())) {
    age -= 1;
  }
  return age;
}

const onboardingRoutes: FastifyPluginAsync = async (app) => {
  app.post('/v1/onboarding', async (req) => {
    const tma = app.verifyTma(req);

    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'INVALID_BODY', parsed.error.issues[0]?.message);
    }
    const body = parsed.data;

    const birth = new Date(`${body.birth_date}T00:00:00Z`);
    if (Number.isNaN(birth.getTime()) || birth.getUTCFullYear() < 1900) {
      throw new HttpError(400, 'INVALID_BIRTH_DATE');
    }
    if (ageOn(new Date(), birth) < 18) {
      // Deliberate: no soft failure, no retry hint. RIDE is 18+.
      throw new HttpError(403, 'UNDERAGE');
    }

    try {
      const profile = await sql.begin(async (tx) => {
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

        const [created] = await tx`
          INSERT INTO profiles
            (account_id, display_name, birth_date, gender, bio, age_gate_passed_at)
          VALUES
            (${accountId}, ${body.display_name}, ${body.birth_date},
             ${body.gender ?? null}, ${body.bio ?? null}, now())
          RETURNING display_name, handle, bio, court_value, verification::text AS verification
        `;

        await tx`
          INSERT INTO coin_balances (account_id, balance) VALUES (${accountId}, 0)
        `;

        return created;
      });

      return { ok: true, profile };
    } catch (err) {
      // 23505 on telegram_identities.telegram_id: the account already
      // exists (double-tap, retry after timeout). Idempotent success.
      const pg = err as { code?: string; constraint_name?: string };
      if (pg.code === '23505') {
        return { ok: true, already_onboarded: true };
      }
      throw err;
    }
  });
};

export default onboardingRoutes;
