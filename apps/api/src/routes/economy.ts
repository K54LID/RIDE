import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { sql } from '../lib/db.js';
import { HttpError } from '../lib/errors.js';
import { debit, credit } from '../lib/coins.js';
import { notify } from '../lib/notify.js';
import { botLink } from '../lib/botIdentity.js';

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
      /**
       * The person courted keeps half. Being courted is the one thing
       * in the app that happens *to* you rather than because you spent
       * anything, so it paying nothing made the whole mechanic read as
       * a tax on being popular. Floor, because coins are integers — the
       * odd coin stays with the house rather than rounding a 1-coin
       * court up into a free coin.
       */
      const payout = Math.floor(cost / 2);

      await debit(tx, me, cost, 'court_spend', { type: 'court', id });
      await credit(tx, id, payout, 'court_payout', { type: 'court', id: me });

      await tx`
        UPDATE profiles SET court_value = ${after}, updated_at = now()
        WHERE account_id = ${id}
      `;
      await tx`
        INSERT INTO court_events (courter_id, target_id, coin_cost, value_before, value_after)
        VALUES (${me}, ${id}, ${cost}, ${before}, ${after})
      `;
      // Current holder of the courtship — this is what renders on the
      // courted person's profile as "courted by".
      /**
       * Courting resets the clock. A fresh 30 days from *now*, not 30
       * days from whenever the first court happened — so staying at the
       * top means being courted again before the window closes, which
       * is the whole point of the mechanic.
       */
      await tx`
        INSERT INTO courtships (target_id, courter_id, coin_cost, court_value, expires_at)
        VALUES (${id}, ${me}, ${cost}, ${after}, now() + interval '30 days')
        ON CONFLICT (target_id) DO UPDATE
          SET courter_id = ${me}, coin_cost = ${cost},
              court_value = ${after}, created_at = now(),
              expires_at = now() + interval '30 days'
      `;
      await notify(tx, {
        accountId: id, actorId: me, kind: 'court',
        payload: { value_before: before, value_after: after, payout },
      });

      return { court_value: after, spent: cost, payout };
    });

    return { ok: true, ...result };
  });

  /**
   * What courting this person costs right now, and who holds them.
   *
   * A courtship is a 30-day title, not a permanent one: past that
   * window the "courted by" strip disappears until someone pays again.
   * The upsert in the court route stamps created_at = now() on every
   * court, so a re-court resets the 30 days — and since the cost is
   * always the doubled value, the price has gone up with it.
   */
  app.get('/v1/users/:id/court', { preHandler: [app.requireAuth] }, async (req) => {
    const { id } = IdParam.parse(req.params);
    const [row] = await sql<Array<{
      court_value: number; courter_id: string | null;
      courter_name: string | null; courter_handle: string | null;
      courted_at: string | null; expires_at: string | null;
      courter_avatar_media_id: string | null;
    }>>`
      SELECT p.court_value::int AS court_value,
             c.courter_id, c.created_at AS courted_at,
             c.expires_at,
             cp.display_name AS courter_name, cp.handle AS courter_handle,
             (SELECT ph.media_id FROM profile_photos ph
              WHERE ph.account_id = c.courter_id 
                AND NOT ph.is_private AND ph.media_id IS NOT NULL
              ORDER BY ph.position LIMIT 1) AS courter_avatar_media_id
      FROM profiles p
      LEFT JOIN courtships c ON c.target_id = p.account_id
        AND c.expires_at > now()
      LEFT JOIN profiles cp  ON cp.account_id = c.courter_id
      WHERE p.account_id = ${id}
    `;
    if (!row) throw new HttpError(404, 'USER_NOT_FOUND');
    return {
      court_value: row.court_value,
      next_cost: row.court_value * 2,
      courter: row.courter_id
        ? { account_id: row.courter_id, display_name: row.courter_name,
            handle: row.courter_handle, at: row.courted_at,
            expires_at: row.expires_at,
            avatar_media_id: row.courter_avatar_media_id }
        : null,
    };
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
      const slots = await tx<Array<{
        position: number; account_id: string | null;
        purchased_at: string | null; expires_at: string | null;
      }>>`
        SELECT position, account_id, purchased_at, expires_at
        FROM featured_slots
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
      // Each occupant carries their purchase time and window with them.
      for (let i = slots.length - 1; i > 0; i--) {
        const from = slots[i - 1]!;
        await tx`
          UPDATE featured_slots
          SET account_id   = ${from.account_id},
              purchased_at = ${from.purchased_at},
              expires_at   = ${from.expires_at}
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
      // The code travels in the /start payload, so an invite opens the
      // bot with the code already attached instead of asking someone to
      // copy seven characters out of a message.
      // `referral_code` is nullable in the column type even though the
      // block above guarantees one by here; `?? undefined` gives
      // botLink the plain bot link rather than a `?start=null`.
      link: await botLink(row!.referral_code ?? undefined),
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

  /**
   * `last_claim_on` is a Postgres `date`, and postgres.js decodes dates
   * into JavaScript Date objects — never strings. Every comparison here
   * was `row.last_claim_on === today` against a 'YYYY-MM-DD' string,
   * which is a Date-vs-string comparison and therefore always false.
   *
   * The visible effects: "claimed today" never registered, so the
   * button stayed live and a second claim was rejected only by the
   * ledger's idempotency key; and the streak never saw yesterday, so it
   * reset to 1 every single day and never counted up.
   */
  const asDay = (v: unknown): string | null => {
    if (!v) return null;
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return String(v).slice(0, 10);
  };

  app.get('/v1/daily', { preHandler: [app.requireAuth] }, async (req) => {
    const [row] = await sql<{ current_streak: number; last_claim_on: string | null }[]>`
      SELECT COALESCE(current_streak, 0)::int AS current_streak, last_claim_on
      FROM login_streaks WHERE account_id = ${req.accountId}
    `;
    const today = new Date().toISOString().slice(0, 10);
    return {
      streak: row?.current_streak ?? 0,
      claimed_today: asDay(row?.last_claim_on) === today,
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
      const last = asDay(row!.last_claim_on);
      if (last === today) throw new HttpError(409, 'ALREADY_CLAIMED');

      // A gap of exactly one day continues the streak; anything else resets.
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const streak = last === yesterday ? row!.current_streak + 1 : 1;
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
