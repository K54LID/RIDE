import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { verifyInitData, InitDataError, type VerifiedInitData } from './telegram.js';
import { config } from '../config.js';
import { sql } from '../lib/db.js';
import { forbidden, unauthorized } from '../lib/errors.js';

export type AccountRole = 'user' | 'moderator' | 'admin';

declare module 'fastify' {
  interface FastifyRequest {
    accountId: string | null;
    role: AccountRole | null;
  }
  interface FastifyInstance {
    /** Verify initData only — for routes that run BEFORE an account exists. */
    verifyTma: (req: FastifyRequest) => VerifiedInitData;
    /** Verify initData AND resolve to an existing, non-banned account. */
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

interface AccountRow {
  account_id: string;
  role: AccountRole;
  status: string;
}

async function resolveAccount(
  telegramId: number,
  isPremium: boolean,
  lang: string | null,
): Promise<AccountRow | null> {
  const rows = await sql<AccountRow[]>`
    SELECT a.id AS account_id, a.role::text AS role, a.status::text AS status
    FROM telegram_identities ti
    JOIN accounts a ON a.id = ti.account_id
    WHERE ti.telegram_id = ${telegramId}
  `;
  const row = rows[0];
  if (!row) return null;

  // Fire-and-forget: presence must never add latency to the request
  // path, and a lost update just means a slightly stale "last active".
  void sql`
    UPDATE telegram_identities
    SET is_premium = ${isPremium}, language_code = ${lang}
    WHERE telegram_id = ${telegramId}
  `.catch(() => undefined);

  void sql`
    UPDATE accounts SET last_seen_at = now()
    WHERE id = ${row.account_id} AND last_seen_at < now() - interval '60 seconds'
  `.catch(() => undefined);

  return row;
}

const authPlugin: FastifyPluginAsync = async (app) => {
  app.decorateRequest('accountId', null);
  app.decorateRequest('role', null);

  app.decorate('verifyTma', (req: FastifyRequest): VerifiedInitData => {
    const header = req.headers.authorization;
    if (typeof header !== 'string' || !header.startsWith('tma ')) {
      throw unauthorized('MISSING_INIT_DATA');
    }
    try {
      return verifyInitData(header.slice(4), config.TELEGRAM_BOT_TOKEN);
    } catch (err) {
      if (err instanceof InitDataError) {
        req.log.warn({ code: err.code }, 'initData rejected');
        throw unauthorized('INVALID_INIT_DATA');
      }
      throw err;
    }
  });

  app.decorate('requireAuth', async (req: FastifyRequest) => {
    const verified = app.verifyTma(req);

    const account = await resolveAccount(
      verified.user.id,
      verified.user.is_premium ?? false,
      verified.user.language_code ?? null,
    );

    if (!account) throw forbidden('ONBOARDING_REQUIRED');
    if (account.status === 'banned' || account.status === 'deleted') {
      throw forbidden('ACCOUNT_UNAVAILABLE');
    }

    req.accountId = account.account_id;
    req.role = account.role;
  });
};

export default fp(authPlugin, { name: 'auth' });
