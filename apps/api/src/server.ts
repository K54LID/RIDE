import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import { sql } from './lib/db.js';
import authPlugin from './auth/plugin.js';

const app = Fastify({
  logger: {
    level: config.NODE_ENV === 'production' ? 'info' : 'debug',
    // Strip anything that could carry user content into logs.
    redact: ['req.headers.authorization', 'req.headers.cookie'],
  },
  trustProxy: true, // behind Traefik
});

await app.register(helmet, { contentSecurityPolicy: false });
await app.register(cors, {
  origin: config.CORS_ORIGIN.split(',').map((s) => s.trim()),
  credentials: true,
});
await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
await app.register(authPlugin);

app.get('/health', async () => {
  await sql`SELECT 1`;
  return { ok: true, ts: new Date().toISOString() };
});

app.get('/v1/me', { preHandler: [app.requireAuth] }, async (req) => {
  const rows = await sql`
    SELECT p.display_name, p.handle, p.bio, p.court_value,
           p.verification::text, p.vip_until,
           COALESCE(b.balance, 0) AS coin_balance
    FROM profiles p
    LEFT JOIN coin_balances b ON b.account_id = p.account_id
    WHERE p.account_id = ${req.accountId!}
  `;
  return rows[0] ?? null;
});

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  await sql.end({ timeout: 5 });
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ port: config.PORT, host: '0.0.0.0' });
