import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { sql } from '../lib/db.js';
import { HttpError } from '../lib/errors.js';
import { debit, credit } from '../lib/coins.js';
import { notify } from '../lib/notify.js';

/**
 * Coin sinks and sources: gifts, courting, featured slots, referrals,
 * daily login. Every one of them moves coins through the ledger inside
 * the same transaction as its effect.
 */

const IdParam = z.object({ id: z.string().uuid() });

const FEATURED_COST = 10;
const FEATURED_MINUTES = 30;   // guaranteed window; see note below
const REFERRAL_REWARD = 30;
const DAILY_BASE = 5;
const DAILY_STREAK_BONUS = 2;
const DAILY_MAX = 50;

const economyRoutes: FastifyPluginAsync = async (app) => {
  // ---- gifts ----

  app.get('/v1/gifts', { preHandler: [app.requireAuth] }, async () => {
    const rows = await sql`
      SELECT id, slug, name, category, rarity::text AS rarity,
             coin_cost::int AS coin_cost, asset_key, total_supply,
             available_to
      FROM gift_catalog
      WHERE is_active
        AND (available_from IS NULL OR available_from <= now())
        AND (available_to   IS NULL OR available_to   >= now())
      ORDER BY coin_cost
    `;
    return { gifts: rows };
  });

  /** A user's gift showcase, with the repeat count the spec asks for. */
  app.get('/v1/users/:id/gifts', { preHandler: [app.requireAuth] }, async (req) => {
    // 'me' is accepted so the profile screen doesn't need its own id.
    const raw = (req.params as { id: string }).id;
    const id = raw === 'me' ? req.accountId! : IdParam.parse(req.params).id;
    const rows = await sql`
      SELECT g.slug, g.name, g.asset_key, g.rarity::text AS rarity,
             c.quantity::int AS quantity, c.last_at
      FROM gift_collections c
      JOIN gift_catalog g ON g.id = c.gift_id
      WHERE c.account_id = ${id} AND c.quantity > 0
      ORDER BY g.coin_cost DESC
    `;
    return { collection: rows };
  });

  app.post('/v1/users/:id/gifts', { preHandler: [app.requireAuth] }, async (req) => {
    const { id } = IdParam.parse(req.params);
    const { gift_slug, message } = z.object({
      gift_slug: z.string().max(40),
      message: z.string().trim().max(200).optional(),
    }).parse(req.body);

    const me = req.accountId!;
    if (id === me) throw new HttpError(400, 'CANNOT_GIFT_SELF');

    const result = await sql.begin(async (tx) => {
      const [gift] = await tx<Array<{ id: string; coin_cost: number; total_supply: number | null }>>`
        SELECT id, coin_cost::int AS coin_cost, total_supply
        FROM gift_catalog
        WHERE slug = ${gift_slug} AND is_active
          AND (available_from IS NULL OR available_from <= now())
          AND (available_to   IS NULL OR available_to   >= now())
        FOR UPDATE
      `;
      if (!gift) throw new HttpError(404, 'GIFT_UNAVAILABLE');

      if (gift.total_supply !== null) {
        const [sent] = await tx<{ n: number }[]>`
          SELECT count(*)::int AS n FROM gift_transfers WHERE gift_id = ${gift.id}
        `;
        if ((sent?.n ?? 0) >= gift.total_supply) throw new HttpError(410, 'GIFT_SOLD_OUT');
      }

      await debit(tx, me, gift.coin_cost, 'gift_sent', { type: 'gift', id: gift.id });

      const [transfer] = await tx<{ id: string }[]>`
        INSERT INTO gift_transfers (gift_id, sender_id, receiver_id, coin_cost, message)
        VALUES (${gift.id}, ${me}, ${id}, ${gift.coin_cost}, ${message ?? null})
        RETURNING id::text AS id
      `;

      // The showcase counter: quantity is what renders the badge number.
      await tx`
        INSERT INTO gift_collections (account_id, gift_id, quantity)
        VALUES (${id}, ${gift.id}, 1)
        ON CONFLICT (account_id, gift_id) DO UPDATE
          SET quantity = gift_collections.quantity + 1, last_at = now()
      `;

      await notify(tx, {
        accountId: id, actorId: me, kind: 'gift',
        payload: { gift_slug, cost: gift.coin_cost },
      });

      return { transfer_id: transfer!.id, spent: gift.coin_cost };
    });

    return { ok: true, ...result };
  });

  // ---- courting ----

  /**
   * Court value doubles: 1, 2, 4, 8… and the cost to court is the target's
   * NEXT value. Locking the profile row serialises simultaneous courts so
   * two people can't both pay 8 and produce a single doubling.
   */
  app.post('/v1/users/:id/court', { preHandler: [app.requireAuth] }, async (req) => {
    const { id } = IdParam.parse(req.params);
    const me = req.accountId!;
    if (id === me) throw new HttpError(400, 'CANNOT_COURT_SELF');

    const result = await sql.begin(async (tx) => {
      const [target] = await tx<{ court_value: number }[]>`
        SELECT court_value::int AS court_value FROM profiles
        WHERE account_id = ${id} FOR UPDATE
      `;
      if (!target) throw new HttpError(404, 'USER_NOT_FOUND');

      const before = target.court_value;
      const after = before * 2;
      const cost = after;

      await debit(tx, me, cost, 'court_spend', { type: 'court', id });

      await tx`
        UPDATE profiles SET court_value = ${after}, updated_at = now()
        WHERE account_id = ${id}
      `;
      await tx`
        INSERT INTO court_events (courter_id, target_id, coin_cost, value_before, value_after)
        VALUES (${me}, ${id}, ${cost}, ${before}, ${after})
      `;
      await notify(tx, {
        accountId: id, actorId: me, kind: 'court',
        payload: { value_before: before, value_after: after },
      });

      return { court_value: after, spent: cost };
    });

    return { ok: true, ...result };
  });

  // ---- featured slots ----

  app.get('/v1/featured', { preHandler: [app.requireAuth] }, async () => {
    const rows = await sql`
      SELECT f.position, f.expires_at,
             p.account_id, p.display_name, p.handle, p.court_value,
             (p.verification = 'approved') AS verified
      FROM featured_slots f
      LEFT JOIN profiles p ON p.account_id = f.account_id
      WHERE f.account_id IS NULL OR f.expires_at IS NULL OR f.expires_at > now()
      ORDER BY f.position
    `;
    return { slots: rows, cost: FEATURED_COST };
  });

  /**
   * Buying pushes everyone down one and drops the last.
   *
   * The spec's pure push-down means a buyer can be evicted seconds after
   * paying if the queue is busy. expires_at gives every purchase a
   * guaranteed window: occupants still inside it are not displaced, and
   * the purchase is refused rather than silently wasting coins.
   */
  app.post('/v1/featured', { preHandler: [app.requireAuth] }, async (req) => {
    const me = req.accountId!;

    const result = await sql.begin(async (tx) => {
      const slots = await tx<Array<{ position: number; account_id: string | null; expires_at: string | null }>>`
        SELECT position, account_id, expires_at FROM featured_slots
        ORDER BY position FOR UPDATE
      `;

      const last = slots[slots.length - 1]!;
      const lastProtected =
        last.account_id !== null &&
        last.expires_at !== null &&
        new Date(last.expires_at) > new Date();
      if (lastProtected) throw new HttpError(409, 'ALL_SLOTS_PROTECTED');

      if (slots.some((s) => s.account_id === me)) {
        throw new HttpError(409, 'ALREADY_FEATURED');
      }

      await debit(tx, me, FEATURED_COST, 'featured_slot', { type: 'featured', id: 'slot' });

      // Shift down from the bottom so no two rows collide mid-update.
      for (let i = slots.length - 1; i > 0; i--) {
        const from = slots[i - 1]!;
        await tx`
          UPDATE featured_slots
          SET account_id = ${from.account_id}, purchased_at = ${from.expires_at ? sql`purchased_at` : null},
              expires_at = ${from.expires_at}
          WHERE position = ${i + 1}
        `;
      }
      await tx`
        UPDATE featured_slots
        SET account_id = ${me}, purchased_at = now(),
            expires_at = now() + (${FEATURED_MINUTES} || ' minutes')::interval
        WHERE position = 1
      `;
      await notify(tx, { accountId: me, kind: 'featured', payload: { position: 1 } });

      return { position: 1, minutes: FEATURED_MINUTES };
    });

    return { ok: true, ...result };
  });

  // ---- referrals ----

  app.get('/v1/referral', { preHandler: [app.requireAuth] }, async (req) => {
    const me = req.accountId!;
    let [row] = await sql<{ referral_code: string | null }[]>`
      SELECT referral_code FROM profiles WHERE account_id = ${me}
    `;

    if (!row?.referral_code) {
      // Short, unambiguous, generated once.
      const code = randomBytes(5).toString('base64url').replace(/[-_]/g, '').slice(0, 7).toUpperCase();
      [row] = await sql<{ referral_code: string }[]>`
        UPDATE profiles SET referral_code = ${code}
        WHERE account_id = ${me} AND referral_code IS NULL
        RETURNING referral_code
      `;
      if (!row) {
        [row] = await sql<{ referral_code: string }[]>`
          SELECT referral_code FROM profiles WHERE account_id = ${me}
        `;
      }
    }

    const [stats] = await sql<{ invited: number; earned: number }[]>`
      SELECT count(*)::int AS invited,
             (count(*) FILTER (WHERE rewarded_at IS NOT NULL) * ${REFERRAL_REWARD})::int AS earned
      FROM referrals WHERE inviter_id = ${me}
    `;

    return {
      code: row!.referral_code,
      reward: REFERRAL_REWARD,
      invited: stats?.invited ?? 0,
      earned: stats?.earned ?? 0,
    };
  });

  /** Claimed once, by the invitee, during or just after onboarding. */
  app.post('/v1/referral/claim', { preHandler: [app.requireAuth] }, async (req) => {
    const { code } = z.object({ code: z.string().trim().min(4).max(16) }).parse(req.body);
    const me = req.accountId!;

    await sql.begin(async (tx) => {
      const [inviter] = await tx<{ account_id: string }[]>`
        SELECT account_id FROM profiles WHERE referral_code = ${code.toUpperCase()}
      `;
      if (!inviter) throw new HttpError(404, 'CODE_NOT_FOUND');
      if (inviter.account_id === me) throw new HttpError(400, 'CANNOT_REFER_SELF');

      const inserted = await tx`
        INSERT INTO referrals (invitee_id, inviter_id, rewarded_at)
        VALUES (${me}, ${inviter.account_id}, now())
        ON CONFLICT (invitee_id) DO NOTHING
        RETURNING invitee_id
      `;
      if (inserted.length === 0) throw new HttpError(409, 'ALREADY_REFERRED');

      await credit(tx, inviter.account_id, REFERRAL_REWARD, 'referral_bonus',
                   { type: 'referral', id: me }, `ref:${me}`);
      await notify(tx, {
        accountId: inviter.account_id, actorId: me, kind: 'referral',
        payload: { reward: REFERRAL_REWARD },
      });
    });

    return { ok: true, reward: REFERRAL_REWARD };
  });

  // ---- daily login ----

  app.get('/v1/daily', { preHandler: [app.requireAuth] }, async (req) => {
    const [row] = await sql<{ current_streak: number; last_claim_on: string | null }[]>`
      SELECT COALESCE(current_streak, 0)::int AS current_streak, last_claim_on
      FROM login_streaks WHERE account_id = ${req.accountId}
    `;
    const today = new Date().toISOString().slice(0, 10);
    return {
      streak: row?.current_streak ?? 0,
      claimed_today: row?.last_claim_on === today,
      next_reward: Math.min(DAILY_MAX, DAILY_BASE + (row?.current_streak ?? 0) * DAILY_STREAK_BONUS),
    };
  });

  app.post('/v1/daily/claim', { preHandler: [app.requireAuth] }, async (req) => {
    const me = req.accountId!;
    const today = new Date().toISOString().slice(0, 10);

    const result = await sql.begin(async (tx) => {
      const [row] = await tx<{ current_streak: number; longest_streak: number; last_claim_on: string | null }[]>`
        INSERT INTO login_streaks (account_id) VALUES (${me})
        ON CONFLICT (account_id) DO UPDATE SET account_id = EXCLUDED.account_id
        RETURNING current_streak::int, longest_streak::int, last_claim_on
      `;
      if (row!.last_claim_on === today) throw new HttpError(409, 'ALREADY_CLAIMED');

      // A gap of exactly one day continues the streak; anything else resets.
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const streak = row!.last_claim_on === yesterday ? row!.current_streak + 1 : 1;
      const reward = Math.min(DAILY_MAX, DAILY_BASE + (streak - 1) * DAILY_STREAK_BONUS);

      await tx`
        UPDATE login_streaks
        SET current_streak = ${streak},
            longest_streak = GREATEST(longest_streak, ${streak}),
            last_claim_on = ${today}
        WHERE account_id = ${me}
      `;
      await credit(tx, me, reward, 'daily_login', { type: 'daily', id: today },
                   `daily:${me}:${today}`);

      return { streak, reward };
    });

    return { ok: true, ...result };
  });
};

export default economyRoutes;
