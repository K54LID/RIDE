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
  TELEGRAM_STORAGE_CHAT_ID: z
    .string()
    .min(4)
    .transform((raw) => {
      const v = raw.trim().replace(/^["']|["']$/g, '');
      if (v.startsWith('@') || v.startsWith('-')) return v;
      if (/^100\d{6,}$/.test(v)) return `-${v}`;   // dash was stripped
      if (/^\d{6,}$/.test(v)) return `-100${v}`;   // raw internal id
      return v;
    }),
  SESSION_SECRET: z.string().min(32),
  CORS_ORIGIN: z.string().default('https://ridethatbot.fun'),
  // Used as the deep link in Telegram push notifications.
  MINI_APP_URL: z.string().default('https://ridethatbot.fun'),
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
