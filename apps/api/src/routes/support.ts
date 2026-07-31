import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { sql } from '../lib/db.js';
import { HttpError } from '../lib/errors.js';
import { notify } from '../lib/notify.js';

/**
 * Contact support and report a bug.
 *
 * Both buttons used to open a bare t.me link, so nothing a person wrote
 * reached anyone. A message now does two things at once: it is stored
 * for the admin panel, and it is pushed to every staff account's
 * Telegram through the existing notification outbox — carrying who sent
 * it and what they wrote, so an admin can act on it without opening the
 * panel at all.
 *
 * The push goes to staff *accounts*, which means it travels the normal
 * notifications → telegram_identities path. No Telegram id is read
 * here and none is returned; the invariant about never joining
 * identities into a public response holds.
 */

const SubmitSchema = z.object({
  kind: z.enum(['support', 'bug']),
  message: z.string().trim().min(1).max(2000),
});

/** Enough of the message for a push notification to be worth reading. */
const EXCERPT = 300;

const supportRoutes: FastifyPluginAsync = async (app) => {
  const staffOnly = async (req: FastifyRequest) => {
    if (req.role !== 'admin' && req.role !== 'moderator') {
      throw new HttpError(403, 'NOT_STAFF');
    }
  };

  app.post('/v1/support', { preHandler: [app.requireAuth] }, async (req) => {
    const parsed = SubmitSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'INVALID_BODY', parsed.error.issues[0]?.message);
    }
    const { kind, message } = parsed.data;
    const me = req.accountId!;

    /**
     * One open message of each kind at a time. Without this a stuck
     * send button, or someone venting, buries the panel — and the
     * second copy tells an admin nothing the first didn't.
     */
    const [open] = await sql<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM support_messages
      WHERE account_id = ${me} AND kind = ${kind} AND state = 'open'
    `;
    if ((open?.n ?? 0) >= 3) throw new HttpError(429, 'TOO_MANY_OPEN',
      'You already have messages waiting for a reply.');

    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO support_messages (account_id, kind, body)
        VALUES (${me}, ${kind}, ${message})
      `;

      const [sender] = await tx<Array<{ handle: string | null; display_name: string }>>`
        SELECT handle, display_name FROM profiles WHERE account_id = ${me}
      `;

      const staff = await tx<Array<{ id: string }>>`
        SELECT id FROM accounts
        WHERE role IN ('admin', 'moderator') AND status = 'active'
      `;
      for (const s of staff) {
        await notify(tx, {
          accountId: s.id,
          actorId: me,
          kind: 'support_message',
          payload: {
            support_kind: kind,
            handle: sender?.handle ?? null,
            name: sender?.display_name ?? null,
            excerpt: message.slice(0, EXCERPT),
          },
        });
      }
    });

    return { ok: true };
  });

  app.get('/v1/admin/support', { preHandler: [app.requireAuth, staffOnly] }, async () => {
    const rows = await sql`
      SELECT s.id::text AS id, s.kind, s.body, s.created_at,
             s.account_id,
             p.display_name, p.handle,
             (SELECT ph.media_id FROM profile_photos ph
              WHERE ph.account_id = s.account_id AND ph.position = 0
                AND NOT ph.is_private AND ph.media_id IS NOT NULL
              LIMIT 1) AS avatar_media_id
      FROM support_messages s
      LEFT JOIN profiles p ON p.account_id = s.account_id
      WHERE s.state = 'open'
      ORDER BY s.created_at DESC
      LIMIT 100
    `;
    return { messages: rows };
  });

  app.post('/v1/admin/support/:id/resolve',
           { preHandler: [app.requireAuth, staffOnly] }, async (req) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params);
    await sql`
      UPDATE support_messages
      SET state = 'handled', handled_by = ${req.accountId}, handled_at = now()
      WHERE id = ${id}
    `;
    return { ok: true };
  });
};

export default supportRoutes;
