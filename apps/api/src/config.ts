import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  TELEGRAM_BOT_TOKEN: z.string().min(20),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(16).optional(),
  // Private channel that holds uploaded media. The bot must be an admin
  // of it. Format: -100xxxxxxxxxx
  TELEGRAM_STORAGE_CHAT_ID: z.string().min(4),
  SESSION_SECRET: z.string().min(32),
  CORS_ORIGIN: z.string().default('https://ridethatbot.fun'),
  LOCATION_GRID_METERS: z.coerce.number().default(500),
});

// Fail loudly at boot rather than at the first request.
const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
