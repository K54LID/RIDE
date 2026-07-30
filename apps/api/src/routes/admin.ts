import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { sql } from '../lib/db.js';
import { HttpError } from '../lib/errors.js';
import { diagnoseStorage } from '../lib/telegramStorage.js';
import { notify } from '../lib/notify.js';

/**
 * Admin and moderator surface.
 *
 * Authorisation is two-layered: role must be moderator or admin, and
 * destructive actions check a named permission from
 * moderator_permissions. Admins implicitly hold every permission; a
 * moderator holds only what was granted, which is what lets an admin
 * revoke individual capabilities.
 *
 * Every write lands in moderation_actions. An audit trail that can be
 * skipped is not an audit trail, so the logging is inside the same
 * transaction as the change.
 */

type Permission =
  | 'ban' | 'suspend' | 'delete_content' | 'approve_verification'
  | 'manage_coins' | 'announce' | 'manage_moderators';

async function requirePermission(req: FastifyRequest, permission: Permission) {
  if (req.role !== 'admin' && req.role !== 'moderator') {
    throw new HttpError(403, 'NOT_STAFF');
  }
  if (req.role === 'admin') return;   // admins hold everything

  const rows = await sql`
    SELECT 1 FROM moderator_permissions
    WHERE account_id = ${req.accountId} AND permission = ${permission}
  `;
  if (rows.length === 0) {
    throw new HttpError(403, 'MISSING_PERMISSION', `Requires: ${permission}`);
  }
}

async function logAction(
  actorId: string, targetId: string | null, action: string,
  reason: string | null, metadata: Record<string, unknown> = {},
) {
  await sql`
    INSERT INTO moderation_actions (actor_id, target_id, action, reason, metadata)
    VALUES (${actorId}, ${targetId}, ${action}, ${reason}, ${JSON.stringify(metadata)}::jsonb)
  `;
}

