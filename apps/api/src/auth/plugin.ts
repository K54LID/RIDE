import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { verifyInitData, InitDataError } from './telegram.js';
import { config } from '../config.js';
import { sql } from '../lib/db.js';

declare module 'fastify' {
  interface FastifyRequest {
    accountId?: string;
    role?: 'user' | 'moderator' | 'admin';
  }
}

/**
 * Resolves the Telegram identity to an internal account id and attaches
 * ONLY that id to the request. telegram_id never travels further up the
 * stack, so no route handler can accidentally serialise it into a
 * response.
 */
async function resolveAccount(telegramId: number, isPremium: boolean, lang?: string) {
  const rows = await sql<{ account_id: string; role: string; status: string }[]>`
    SELECT a.id AS account_id, a.role::text, a.status::text
    FROM telegram_identities ti
    JOIN accounts a ON a.id = ti.account_id
    WHERE ti.telegram_id = ${telegramId}
  `;

  if (rows.length === 0) return null;

  const row = rows[0]!;
  // Fire-and-forget freshness updates; never block the request path.
  void sql`
    UPDATE telegram_identities
    SET is_premium = ${isPremium}, language_code = ${lang ?? null}
    WHERE telegram_id = ${telegramId}
  `.catch(() => {});

  return row;
}

const authPlugin: FastifyPluginAsync = async (app) => {
  app.decorateRequest('accountId', undefined);
  app.decorateRequest('role', undefined);

  app.decorate('requireAuth', async (req: FastifyRequest) => {
    const header = req.headers['authorization'];
    if (typeof header !== 'string' || !header.startsWith('tma ')) {
      throw app.httpErrors.unauthorized('Missing initData');
    }

    let verified;
    try {
      verified = verifyInitData(header.slice(4), config.TELEGRAM_BOT_TOKEN);
    } catch (err) {
      if (err instanceof InitDataError) {
        // Log the code, never the raw initData — it contains user data.
        req.log.warn({ code: err.code }, 'initData rejected');
        throw app.httpErrors.unauthorized('Invalid initData');
      }
      throw err;
    }

    const account = await resolveAccount(
      verified.user.id,
      verified.user.is_premium ?? false,
      verified.user.language_code,
    );

    if (!account) {
      // Signature is valid but no account yet — the client should route
      // into onboarding rather than treat this as an auth failure.
      throw app.httpErrors.forbidden('ONBOARDING_REQUIRED');
    }
    if (account.status === 'banned' || account.status === 'deleted') {
      throw app.httpErrors.forbidden('ACCOUNT_UNAVAILABLE');
    }

    req.accountId = account.account_id;
    req.role = account.role as 'user' | 'moderator' | 'admin';
  });
};

export default fp(authPlugin, { name: 'auth' });
