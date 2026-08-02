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
      SELECT b.blocked_id, pr.display_name, pr.handle,
             (SELECT ph.media_id FROM profile_photos ph
              WHERE ph.account_id = b.blocked_id 
                AND NOT ph.is_private AND ph.media_id IS NOT NULL
              ORDER BY ph.position LIMIT 1) AS avatar_media_id
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
  /**
   * Delete the account and everything belonging to it.
   *
   * This used to be a soft delete: status flipped to 'deleted', the
   * display name was overwritten and the handle released, but the
   * profile row, photos, posts, comments, messages and media all
   * stayed. That is not deletion, it is hiding, and it is not what
   * someone pressing "Delete account" is asking for.
   *
   * Almost every table referencing accounts is ON DELETE CASCADE, so
   * removing the account row removes the rest. Four are not:
   * verification_requests, reports, moderation_actions and
   * moderator_permissions are NO ACTION, because moderation history is
   * deliberately hard to erase by accident. They have to go first or
   * the delete fails outright — a foreign key violation would leave the
   * person still fully present with an error on screen.
   *
   * Telegram identity goes first and separately: if anything later
   * throws, the transaction rolls back and the person is intact, which
   * is the safer failure. Nothing here is recoverable afterwards.
   */
  app.post('/v1/settings/delete-account', { preHandler: [app.requireAuth] }, async (req) => {
    const me = req.accountId!;

    await sql.begin(async (tx) => {
      // Moderation rows: NO ACTION, so they block the cascade.
      await tx`DELETE FROM moderation_actions WHERE actor_id = ${me} OR target_id = ${me}`;
      await tx`DELETE FROM moderator_permissions WHERE account_id = ${me} OR granted_by = ${me}`;
      await tx`DELETE FROM verification_requests WHERE account_id = ${me} OR reviewed_by = ${me}`;
      await tx`DELETE FROM reports WHERE reporter_id = ${me} OR handled_by = ${me}`;

      // Reports *about* this person, whatever the subject type. Their
      // subject_id is text, not a foreign key, so nothing cascades it.
      await tx`DELETE FROM reports WHERE subject_type = 'account' AND subject_id = ${me}`;

      // Everything else — profile, photos, posts, comments, likes,
      // messages, media, coins, gifts, stories, follows, blocks,
      // notifications, support messages — is CASCADE from here.
      await tx`DELETE FROM accounts WHERE id = ${me}`;
    });

    return { ok: true, deleted: true };
  });
};

export default settingsRoutes;
