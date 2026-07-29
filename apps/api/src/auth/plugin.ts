import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { verifyInitData, InitDataError } from './telegram.js';
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
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

interface AccountRow {
  account_id: string;
  role: AccountRole;
  status: string;
}

/**
 * Resolves the Telegram identity to an internal account id and attaches
 * ONLY that id to the request. telegram_id never travels further up the
 * stack, so no route handler can accidentally serialise it.
 */
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

  // Fire-and-forget freshness update; never block the request path.
  void sql`
    UPDATE telegram_identities
    SET is_premium = ${isPremium}, language_code = ${lang}
    WHERE telegram_id = ${telegramId}
  `.catch(() => undefined);

  return row;
}

const authPlugin: FastifyPluginAsync = async (app) => {
  // Fastify v5 requires a concrete default value; `undefined` is not
  // accepted, which is why these are `null` rather than optional.
  app.decorateRequest('accountId', null);
  app.decorateRequest('role', null);

  app.decorate('requireAuth', async (req: FastifyRequest) => {
    const header = req.headers.authorization;
    if (typeof header !== 'string' || !header.startsWith('tma ')) {
      throw unauthorized('MISSING_INIT_DATA');
    }

    let verified;
    try {
      verified = verifyInitData(header.slice(4), config.TELEGRAM_BOT_TOKEN);
    } catch (err) {
      if (err instanceof InitDataError) {
        // Log the code, never the raw initData — it carries user data.
        req.log.warn({ code: err.code }, 'initData rejected');
        throw unauthorized('INVALID_INIT_DATA');
      }
      throw err;
    }

    const account = await resolveAccount(
      verified.user.id,
      verified.user.is_premium ?? false,
      verified.user.language_code ?? null,
    );

    if (!account) {
      // Signature valid, no account yet — the client routes into
      // onboarding rather than treating this as an auth failure.
      throw forbidden('ONBOARDING_REQUIRED');
    }
    if (account.status === 'banned' || account.status === 'deleted') {
      throw forbidden('ACCOUNT_UNAVAILABLE');
    }

    req.accountId = account.account_id;
    req.role = account.role;
  });
};

export default fp(authPlugin, { name: 'auth' });
