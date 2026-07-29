import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Telegram Mini App initData verification.
 *
 * This is the single most security-critical function in the codebase.
 * If it is wrong, anyone can impersonate any user by hand-crafting a
 * query string. Do not "simplify" it.
 *
 * Algorithm (per Telegram Mini Apps spec):
 *   1. Parse initData as a query string.
 *   2. Remove the `hash` field. Keep everything else, including
 *      `signature` if present.
 *   3. Sort remaining fields by key, join as "key=value" with "\n".
 *   4. secret = HMAC_SHA256(key: "WebAppData", message: botToken)
 *      ^ note the inversion: the literal string is the KEY, the bot
 *        token is the MESSAGE. Getting this backwards is the classic bug.
 *   5. expected = HMAC_SHA256(key: secret, message: dataCheckString)
 *   6. Compare in constant time.
 *   7. Reject stale auth_date.
 */

export interface TelegramUser {
  id: number;
  is_premium?: boolean;
  language_code?: string;
  // Deliberately NOT destructured further. username, first_name,
  // last_name and photo_url arrive in the payload but must never be
  // persisted or forwarded — see db/migrations/001 header notes.
}

export interface VerifiedInitData {
  user: TelegramUser;
  authDate: Date;
  startParam?: string;
}

export class InitDataError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'malformed'
      | 'missing_hash'
      | 'bad_signature'
      | 'expired'
      | 'no_user',
  ) {
    super(message);
    this.name = 'InitDataError';
  }
}

const MAX_AGE_SECONDS = 3600;

export function verifyInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds: number = MAX_AGE_SECONDS,
): VerifiedInitData {
  if (!initData || typeof initData !== 'string') {
    throw new InitDataError('initData missing', 'malformed');
  }

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) {
    throw new InitDataError('hash field absent', 'missing_hash');
  }

  // URLSearchParams decodes values; the data-check-string is built from
  // the DECODED values. This is correct per spec.
  const pairs: string[] = [];
  for (const [key, value] of params.entries()) {
    if (key === 'hash') continue;
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join('\n');

  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret)
    .update(dataCheckString)
    .digest('hex');

  const received = Buffer.from(hash, 'hex');
  const computed = Buffer.from(expected, 'hex');
  if (
    received.length !== computed.length ||
    !timingSafeEqual(received, computed)
  ) {
    throw new InitDataError('signature mismatch', 'bad_signature');
  }

  // Replay protection. Without this, a signature captured once stays
  // valid forever.
  const authDateRaw = params.get('auth_date');
  const authDateSeconds = Number(authDateRaw);
  if (!authDateRaw || !Number.isFinite(authDateSeconds)) {
    throw new InitDataError('auth_date missing or invalid', 'malformed');
  }
  const ageSeconds = Math.floor(Date.now() / 1000) - authDateSeconds;
  if (ageSeconds > maxAgeSeconds) {
    throw new InitDataError(`initData is ${ageSeconds}s old`, 'expired');
  }

  const userRaw = params.get('user');
  if (!userRaw) {
    // Happens when the Mini App is opened from an inline button in a
    // channel rather than a direct chat. Treat as unauthenticated.
    throw new InitDataError('no user in initData', 'no_user');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(userRaw);
  } catch {
    throw new InitDataError('user field is not valid JSON', 'malformed');
  }

  const candidate = parsed as Record<string, unknown>;
  if (typeof candidate.id !== 'number') {
    throw new InitDataError('user.id absent', 'malformed');
  }

  return {
    user: {
      id: candidate.id,
      is_premium:
        typeof candidate.is_premium === 'boolean'
          ? candidate.is_premium
          : undefined,
      language_code:
        typeof candidate.language_code === 'string'
          ? candidate.language_code
          : undefined,
    },
    authDate: new Date(authDateSeconds * 1000),
    startParam: params.get('start_param') ?? undefined,
  };
}
