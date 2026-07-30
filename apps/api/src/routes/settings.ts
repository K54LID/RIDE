import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { sql } from '../lib/db.js';
import { HttpError } from '../lib/errors.js';
import { notify } from '../lib/notify.js';

const Visibility = z.enum(['everyone', 'members', 'friends', 'nobody']);

const PatchSchema = z.object({
  locale: z.string().max(8).optional(),
  profile_visibility: Visibility.optional(),
  story_visibility: Visibility.optional(),
  show_online: z.boolean().optional(),
  show_last_seen: z.boolean().optional(),
  ghost_mode: z.boolean().optional(),
  notifications: z.object({
    all: z.boolean().optional(),
    chats: z.boolean().optional(),
    stories: z.boolean().optional(),
    woofs: z.boolean().optional(),
    comments: z.boolean().optional(),
    gifts: z.boolean().optional(),
  }).optional(),
});

const settingsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/settings', { preHandler: [app.requireAuth] }, async (req) => {
    // Row is created lazily so onboarding doesn't need to know about it.
    const [s] = await sql`
      INSERT INTO user_settings (account_id) VALUES (${req.accountId})
      ON CONFLICT (account_id) DO UPDATE SET account_id = EXCLUDED.account_id
      RETURNING locale, profile_visibility::text AS profile_visibility,
                story_visibility::text AS story_visibility,
                show_online, show_last_seen, notifications
    `;
    const [p] = await sql`
      SELECT ghost_mode, verification::text AS verification FROM profiles
      WHERE account_id = ${req.accountId}
    `;
    const blocked = await sql`
      SELECT b.blocked_id, pr.display_name, pr.handle
      FROM blocks b JOIN profiles pr ON pr.account_id = b.blocked_id
      WHERE b.blocker_id = ${req.accountId}
      ORDER BY b.created_at DESC
    `;
    return { ...s, ...p, blocked, role: req.role };
  });

  app.patch('/v1/settings', { preHandler: [app.requireAuth] }, async (req) => {
    const parsed = PatchSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'INVALID_BODY', parsed.error.issues[0]?.message);
    }
    const b = parsed.data;

    if (b.ghost_mode !== undefined) {
      await sql`
        UPDATE profiles SET ghost_mode = ${b.ghost_mode}, updated_at = now()
        WHERE account_id = ${req.accountId}
      `;
    }

    await sql`
      INSERT INTO user_settings (account_id) VALUES (${req.accountId})
      ON CONFLICT (account_id) DO NOTHING
    `;

    await sql`
      UPDATE user_settings SET
        locale             = COALESCE(${b.locale ?? null}, locale),
        profile_visibility = COALESCE(${b.profile_visibility ?? null}::visibility_level, profile_visibility),
        story_visibility   = COALESCE(${b.story_visibility ?? null}::visibility_level, story_visibility),
        show_online        = COALESCE(${b.show_online ?? null}, show_online),
        show_last_seen     = COALESCE(${b.show_last_seen ?? null}, show_last_seen),
        -- Merge rather than replace, so a partial toggle set doesn't
        -- silently reset the others.
        notifications      = notifications || ${JSON.stringify(b.notifications ?? {})}::jsonb,
        updated_at         = now()
      WHERE account_id = ${req.accountId}
    `;

    return { ok: true };
  });

  /**
   * Verification is a queue, not an instant grant. Selfie upload comes
   * with the media slice; for now the request itself is what an admin
   * reviews, and re-requesting while one is open is a no-op.
   */
  app.post('/v1/verification', { preHandler: [app.requireAuth] }, async (req) => {
    const open = await sql`
      SELECT 1 FROM verification_requests
      WHERE account_id = ${req.accountId} AND state = 'pending'
    `;
    if (open.length > 0) return { ok: true, already_pending: true };

    const { media_id } = z.object({ media_id: z.string().uuid().optional() })
      .parse(req.body ?? {});

    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO verification_requests (account_id, storage_key)
        VALUES (${req.accountId}, ${media_id ?? 'pending-upload'})
      `;
      await tx`
        UPDATE profiles SET verification = 'pending' WHERE account_id = ${req.accountId}
      `;

      // Every reviewer hears about it, so a request can't sit unseen
      // because one admin wasn't looking.
      const staff = await tx<Array<{ id: string }>>`
        SELECT id FROM accounts
        WHERE role IN ('admin', 'moderator') AND status = 'active'
      `;
      for (const s of staff) {
        await notify(tx, { accountId: s.id, actorId: req.accountId!,
                           kind: 'verification_request' });
      }
    });
    return { ok: true };
  });

  app.post('/v1/settings/unblock', { preHandler: [app.requireAuth] }, async (req) => {
    const { account_id } = z.object({ account_id: z.string().uuid() }).parse(req.body);
    await sql`
      DELETE FROM blocks WHERE blocker_id = ${req.accountId} AND blocked_id = ${account_id}
    `;
    return { ok: true };
  });

  /** Irreversible. Soft-delete keeps referential integrity for other
      people's conversations while removing the person from the app. */
  app.post('/v1/settings/delete-account', { preHandler: [app.requireAuth] }, async (req) => {
    await sql.begin(async (tx) => {
      await tx`UPDATE accounts SET status = 'deleted', deleted_at = now() WHERE id = ${req.accountId}`;
      await tx`UPDATE profiles SET display_name = 'Deleted account', bio = NULL, handle = NULL
               WHERE account_id = ${req.accountId}`;
      await tx`DELETE FROM telegram_identities WHERE account_id = ${req.accountId}`;
      await tx`DELETE FROM user_locations WHERE account_id = ${req.accountId}`;
    });
    return { ok: true };
  });
};

export default settingsRoutes;
