import { config } from '../config.js';

/**
 * The bot's own @username, and the t.me links built from it.
 *
 * Sharing a post or a referral used to send `https://ridethatbot.fun` —
 * a website, not the bot. Someone opening that link on a phone gets a
 * page, not the app, and the referral code with it goes nowhere. A
 * t.me link opens the bot inside Telegram, which is the only place
 * RIDE actually exists.
 *
 * The username is asked of Telegram once (getMe) and cached, rather
 * than added as another env var somebody has to keep in step with the
 * token. If the call fails we fall back to MINI_APP_URL, which is at
 * least a working link, and try again on the next request.
 */

let cached: string | null = null;
let inFlight: Promise<string | null> | null = null;

async function fetchUsername(): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/getMe`);
    const json = (await res.json()) as { ok: boolean; result?: { username?: string } };
    return json.ok && json.result?.username ? json.result.username : null;
  } catch {
    return null;
  }
}

export async function botUsername(): Promise<string | null> {
  if (cached) return cached;
  // Collapse concurrent callers onto one request — /v1/me is hit by
  // every client on launch.
  inFlight ??= fetchUsername().then((u) => {
    if (u) cached = u;
    inFlight = null;
    return u;
  });
  return inFlight;
}

/**
 * A link that opens the bot. `payload` becomes the /start parameter, so
 * a referral code survives the trip through Telegram's share sheet.
 */
export async function botLink(payload?: string): Promise<string> {
  const username = await botUsername();
  if (!username) return config.MINI_APP_URL;
  const base = `https://t.me/${username}`;
  return payload ? `${base}?start=${encodeURIComponent(payload)}` : base;
}
