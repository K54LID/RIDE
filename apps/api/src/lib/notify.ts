import type { TransactionSql } from 'postgres';

export type NotificationKind =
  | 'woof' | 'gift' | 'court' | 'follow' | 'friend_request' | 'friend_accepted'
  | 'comment' | 'post_like' | 'achievement' | 'referral' | 'featured';

/**
 * Writes a notification inside the caller's transaction, so a
 * notification can never exist for an action that rolled back.
 *
 * Self-notifications are dropped here rather than at each call site —
 * it's the kind of check that gets forgotten exactly once.
 */
export async function notify(
  tx: TransactionSql,
  params: {
    accountId: string;
    actorId?: string | null;
    kind: NotificationKind;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  if (params.actorId && params.actorId === params.accountId) return;

  await tx`
    INSERT INTO notifications (account_id, actor_id, kind, payload)
    VALUES (${params.accountId}, ${params.actorId ?? null}, ${params.kind},
            ${JSON.stringify(params.payload ?? {})}::jsonb)
  `;
}
