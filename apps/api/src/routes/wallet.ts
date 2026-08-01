import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { sql } from '../lib/db.js';
import { config } from '../config.js';
import { HttpError } from '../lib/errors.js';
import { processTelegramUpdate, type TelegramUpdate } from '../lib/telegramUpdates.js';

/**
 * Wallet and Telegram Stars top-up.
 *
 * Flow:
 *   1. Client asks for a pack -> we call Bot API createInvoiceLink
 *      (currency XTR = Stars) and record a pending purchase keyed by a
 *      random payload.
 *   2. Client opens the link with Telegram.WebApp.openInvoice.
 *   3. Telegram posts successful_payment to our webhook; we match on the
 *      payload and credit coins through the ledger.
 *
 * Coins are never credited client-side. The webhook is the only path,
 * because anything the client can call, the client can forge.
 */

export const COIN_PACKS = [
  { id: 'starter', stars: 50, coins: 50, label: '50 coins' },
  { id: 'plus', stars: 100, coins: 110, label: '110 coins' },
  { id: 'pro', stars: 250, coins: 300, label: '300 coins' },
  { id: 'max', stars: 500, coins: 650, label: '650 coins' },
] as const;

const TopUpSchema = z.object({
  pack_id: z.enum(['starter', 'plus', 'pro', 'max']),
});

async function botApi(method: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(
    `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/${method}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  const json = (await res.json()) as { ok: boolean; result?: unknown; description?: string };
  if (!json.ok) throw new Error(`Bot API ${method}: ${json.description ?? 'failed'}`);
  return json as Record<string, unknown>;
}

const walletRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/wallet', { preHandler: [app.requireAuth] }, async (req) => {
    const [balance] = await sql`
      SELECT COALESCE(balance, 0)::int AS balance
      FROM coin_balances WHERE account_id = ${req.accountId}
    `;
    const history = await sql`
      SELECT delta::int, reason::text AS reason, created_at
      FROM coin_ledger
      WHERE account_id = ${req.accountId}
      ORDER BY id DESC LIMIT 30
    `;
    return { balance: balance?.balance ?? 0, packs: COIN_PACKS, history };
  });

  app.post('/v1/wallet/topup', { preHandler: [app.requireAuth] }, async (req) => {
    const { pack_id } = TopUpSchema.parse(req.body);
    const pack = COIN_PACKS.find((p) => p.id === pack_id)!;
    const payload = `topup:${randomUUID()}`;

    await sql`
      INSERT INTO star_purchases
        (account_id, telegram_charge_id, stars_amount, coins_granted, payload)
      VALUES (${req.accountId}, ${'pending:' + payload}, ${pack.stars}, ${pack.coins}, ${payload})
    `;

    const res = await botApi('createInvoiceLink', {
      title: pack.label,
      description: `Add ${pack.coins} coins to your RIDE balance`,
      payload,
      currency: 'XTR',
      prices: [{ label: pack.label, amount: pack.stars }],
    });

    return { invoice_url: res.result as string, pack };
  });

  /**
   * Custom top-up: the person types exactly how many coins they want.
   * Priced at 1 Star per coin — the same rate as the smallest pack, so
   * the fixed packs stay the better deal for bulk. Stars only supports
   * whole-number amounts, which a 1:1 rate satisfies by construction.
   */
  app.post('/v1/wallet/topup-custom', { preHandler: [app.requireAuth] }, async (req) => {
    const { coins } = z.object({
      coins: z.coerce.number().int().min(10).max(100000),
    }).parse(req.body);
    const stars = coins;
    const payload = `topup:${randomUUID()}`;

    await sql`
      INSERT INTO star_purchases
        (account_id, telegram_charge_id, stars_amount, coins_granted, payload)
      VALUES (${req.accountId}, ${'pending:' + payload}, ${stars}, ${coins}, ${payload})
    `;

    const res = await botApi('createInvoiceLink', {
      title: `${coins} coins`,
      description: `Add ${coins} coins to your RIDE balance`,
      payload,
      currency: 'XTR',
      prices: [{ label: `${coins} coins`, amount: stars }],
    });

    return { invoice_url: res.result as string, coins, stars };
  });

  /**
   * Donate Stars to whoever runs the app.
   *
   * Deliberately not a top-up: `coins_granted` is 0, so the payment
   * handler credits nothing and the donor's balance is untouched. It
   * reuses star_purchases because that table is already the record of
   * every Star that came in — a donation is one of those, and giving it
   * a separate table would split the revenue figure in the admin panel
   * across two places.
   */
  app.post('/v1/wallet/donate', { preHandler: [app.requireAuth] }, async (req) => {
    const { stars } = z.object({
      stars: z.coerce.number().int().min(1).max(100000),
    }).parse(req.body);
    const payload = `donate:${randomUUID()}`;

    await sql`
      INSERT INTO star_purchases
        (account_id, telegram_charge_id, stars_amount, coins_granted, payload)
      VALUES (${req.accountId}, ${'pending:' + payload}, ${stars}, 0, ${payload})
    `;

    const res = await botApi('createInvoiceLink', {
      title: 'Support RIDE',
      description: `Donate ${stars} Stars to the people who run RIDE`,
      payload,
      currency: 'XTR',
      prices: [{ label: `${stars} Stars`, amount: stars }],
    });

    return { invoice_url: res.result as string, stars };
  });

  /**
   * Health probe for the transport chooser: boot fetches this through
   * PUBLIC_API_URL to prove the public URL actually routes here before
   * pointing Telegram's webhook at it.
   */
  app.get('/v1/telegram/webhook', async () => ({ ok: true, service: 'ride-api' }));

  /**
   * Telegram webhook. Registered separately from the app's own auth —
   * requests come from Telegram, not from a user session. All the real
   * work lives in processTelegramUpdate, shared with the polling
   * fallback.
   */
  app.post('/v1/telegram/webhook', async (req, reply) => {
    if (config.TELEGRAM_WEBHOOK_SECRET) {
      const got = req.headers['x-telegram-bot-api-secret-token'];
      if (got !== config.TELEGRAM_WEBHOOK_SECRET) {
        throw new HttpError(401, 'BAD_WEBHOOK_SECRET');
      }
    }

    await processTelegramUpdate(
      req.body as TelegramUpdate,
      (obj, msg) => req.log.error(obj as object, msg),
    );

    // Telegram retries anything non-2xx, so always acknowledge —
    // including update types we don't handle.
    reply.code(200);
    return { ok: true };
  });
};

export default walletRoutes;
