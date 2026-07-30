import type { TransactionSql } from 'postgres';
import { HttpError } from './errors.js';

/**
 * Coin movements. Always inside a caller's transaction, never standalone
 * — a coin spend is only ever meaningful alongside the thing it bought.
 *
 * The ledger is the source of truth; coin_balances is a cache kept in
 * step here. Debits use a conditional UPDATE so two concurrent spends
 * cannot both pass a balance check and overdraw: whichever loses the
 * race matches zero rows and throws.
 */

export type SpendReason =
  | 'gift_sent' | 'court_spend' | 'featured_slot' | 'profile_boost' | 'vip_purchase';

export type EarnReason =
  | 'daily_login' | 'referral_bonus' | 'achievement' | 'leaderboard_reward'
  | 'gift_received' | 'admin_credit' | 'refund';

export async function debit(
  tx: TransactionSql,
  accountId: string,
  amount: number,
  reason: SpendReason,
  ref: { type: string; id: string },
): Promise<void> {
  if (amount <= 0) throw new HttpError(400, 'INVALID_AMOUNT');

  const updated = await tx`
    UPDATE coin_balances
    SET balance = balance - ${amount}, updated_at = now()
    WHERE account_id = ${accountId} AND balance >= ${amount}
    RETURNING balance
  `;
  if (updated.length === 0) throw new HttpError(402, 'INSUFFICIENT_COINS');

  await tx`
    INSERT INTO coin_ledger (account_id, delta, reason, ref_type, ref_id)
    VALUES (${accountId}, ${-amount}, ${reason}, ${ref.type}, ${ref.id})
  `;
}

export async function credit(
  tx: TransactionSql,
  accountId: string,
  amount: number,
  reason: EarnReason,
  ref: { type: string; id: string },
  idempotencyKey?: string,
): Promise<void> {
  if (amount <= 0) return;

  const inserted = await tx`
    INSERT INTO coin_ledger (account_id, delta, reason, ref_type, ref_id, idempotency_key)
    VALUES (${accountId}, ${amount}, ${reason}, ${ref.type}, ${ref.id}, ${idempotencyKey ?? null})
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id
  `;
  // A conflict means this credit already happened; don't double the cache.
  if (idempotencyKey && inserted.length === 0) return;

  await tx`
    INSERT INTO coin_balances (account_id, balance) VALUES (${accountId}, ${amount})
    ON CONFLICT (account_id) DO UPDATE
      SET balance = coin_balances.balance + ${amount}, updated_at = now()
  `;
}
