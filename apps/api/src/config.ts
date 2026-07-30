import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  TELEGRAM_BOT_TOKEN: z.string().min(20),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(16).optional(),
  /**
   * Private channel holding uploaded media; the bot must be an admin.
   *
   * Canonical form is -100xxxxxxxxxx, but several env editors treat a
   * leading dash as an option delimiter and silently strip it, leaving
   * 100xxxxxxxxxx which Telegram rejects with "chat not found". Rather
   * than depend on everyone quoting the value correctly, normalise it:
   * a bare 100-prefixed numeric id gets its dash back. A @username or
   * an already-negative id passes through untouched.
   */
  /**
   * Private channel holding uploaded media; the bot must be an admin.
   *
   * Canonical form is -100xxxxxxxxxx. In practice this value arrives
   * mangled in several ways: env editors strip a leading dash (treating
   * it as an option delimiter), or store the surrounding quotes
   * literally, sometimes backslash-escaped. Telegram then answers
   * "chat not found" for what is really a formatting problem.
   *
   * So rather than trust the string, we extract the number from it and
   * rebuild the id. An explicit minus sign is honoured (old-style group
   * ids are not -100 prefixed); otherwise a 100-prefixed number gets its
   * dash back and a bare internal id gets the full prefix.
   */
  TELEGRAM_STORAGE_CHAT_ID: z
    .string()
    .min(4)
    .transform((raw) => {
      const cleaned = raw.trim().replace(/[\\"'\s]/g, '');
      if (cleaned.startsWith('@')) return cleaned;

      const negative = cleaned.startsWith('-');
      const digits = cleaned.replace(/\D/g, '');
      if (digits.length === 0) return cleaned;

      if (negative) return `-${digits}`;
      if (digits.startsWith('100')) return `-${digits}`;
      return `-100${digits}`;
    }),
  SESSION_SECRET: z.string().min(32),
  CORS_ORIGIN: z.string().default('https://ridethatbot.fun'),
  // Used as the deep link in Telegram push notifications.
  MINI_APP_URL: z.string().default('https://ridethatbot.fun'),
  // Public base URL of this API (e.g. https://api.ridethatbot.fun).
  // When set, the server registers its Telegram webhook on boot — the
  // step that, when skipped, makes /start silent and leaves Stars
  // payments stuck at the pre-checkout screen.
  PUBLIC_API_URL: z.string().url().optional(),
  // Comma-separated Telegram user IDs promoted to admin on sign-in.
  // Without this nobody can ever become an admin: the only grant
  // endpoint is itself admin-only, so the panel would stay invisible
  // forever and verification requests could never be approved.
  ADMIN_TELEGRAM_IDS: z.string().default(''),
  LOCATION_GRID_METERS: z.coerce.number().default(500),
});

// Fail loudly at boot rather than at the first request.
const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
