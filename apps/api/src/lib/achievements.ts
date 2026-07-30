import { sql } from '../lib/db.js';

/**
 * Achievement engine.
 *
 * Progress is derived from source tables rather than kept in counters,
 * so it can never drift out of sync with reality. Awards are recorded
 * once, with the coin reward paid through the ledger in the same
 * transaction as the unlock — so a crash mid-award cannot mint coins
 * without the badge or vice versa.
 */

/** One query per family, all counted for a single account. */
async function progressFor(accountId: string): Promise<Record<string, number>> {
  const [row] = await sql<Array<Record<string, number>>>`
    SELECT
      (SELECT count(*)::int FROM posts   WHERE author_id = ${accountId} AND deleted_at IS NULL) AS posts_created,
      (SELECT count(*)::int FROM stories WHERE author_id = ${accountId})                        AS stories_created,
      (SELECT count(*)::int FROM woofs   WHERE target_id = ${accountId})                        AS woofs_received,
      (SELECT count(*)::int FROM gift_transfers WHERE receiver_id = ${accountId})               AS gifts_received,
      (SELECT count(*)::int FROM follows WHERE followee_id = ${accountId})                      AS followers,
      (SELECT count(*)::int FROM friendships
         WHERE (requester_id = ${accountId} OR addressee_id = ${accountId})
           AND accepted_at IS NOT NULL)                                                          AS friends,
      (SELECT count(*)::int FROM referrals WHERE inviter_id = ${accountId} AND rewarded_at IS NOT NULL) AS referrals,
      (SELECT COALESCE(court_value, 1)::int FROM profiles WHERE account_id = ${accountId})      AS court_value,
      (SELECT CASE WHEN verification = 'approved' THEN 1 ELSE 0 END
         FROM profiles WHERE account_id = ${accountId})                                          AS verified,
      (SELECT COALESCE(current_streak, 0)::int FROM login_streaks WHERE account_id = ${accountId}) AS login_days,
      0 AS discover_views,
      0 AS countries_seen
  `;
  return row ?? {};
}

export interface AchievementView {
  slug: string;
  family: string;
  tier: number;
  name: string;
  description: string | null;
  threshold: number;
  coin_reward: number;
  progress: number;
  unlocked: boolean;
  unlocked_at: string | null;
}

export async function listAchievements(accountId: string): Promise<AchievementView[]> {
  const progress = await progressFor(accountId);

  const rows = await sql<Array<{
    slug: string; family: string; tier: number; name: string;
    description: string | null; threshold: number; coin_reward: number;
    unlocked_at: string | null;
  }>>`
    SELECT a.slug, a.family, a.tier, a.name, a.description,
           a.threshold::int, a.coin_reward::int, ua.unlocked_at
    FROM achievements a
    LEFT JOIN user_achievements ua
      ON ua.achievement_id = a.id AND ua.account_id = ${accountId}
    ORDER BY a.family, a.tier
  `;

  return rows.map((r) => ({
    slug: r.slug,
    family: r.family,
    tier: r.tier,
    name: r.name,
    description: r.description,
    threshold: r.threshold,
    coin_reward: r.coin_reward,
    progress: Math.min(progress[r.family] ?? 0, r.threshold),
    unlocked: r.unlocked_at !== null,
    unlocked_at: r.unlocked_at,
  }));
}

/**
 * Awards anything newly earned. Safe to call often — the unique key on
 * user_achievements makes a repeat award a no-op.
 *
 * Returns what was newly unlocked so the client can celebrate it.
 */
export async function evaluateAchievements(accountId: string): Promise<AchievementView[]> {
  const all = await listAchievements(accountId);
  const earned = all.filter((a) => !a.unlocked && a.progress >= a.threshold);
  if (earned.length === 0) return [];

  const awarded: AchievementView[] = [];

  for (const a of earned) {
    const done = await sql.begin(async (tx) => {
      const inserted = await tx`
        INSERT INTO user_achievements (account_id, achievement_id)
        SELECT ${accountId}, id FROM achievements WHERE slug = ${a.slug}
        ON CONFLICT DO NOTHING
        RETURNING achievement_id
      `;
      if (inserted.length === 0) return false;  // raced; someone else awarded it

      if (a.coin_reward > 0) {
        await tx`
          INSERT INTO coin_ledger (account_id, delta, reason, ref_type, ref_id, idempotency_key)
          VALUES (${accountId}, ${a.coin_reward}, 'achievement', 'achievement', ${a.slug},
                  ${`ach:${accountId}:${a.slug}`})
          ON CONFLICT (idempotency_key) DO NOTHING
        `;
        await tx`
          INSERT INTO coin_balances (account_id, balance)
          VALUES (${accountId}, ${a.coin_reward})
          ON CONFLICT (account_id) DO UPDATE
            SET balance = coin_balances.balance + ${a.coin_reward}, updated_at = now()
        `;
      }
      return true;
    });

    if (done) awarded.push({ ...a, unlocked: true });
  }

  return awarded;
}
