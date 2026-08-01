import { sql } from './db.js';
import { config } from '../config.js';
import {
  handleBotCommand, handleLocationMessage, handleStopLocation,
} from './botCommands.js';

/**
 * One Telegram update, wherever it arrived from.
 *
 * The exact same function serves the webhook route and the getUpdates
 * polling fallback — the bot's behaviour cannot drift between the two
 * transports because there is only one implementation.
 */

export interface TelegramUpdate {
  update_id?: number;
  message?: {
    chat?: { id: number };
    from?: { id?: number; language_code?: string };
    text?: string;
    location?: { latitude: number; longitude: number };
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
}

async function botApi(method: string, body: unknown): Promise<{ ok: boolean; result?: unknown; description?: string }> {
  const res = await fetch(
    `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/${method}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  return (await res.json()) as { ok: boolean; result?: unknown; description?: string };
}

export async function processTelegramUpdate(
  update: TelegramUpdate,
  log: (obj: unknown, msg: string) => void,
): Promise<void> {
  // A shared location from the /start keyboard — grid-snapped and
  // stored so Discover's distance and "nearby" sort have data.
  const msg = update.message;
  if (msg?.location && msg.chat && msg.from?.id) {
    await handleLocationMessage(
      msg.from.id, msg.chat.id,
      msg.location.latitude, msg.location.longitude,
      msg.from.language_code ?? null);
    return;
  }

  // Plain chat commands (/start, /help, /stoplocation) — the only
  // thing the bot itself does besides payments and pushes.
  if (msg?.text && msg.chat) {
    if (msg.text.trim().toLowerCase().startsWith('/stoplocation') && msg.from?.id) {
      await handleStopLocation(msg.from.id, msg.chat.id, msg.from.language_code ?? null);
      return;
    }
    const handled = await handleBotCommand(
      msg.chat.id, msg.text, msg.from?.language_code ?? null);
    if (handled) return;
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
    const answer = await botApi('answerPreCheckoutQuery', {
      pre_checkout_query_id: pcq.id,
      ok,
      ...(ok ? {} : { error_message: 'This purchase session has expired. Please start again.' }),
    });
    if (!answer.ok) log({ description: answer.description }, 'answerPreCheckoutQuery failed');
    return;
  }

  const payment = update.message?.successful_payment;
  if (!payment) return;

  await sql.begin(async (tx) => {
    const [purchase] = await tx<{ account_id: string; coins_granted: number }[]>`
      UPDATE star_purchases
      SET telegram_charge_id = ${payment.telegram_payment_charge_id}
      WHERE payload = ${payment.invoice_payload}
        AND telegram_charge_id LIKE 'pending:%'
      RETURNING account_id, coins_granted::int
    `;
    if (!purchase) return; // already processed, or unknown payload

    /**
     * A donation is recorded as a Star purchase granting zero coins, so
     * the payment is captured in revenue without touching the balance.
     * Skip the ledger entirely rather than writing a delta of 0: a
     * zero-value row is noise in a person's wallet history and would
     * read as a failed purchase.
     */
    if (purchase.coins_granted <= 0) return;

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
}

/**
 * Choose and start the update transport.
 *
 * Webhook when PUBLIC_API_URL is set AND actually routes to this
 * service — verified by fetching our own health endpoint through the
 * public URL. If the URL points somewhere else (the common mistake is
 * setting it to the web app's domain), or is unset, fall back to
 * getUpdates long-polling so the bot works regardless.
 */
export function startTelegramTransport(log: (msg: string) => void): void {
  void (async () => {
    const url = config.PUBLIC_API_URL?.replace(/\/$/, '');

    if (url) {
      const reachable = await fetch(`${url}/v1/telegram/webhook`, {
        method: 'GET', signal: AbortSignal.timeout(6000),
      })
        .then(async (r) => {
          const j = (await r.json().catch(() => null)) as { service?: string } | null;
          return j?.service === 'ride-api';
        })
        .catch(() => false);

      if (reachable) {
        const res = await botApi('setWebhook', {
          url: `${url}/v1/telegram/webhook`,
          allowed_updates: ['message', 'pre_checkout_query'],
          ...(config.TELEGRAM_WEBHOOK_SECRET
            ? { secret_token: config.TELEGRAM_WEBHOOK_SECRET } : {}),
        }).catch(() => ({ ok: false, description: 'network error' }));
        if (res.ok) { log('Telegram webhook registered'); return; }
        log(`setWebhook failed (${res.description ?? 'unknown'}) — falling back to polling`);
      } else {
        log(`PUBLIC_API_URL (${url}) does not route to this API — falling back to polling. ` +
            'Set it to the API origin (e.g. https://api.ridethatbot.fun) to use webhooks.');
      }
    } else {
      log('PUBLIC_API_URL not set — using getUpdates polling for the bot');
    }

    // Polling path. Webhook and getUpdates are mutually exclusive on
    // Telegram's side, so clear any stale webhook first.
    await botApi('deleteWebhook', { drop_pending_updates: false }).catch(() => undefined);

    let offset = 0;
    let failures = 0;
    // Single in-process loop; if the API ever runs multiple replicas,
    // switch to webhooks (set PUBLIC_API_URL) — two pollers would
    // race for the same updates.
    for (;;) {
      try {
        const res = await botApi('getUpdates', {
          offset, timeout: 25, allowed_updates: ['message', 'pre_checkout_query'],
        });
        failures = 0;
        const updates = (res.result ?? []) as TelegramUpdate[];
        for (const u of updates) {
          if (typeof u.update_id === 'number') offset = u.update_id + 1;
          await processTelegramUpdate(u, (obj, m) => log(`${m} ${JSON.stringify(obj)}`))
            .catch((err: unknown) => log(
              `update processing failed: ${err instanceof Error ? err.message : 'error'}`));
        }
      } catch {
        // Backoff so a Telegram outage doesn't spin the loop hot.
        failures = Math.min(failures + 1, 6);
        await new Promise((r) => setTimeout(r, 1000 * 2 ** failures));
      }
    }
  })();
}
