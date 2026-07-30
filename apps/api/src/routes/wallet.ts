import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { sql } from '../lib/db.js';
import { config } from '../config.js';
import { HttpError } from '../lib/errors.js';
import { handleBotCommand } from '../lib/botCommands.js';

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
   * Telegram webhook. Registered separately from the app's own auth —
   * requests come from Telegram, not from a user session.
   */
  app.post('/v1/telegram/webhook', async (req, reply) => {
    if (config.TELEGRAM_WEBHOOK_SECRET) {
      const got = req.headers['x-telegram-bot-api-secret-token'];
      if (got !== config.TELEGRAM_WEBHOOK_SECRET) {
        throw new HttpError(401, 'BAD_WEBHOOK_SECRET');
      }
    }

    const update = req.body as {
      message?: {
        chat?: { id: number };
        from?: { language_code?: string };
        text?: string;
        successful_payment?: {
          invoice_payload: string;
          telegram_payment_charge_id: string;
          total_amount: number;
        };
      };
      pre_checkout_query?: {
        id: string;
        invoice_payload: string;
      };
    };

    // Plain chat commands (/start, /help) — the only thing the bot
    // itself does besides payments and pushes.
    const msg = update.message;
    if (msg?.text && msg.chat) {
      const handled = await handleBotCommand(
        msg.chat.id, msg.text, msg.from?.language_code ?? null);
      if (handled) { reply.code(200); return { ok: true }; }
    }

    /**
     * Telegram holds the payment sheet open until we answer the
     * pre-checkout query, and fails the purchase if no answer arrives
     * within ten seconds. Approve only payloads we actually issued and
     * that are still pending — anything else gets a refusal the user
     * can read instead of a silent decline.
     */
    const pcq = update.pre_checkout_query;
    if (pcq) {
      const known = await sql`
        SELECT 1 FROM star_purchases
        WHERE payload = ${pcq.invoice_payload}
          AND telegram_charge_id LIKE 'pending:%'
      `;
      const ok = known.length > 0;
      try {
        await botApi('answerPreCheckoutQuery', {
          pre_checkout_query_id: pcq.id,
          ok,
          ...(ok ? {} : { error_message: 'This purchase session has expired. Please start again.' }),
        });
      } catch (err) {
        req.log.error({ err }, 'answerPreCheckoutQuery failed');
      }
      reply.code(200);
      return { ok: true };
    }

    const payment = update.message?.successful_payment;
    if (!payment) {
      // Telegram retries anything non-2xx, so acknowledge updates we
      // don't handle rather than letting them queue up forever.
      reply.code(200);
      return { ok: true };
    }

    await sql.begin(async (tx) => {
      const [purchase] = await tx<{ account_id: string; coins_granted: number }[]>`
        UPDATE star_purchases
        SET telegram_charge_id = ${payment.telegram_payment_charge_id}
        WHERE payload = ${payment.invoice_payload}
          AND telegram_charge_id LIKE 'pending:%'
        RETURNING account_id, coins_granted::int
      `;
      if (!purchase) return; // already processed, or unknown payload

      await tx`
        INSERT INTO coin_ledger (account_id, delta, reason, ref_type, ref_id, idempotency_key)
        VALUES (${purchase.account_id}, ${purchase.coins_granted}, 'stars_purchase',
                'star_purchase', ${payment.invoice_payload},
                ${'stars:' + payment.telegram_payment_charge_id})
      `;
      await tx`
        INSERT INTO coin_balances (account_id, balance)
        VALUES (${purchase.account_id}, ${purchase.coins_granted})
        ON CONFLICT (account_id)
        DO UPDATE SET balance = coin_balances.balance + ${purchase.coins_granted},
                      updated_at = now()
      `;
    });

    reply.code(200);
    return { ok: true };
  });
};

export default walletRoutes;
