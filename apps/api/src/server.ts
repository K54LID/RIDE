import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import { sql } from './lib/db.js';
import { HttpError } from './lib/errors.js';
import { runMigrations } from './lib/migrate.js';
import authPlugin from './auth/plugin.js';

const app = Fastify({
  logger: {
    level: config.NODE_ENV === 'production' ? 'info' : 'debug',
    redact: ['req.headers.authorization', 'req.headers.cookie'],
  },
  trustProxy: true, // behind Traefik
});

/**
 * Extracts an HTTP status from an unknown thrown value using `in`
 * narrowing, so nothing is asserted that TypeScript hasn't verified.
 */
function clientStatusOf(err: unknown): number | null {
  if (typeof err !== 'object' || err === null) return null;
  if (!('statusCode' in err)) return null;
  const { statusCode } = err;
  if (typeof statusCode !== 'number') return null;
  if (statusCode < 400 || statusCode >= 500) return null;
  return statusCode;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : 'Request failed';
}

/**
 * Single error shape for the whole API: { code, message }.
 * Clients branch on `code`; `message` is for humans and logs only.
 */
app.setErrorHandler((err: unknown, req, reply) => {
  if (err instanceof HttpError) {
    return reply
      .status(err.statusCode)
      .send({ code: err.code, message: err.message });
  }

  const status = clientStatusOf(err);
  if (status !== null) {
    return reply.status(status).send({
      code: status === 429 ? 'RATE_LIMITED' : 'BAD_REQUEST',
      message: messageOf(err),
    });
  }

  // Never leak internal messages — Postgres errors carry SQL fragments.
  req.log.error({ err }, 'unhandled error');
  return reply
    .status(500)
    .send({ code: 'INTERNAL', message: 'Something went wrong' });
});

// Schema must exist before the first request arrives. An advisory lock
// makes this safe when several containers boot at once. Failing here is
// intentional: serving traffic against a stale schema is worse than not
// starting at all.
await runMigrations(sql, (msg) => app.log.info({ scope: 'migrate' }, msg));

await app.register(helmet, { contentSecurityPolicy: false });
await app.register(cors, {
  origin: config.CORS_ORIGIN.split(',').map((s) => s.trim()),
  credentials: true,
});
await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
await app.register(authPlugin);

// Liveness + DB reachability. Coolify's healthcheck hits this.
app.get('/health', async () => {
  await sql`SELECT 1`;
  return { ok: true, ts: new Date().toISOString() };
});

app.get('/v1/me', { preHandler: [app.requireAuth] }, async (req) => {
  const rows = await sql`
    SELECT p.display_name, p.handle, p.bio, p.court_value,
           p.verification::text AS verification, p.vip_until,
           COALESCE(b.balance, 0) AS coin_balance
    FROM profiles p
    LEFT JOIN coin_balances b ON b.account_id = p.account_id
    WHERE p.account_id = ${req.accountId}
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