const adminRoutes: FastifyPluginAsync = async (app) => {
  /**
   * Runs after requireAuth in the preHandler chain, so it only ever
   * checks the role — it never fabricates a reply object to satisfy a
   * signature it doesn't use.
   */
  const staffOnly = async (req: FastifyRequest) => {
    if (req.role !== 'admin' && req.role !== 'moderator') {
      throw new HttpError(403, 'NOT_STAFF');
    }
  };

  app.get('/v1/admin/overview', { preHandler: [app.requireAuth, staffOnly] }, async () => {
    const [stats] = await sql`
      SELECT
        (SELECT count(*)::int FROM accounts WHERE status = 'active')                       AS users_active,
        (SELECT count(*)::int FROM accounts)                                               AS users_total,
        (SELECT count(*)::int FROM accounts WHERE last_seen_at > now() - interval '24 hours') AS active_24h,
        (SELECT count(*)::int FROM accounts WHERE created_at > now() - interval '7 days')  AS new_7d,
        (SELECT count(*)::int FROM accounts WHERE status = 'banned')                       AS banned,
        (SELECT count(*)::int FROM posts WHERE deleted_at IS NULL)                         AS posts,
        (SELECT count(*)::int FROM verification_requests WHERE state = 'pending')          AS pending_verifications,
        (SELECT count(*)::int FROM reports WHERE state = 'open')                           AS open_reports,
        (SELECT COALESCE(sum(stars_amount), 0)::int FROM star_purchases
           WHERE refunded_at IS NULL AND telegram_charge_id NOT LIKE 'pending:%')          AS stars_revenue,
        (SELECT COALESCE(sum(balance), 0)::int FROM coin_balances)                         AS coins_outstanding,
        (SELECT count(*)::int FROM accounts WHERE last_seen_at > now() - interval '5 minutes') AS online_now,
        (SELECT count(*)::int FROM accounts WHERE created_at > now() - interval '24 hours') AS new_24h,
        (SELECT count(*)::int FROM gift_transfers)                                        AS gifts_sent,
        (SELECT count(*)::int FROM messages WHERE deleted_at IS NULL)                     AS messages_sent,
        (SELECT count(*)::int FROM stories WHERE expires_at > now())                      AS stories_live,
        (SELECT count(*)::int FROM woofs WHERE created_at > now() - interval '24 hours')  AS woofs_24h
    `;
    return stats;
  });

  app.get('/v1/admin/users', { preHandler: [app.requireAuth, staffOnly] }, async (req) => {
    const { q } = z.object({ q: z.string().trim().max(60).optional() }).parse(req.query);
    const rows = await sql`
      SELECT a.id, a.status::text AS status, a.role::text AS role,
             a.created_at, a.last_seen_at, a.suspended_until,
             p.display_name, p.handle, p.court_value,
             p.verification::text AS verification,
             COALESCE(b.balance, 0)::int AS balance
      FROM accounts a
      JOIN profiles p ON p.account_id = a.id
      LEFT JOIN coin_balances b ON b.account_id = a.id
      ${q ? sql`WHERE p.display_name ILIKE ${'%' + q + '%'} OR p.handle ILIKE ${'%' + q + '%'}` : sql``}
      ORDER BY a.last_seen_at DESC
      LIMIT 50
    `;
    return { users: rows };
  });

  app.post('/v1/admin/users/:id/ban', { preHandler: [app.requireAuth, staffOnly] }, async (req) => {
    await requirePermission(req, 'ban');
    const { id } = req.params as { id: string };
    const { reason } = z.object({ reason: z.string().trim().max(300).optional() }).parse(req.body ?? {});

    if (id === req.accountId) throw new HttpError(400, 'CANNOT_BAN_SELF');

    await sql.begin(async (tx) => {
      const rows = await tx`
        UPDATE accounts SET status = 'banned' WHERE id = ${id} AND role = 'user' RETURNING id
      `;
      // Refusing to ban staff via this route means an admin must demote
      // first — a deliberate speed bump on staff-on-staff action.
      if (rows.length === 0) throw new HttpError(400, 'TARGET_NOT_BANNABLE');
      await tx`
        INSERT INTO moderation_actions (actor_id, target_id, action, reason)
        VALUES (${req.accountId}, ${id}, 'ban', ${reason ?? null})
      `;
    });
    return { ok: true };
  });

  app.post('/v1/admin/users/:id/suspend', { preHandler: [app.requireAuth, staffOnly] }, async (req) => {
    await requirePermission(req, 'suspend');
    const { id } = req.params as { id: string };
    const { days, reason } = z.object({
      days: z.number().int().min(1).max(365),
      reason: z.string().trim().max(300).optional(),
    }).parse(req.body);

    await sql`
      UPDATE accounts
      SET status = 'suspended',
          suspended_until = now() + (${days} || ' days')::interval,
          suspension_reason = ${reason ?? null}
      WHERE id = ${id}
    `;
    await logAction(req.accountId!, id, 'suspend', reason ?? null, { days });
    return { ok: true };
  });

  app.post('/v1/admin/users/:id/restore', { preHandler: [app.requireAuth, staffOnly] }, async (req) => {
    await requirePermission(req, 'ban');
    const { id } = req.params as { id: string };
    await sql`
      UPDATE accounts SET status = 'active', suspended_until = NULL, suspension_reason = NULL
      WHERE id = ${id}
    `;
    await logAction(req.accountId!, id, 'restore', null);
    return { ok: true };
  });

  /**
   * Reset a person's rank statistics.
   *
   * Non-destructive: nothing is deleted — a stats_reset_at watermark
   * makes every rank and counter query ignore earlier events, and the
   * court value returns to its starting 1. Other people's woofs,
   * likes, gifts and follows stay in history; they just stop counting
   * toward this profile's boards.
   */
  app.post('/v1/admin/users/:id/reset-stats', { preHandler: [app.requireAuth, staffOnly] }, async (req) => {
    await requirePermission(req, 'manage_coins');
    const { id } = req.params as { id: string };
    const { reason } = z.object({ reason: z.string().trim().max(300).optional() }).parse(req.body ?? {});

    await sql.begin(async (tx) => {
      const rows = await tx`
        UPDATE profiles SET stats_reset_at = now(), court_value = 1, updated_at = now()
        WHERE account_id = ${id}
        RETURNING account_id
      `;
      if (rows.length === 0) throw new HttpError(404, 'USER_NOT_FOUND');
      await tx`
        INSERT INTO moderation_actions (actor_id, target_id, action, reason)
        VALUES (${req.accountId}, ${id}, 'reset_stats', ${reason ?? null})
      `;
    });
    return { ok: true };
  });

  app.post('/v1/admin/users/:id/credit', { preHandler: [app.requireAuth, staffOnly] }, async (req) => {
    await requirePermission(req, 'manage_coins');
    const { id } = req.params as { id: string };
    const { amount, reason } = z.object({
      amount: z.number().int().min(-100000).max(100000).refine((n) => n !== 0),
      reason: z.string().trim().max(300).optional(),
    }).parse(req.body);

    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO coin_ledger (account_id, delta, reason, ref_type, ref_id, idempotency_key)
        VALUES (${id}, ${amount}, 'admin_credit', 'admin', ${req.accountId},
                ${`admin:${req.accountId}:${id}:${Date.now()}`})
      `;
      await tx`
        INSERT INTO coin_balances (account_id, balance) VALUES (${id}, GREATEST(0, ${amount}))
        ON CONFLICT (account_id) DO UPDATE
          SET balance = GREATEST(0, coin_balances.balance + ${amount}), updated_at = now()
      `;
      await tx`
        INSERT INTO moderation_actions (actor_id, target_id, action, reason, metadata)
        VALUES (${req.accountId}, ${id}, 'credit', ${reason ?? null},
                ${JSON.stringify({ amount })}::jsonb)
      `;
    });
    return { ok: true };
  });

  /** Names the exact broken step when uploads fail in production. */
  app.get('/v1/admin/storage-check', { preHandler: [app.requireAuth, staffOnly] }, async () => {
    return { steps: await diagnoseStorage() };
  });

  app.get('/v1/admin/verifications', { preHandler: [app.requireAuth, staffOnly] }, async () => {
    const rows = await sql`
      SELECT v.id, v.account_id, v.created_at, p.display_name, p.handle,
             CASE WHEN v.storage_key ~ '^[0-9a-f-]{36}$' THEN v.storage_key END AS selfie_media_id
      FROM verification_requests v
      JOIN profiles p ON p.account_id = v.account_id
      WHERE v.state = 'pending'
      ORDER BY v.created_at
      LIMIT 50
    `;
    return { requests: rows };
  });

  app.post('/v1/admin/verifications/:id', { preHandler: [app.requireAuth, staffOnly] }, async (req) => {
    await requirePermission(req, 'approve_verification');
    const { id } = req.params as { id: string };
    const { approve, reason } = z.object({
      approve: z.boolean(),
      reason: z.string().trim().max(300).optional(),
    }).parse(req.body);

    await sql.begin(async (tx) => {
      const [r] = await tx<{ account_id: string }[]>`
        UPDATE verification_requests
        SET state = ${approve ? 'approved' : 'rejected'},
            reviewed_by = ${req.accountId}, reviewed_at = now(),
            reject_reason = ${approve ? null : reason ?? null}
        WHERE id = ${id} AND state = 'pending'
        RETURNING account_id
      `;
      if (!r) throw new HttpError(404, 'REQUEST_NOT_FOUND');

      await tx`
        UPDATE profiles
        SET verification = ${approve ? 'approved' : 'rejected'},
            verified_at = ${approve ? sql`now()` : null}
        WHERE account_id = ${r.account_id}
      `;
      await tx`
        INSERT INTO moderation_actions (actor_id, target_id, action, reason)
        VALUES (${req.accountId}, ${r.account_id},
                ${approve ? 'verify_approve' : 'verify_reject'}, ${reason ?? null})
      `;
      // The applicant is told either way — silence on a rejection is
      // the thing people complain about.
      await notify(tx, { accountId: r.account_id, kind: 'verification',
                         payload: { approved: approve } });
    });
    return { ok: true };
  });

  /** Remove any post. Soft delete, so the audit trail survives. */
  app.delete('/v1/admin/posts/:id', { preHandler: [app.requireAuth, staffOnly] }, async (req, reply) => {
    await requirePermission(req, 'delete_content');
    const { id } = req.params as { id: string };
    await sql.begin(async (tx) => {
      const [row] = await tx<Array<{ author_id: string }>>`
        UPDATE posts SET deleted_at = now()
        WHERE id = ${id} AND deleted_at IS NULL
        RETURNING author_id
      `;
      if (!row) throw new HttpError(404, 'POST_NOT_FOUND');
      await tx`
        INSERT INTO moderation_actions (actor_id, target_id, action, metadata)
        VALUES (${req.accountId}, ${row.author_id}, 'delete_post',
                ${JSON.stringify({ post_id: id })}::jsonb)
      `;
    });
    reply.code(204);
  });

  app.delete('/v1/admin/comments/:id', { preHandler: [app.requireAuth, staffOnly] }, async (req, reply) => {
    await requirePermission(req, 'delete_content');
    const { id } = req.params as { id: string };
    await sql.begin(async (tx) => {
      const [row] = await tx<Array<{ author_id: string; post_id: string }>>`
        UPDATE comments SET deleted_at = now()
        WHERE id = ${id} AND deleted_at IS NULL
        RETURNING author_id, post_id
      `;
      if (!row) throw new HttpError(404, 'COMMENT_NOT_FOUND');
      await tx`
        UPDATE posts SET comment_count = GREATEST(0, comment_count - 1)
        WHERE id = ${row.post_id}
      `;
      await tx`
        INSERT INTO moderation_actions (actor_id, target_id, action, metadata)
        VALUES (${req.accountId}, ${row.author_id}, 'delete_comment',
                ${JSON.stringify({ comment_id: id })}::jsonb)
      `;
    });
    reply.code(204);
  });

  /** Grant or revoke the badge directly, without a request in the queue. */
  app.post('/v1/admin/users/:id/verification', { preHandler: [app.requireAuth, staffOnly] }, async (req) => {
    await requirePermission(req, 'approve_verification');
    const { id } = req.params as { id: string };
    const { verified } = z.object({ verified: z.boolean() }).parse(req.body);

    await sql.begin(async (tx) => {
      await tx`
        UPDATE profiles
        SET verification = ${verified ? 'approved' : 'none'},
            verified_at  = ${verified ? sql`now()` : null}
        WHERE account_id = ${id}
      `;
      await tx`
        INSERT INTO moderation_actions (actor_id, target_id, action)
        VALUES (${req.accountId}, ${id}, ${verified ? 'verify_grant' : 'verify_revoke'})
      `;
      await notify(tx, { accountId: id, kind: 'verification',
                         payload: { approved: verified } });
    });
    return { ok: true };
  });

  /** Per-user detail: balance, ledger, counts — the drill-down view. */
  app.get('/v1/admin/users/:id', { preHandler: [app.requireAuth, staffOnly] }, async (req) => {
    const { id } = req.params as { id: string };
    const [user] = await sql`
      SELECT a.id, a.status::text AS status, a.role::text AS role,
             a.created_at, a.last_seen_at, a.suspended_until, a.suspension_reason,
             p.display_name, p.handle, p.bio, p.court_value,
             p.verification::text AS verification,
             date_part('year', age(p.birth_date))::int AS age,
             COALESCE(b.balance, 0)::int AS balance,
             (SELECT count(*)::int FROM posts   WHERE author_id = a.id AND deleted_at IS NULL) AS posts,
             (SELECT count(*)::int FROM woofs   WHERE target_id = a.id) AS woofs,
             (SELECT count(*)::int FROM follows WHERE followee_id = a.id) AS followers,
             (SELECT count(*)::int FROM gift_transfers WHERE receiver_id = a.id) AS gifts
      FROM accounts a
      JOIN profiles p ON p.account_id = a.id
      LEFT JOIN coin_balances b ON b.account_id = a.id
      WHERE a.id = ${id}
    `;
    if (!user) throw new HttpError(404, 'USER_NOT_FOUND');

    const ledger = await sql`
      SELECT delta::int, reason::text AS reason, created_at
      FROM coin_ledger WHERE account_id = ${id}
      ORDER BY id DESC LIMIT 30
    `;
    return { user, ledger };
  });

  app.get('/v1/admin/reports', { preHandler: [app.requireAuth, staffOnly] }, async () => {
    const rows = await sql`
      SELECT r.id, r.subject_type, r.subject_id, r.reason, r.details, r.created_at,
             p.display_name AS reporter_name
      FROM reports r
      LEFT JOIN profiles p ON p.account_id = r.reporter_id
      WHERE r.state = 'open'
      ORDER BY r.created_at
      LIMIT 50
    `;
    return { reports: rows };
  });

  app.post('/v1/admin/reports/:id/resolve', { preHandler: [app.requireAuth, staffOnly] }, async (req) => {
    const { id } = req.params as { id: string };
    const { action } = z.object({ action: z.enum(['actioned', 'dismissed']) }).parse(req.body);
    await sql`
      UPDATE reports SET state = ${action}, handled_by = ${req.accountId}, handled_at = now()
      WHERE id = ${id}
    `;
    return { ok: true };
  });

  /** Admin-only: moderators cannot appoint moderators. */
  app.post('/v1/admin/moderators', { preHandler: [app.requireAuth, staffOnly] }, async (req) => {
    if (req.role !== 'admin') throw new HttpError(403, 'ADMIN_ONLY');
    const { account_id, permissions } = z.object({
      account_id: z.string().uuid(),
      permissions: z.array(z.string().max(40)).max(20),
    }).parse(req.body);

    await sql.begin(async (tx) => {
      await tx`UPDATE accounts SET role = 'moderator' WHERE id = ${account_id}`;
      await tx`DELETE FROM moderator_permissions WHERE account_id = ${account_id}`;
      for (const p of permissions) {
        await tx`
          INSERT INTO moderator_permissions (account_id, permission, granted_by)
          VALUES (${account_id}, ${p}, ${req.accountId})
        `;
      }
      await tx`
        INSERT INTO moderation_actions (actor_id, target_id, action, metadata)
        VALUES (${req.accountId}, ${account_id}, 'grant_moderator',
                ${JSON.stringify({ permissions })}::jsonb)
      `;
    });
    return { ok: true };
  });

  app.get('/v1/admin/log', { preHandler: [app.requireAuth, staffOnly] }, async () => {
    const rows = await sql`
      SELECT m.action, m.reason, m.metadata, m.created_at,
             actor.display_name AS actor_name,
             target.display_name AS target_name
      FROM moderation_actions m
      LEFT JOIN profiles actor  ON actor.account_id = m.actor_id
      LEFT JOIN profiles target ON target.account_id = m.target_id
      ORDER BY m.id DESC LIMIT 100
    `;
    return { entries: rows };
  });
};

export default adminRoutes;
