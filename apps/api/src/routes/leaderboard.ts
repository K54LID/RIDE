import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { sql } from '../lib/db.js';
import { HttpError } from '../lib/errors.js';

/**
 * Leaderboards computed live from source tables.
 *
 * At this scale a live aggregate is correct and simple. The Redis ZSET
 * design in the original plan only pays for itself past roughly ten
 * thousand active users; adding it now would be infrastructure with no
 * users behind it. The response shape won't change when it does.
 */

const QuerySchema = z.object({
  board: z.enum(['court', 'woofs', 'gifts', 'followers', 'likes']).default('court'),
  period: z.enum(['day', 'week', 'month', 'all']).default('all'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/**
 * Period windows are calendar buckets in UTC, not rolling intervals.
 *
 * They used to be `now() - 7 days`, which is a window that slides: a
 * woof from last Tuesday quietly stopped counting this Tuesday, nothing
 * ever hit zero, and there was no moment anyone could point at and call
 * a reset. Ranks now works the way a leaderboard is expected to —
 * today's board starts at midnight UTC and everyone begins the day on
 * nothing — which is also what makes a countdown to the reset possible
 * rather than a lie.
 *
 * All-time is unbounded and is never reset by the clock; only an admin
 * stats reset moves that line.
 */
function windowFor(period: string): { since: Date | null; resetsAt: Date | null } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();

  if (period === 'day') {
    return {
      since: new Date(Date.UTC(y, m, d)),
      resetsAt: new Date(Date.UTC(y, m, d + 1)),
    };
  }
  if (period === 'week') {
    // Weeks start Monday, matching Postgres date_trunc('week') and most
    // of the world outside the US.
    const dow = (now.getUTCDay() + 6) % 7;      // Mon = 0
    return {
      since: new Date(Date.UTC(y, m, d - dow)),
      resetsAt: new Date(Date.UTC(y, m, d - dow + 7)),
    };
  }
  if (period === 'month') {
    return {
      since: new Date(Date.UTC(y, m, 1)),
      resetsAt: new Date(Date.UTC(y, m + 1, 1)),
    };
  }
  return { since: null, resetsAt: null };
}

const leaderboardRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/leaderboard', { preHandler: [app.requireAuth] }, async (req) => {
    const { board, period, limit } = QuerySchema.parse(req.query);
    const { since, resetsAt } = windowFor(period);

    let rows;

    // Reused in every board query below: each person's own public
    // primary photo, or null to fall back to the initial-letter avatar.
    const avatarSelect = sql`
      (SELECT ph.media_id FROM profile_photos ph
       WHERE ph.account_id = p.account_id 
         AND NOT ph.is_private AND ph.media_id IS NOT NULL
       ORDER BY ph.position LIMIT 1) AS avatar_media_id
    `;

    if (board === 'woofs') {
      rows = await sql`
        SELECT p.account_id, p.display_name, p.handle, p.court_value,
               (p.verification = 'approved') AS verified, ${avatarSelect},
               count(w.id)::int AS score
        FROM profiles p
        JOIN accounts a ON a.id = p.account_id AND a.status = 'active'
        LEFT JOIN woofs w ON w.target_id = p.account_id
          AND w.created_at > COALESCE(p.stats_reset_at, 'epoch')
          ${since ? sql`AND w.created_at > ${since}` : sql``}
        WHERE true
        GROUP BY p.account_id, p.display_name, p.handle, p.court_value, p.verification
        HAVING count(w.id) > 0
        ORDER BY score DESC, p.court_value DESC
        LIMIT ${limit}
      `;
    } else if (board === 'gifts') {
      rows = await sql`
        SELECT p.account_id, p.display_name, p.handle, p.court_value,
               (p.verification = 'approved') AS verified, ${avatarSelect},
               count(g.id)::int AS score
        FROM profiles p
        JOIN accounts a ON a.id = p.account_id AND a.status = 'active'
        LEFT JOIN gift_transfers g ON g.receiver_id = p.account_id
          AND g.created_at > COALESCE(p.stats_reset_at, 'epoch')
          ${since ? sql`AND g.created_at > ${since}` : sql``}
        WHERE true
        GROUP BY p.account_id, p.display_name, p.handle, p.court_value, p.verification
        HAVING count(g.id) > 0
        ORDER BY score DESC
        LIMIT ${limit}
      `;
    } else if (board === 'likes') {
      // Total likes received across every post the person has written.
      // Counting post_likes rows rather than summing posts.like_count
      // keeps the period filter meaningful — like_count has no date.
      rows = await sql`
        SELECT p.account_id, p.display_name, p.handle, p.court_value,
               (p.verification = 'approved') AS verified, ${avatarSelect},
               count(pl.post_id)::int AS score
        FROM profiles p
        JOIN accounts a ON a.id = p.account_id AND a.status = 'active'
        JOIN posts po   ON po.author_id = p.account_id AND po.deleted_at IS NULL
        JOIN post_likes pl ON pl.post_id = po.id
          AND pl.created_at > COALESCE(p.stats_reset_at, 'epoch')
          ${since ? sql`AND pl.created_at > ${since}` : sql``}
        WHERE true
        GROUP BY p.account_id, p.display_name, p.handle, p.court_value, p.verification
        HAVING count(pl.post_id) > 0
        ORDER BY score DESC
        LIMIT ${limit}
      `;
    } else if (board === 'followers') {
      rows = await sql`
        SELECT p.account_id, p.display_name, p.handle, p.court_value,
               (p.verification = 'approved') AS verified, ${avatarSelect},
               count(f.follower_id)::int AS score
        FROM profiles p
        JOIN accounts a ON a.id = p.account_id AND a.status = 'active'
        LEFT JOIN follows f ON f.followee_id = p.account_id
          AND f.created_at > COALESCE(p.stats_reset_at, 'epoch')
          ${since ? sql`AND f.created_at > ${since}` : sql``}
        WHERE true
        GROUP BY p.account_id, p.display_name, p.handle, p.court_value, p.verification
        HAVING count(f.follower_id) > 0
        ORDER BY score DESC
        LIMIT ${limit}
      `;
    } else {
      // Court value is cumulative, so "period" means courts gained
      // within the window rather than total standing.
      rows = since
        ? await sql`
            SELECT p.account_id, p.display_name, p.handle, p.court_value,
                   (p.verification = 'approved') AS verified, ${avatarSelect},
                   COALESCE(sum(c.value_after - c.value_before), 0)::int AS score
            FROM profiles p
            JOIN accounts a ON a.id = p.account_id AND a.status = 'active'
            JOIN court_events c ON c.target_id = p.account_id
              AND c.created_at > COALESCE(p.stats_reset_at, 'epoch')
              AND c.created_at > ${since}
            WHERE true
            GROUP BY p.account_id, p.display_name, p.handle, p.court_value, p.verification
            ORDER BY score DESC
            LIMIT ${limit}
          `
        : await sql`
            SELECT p.account_id, p.display_name, p.handle, p.court_value,
                   (p.verification = 'approved') AS verified, ${avatarSelect},
                   p.court_value::int AS score
            FROM profiles p
            JOIN accounts a ON a.id = p.account_id AND a.status = 'active'
            -- Membership is holding a live courtship, not clearing a
            -- value threshold. A first court takes someone from 1 to 2
            -- and a lapsed value also lands on 2, so no number can tell
            -- those apart — filtering by value hid everyone who had been
            -- courted exactly once. The courtship row is the fact that
            -- matters, and it disappears when it expires.
            JOIN courtships c ON c.target_id = p.account_id AND c.expires_at > now()
            ORDER BY score DESC, c.created_at DESC
            LIMIT ${limit}
          `;
    }

    return {
      board,
      period,
      /**
       * When this board next empties. Null for all-time, which never
       * does. The client renders a countdown from it rather than
       * computing bucket boundaries of its own — two implementations of
       * "when is midnight" would eventually disagree.
       */
      resets_at: resetsAt ? resetsAt.toISOString() : null,
      entries: rows.map((r, i) => ({ rank: i + 1, ...r })),
    };
  });

  /**
   * One person's position on every board, all-time.
   *
   * rank = 1 + count of people with a strictly better score. Ties share
   * a rank, which is what a profile badge should say anyway. Boards
   * where the score is zero are omitted — "#4192 in gifts" with zero
   * gifts is noise, not a stat.
   */
  app.get('/v1/users/:id/ranks', { preHandler: [app.requireAuth] }, async (req) => {
    const raw = (req.params as { id: string }).id;
    const id = raw === 'me'
      ? req.accountId!
      : z.object({ id: z.string().uuid() }).parse(req.params).id;

    const [row] = await sql<Array<{
      court_score: number; court_rank: number;
      woofs_score: number; woofs_rank: number;
      likes_score: number; likes_rank: number;
      gifts_score: number; gifts_rank: number;
      followers_score: number; followers_rank: number;
    }>>`
      WITH target AS (
        SELECT p.account_id, p.court_value,
               COALESCE(p.stats_reset_at, 'epoch') AS reset_at
        FROM profiles p
        JOIN accounts a ON a.id = p.account_id AND a.status = 'active'
        WHERE p.account_id = ${id}
      ),
      scores AS (
        SELECT
          t.court_value::int AS court_score,
          (SELECT count(*)::int FROM woofs w
           WHERE w.target_id = t.account_id AND w.created_at > t.reset_at) AS woofs_score,
          (SELECT count(*)::int FROM post_likes pl
           JOIN posts po ON po.id = pl.post_id AND po.deleted_at IS NULL
           WHERE po.author_id = t.account_id AND pl.created_at > t.reset_at) AS likes_score,
          (SELECT count(*)::int FROM gift_transfers g
           WHERE g.receiver_id = t.account_id AND g.created_at > t.reset_at) AS gifts_score,
          (SELECT count(*)::int FROM follows f
           WHERE f.followee_id = t.account_id AND f.created_at > t.reset_at) AS followers_score
        FROM target t
      )
      SELECT s.court_score, s.woofs_score, s.likes_score, s.gifts_score, s.followers_score,
        -- Same membership rule as the board itself: counted against
        -- people who hold a live courtship, not everyone with a number.
        (SELECT 1 + count(*)::int FROM profiles p2
         JOIN accounts a2 ON a2.id = p2.account_id AND a2.status = 'active'
         JOIN courtships c2 ON c2.target_id = p2.account_id AND c2.expires_at > now()
         WHERE p2.court_value > s.court_score) AS court_rank,
        (SELECT 1 + count(*)::int FROM (
           SELECT w.target_id FROM woofs w
           JOIN profiles p2 ON p2.account_id = w.target_id
           WHERE w.created_at > COALESCE(p2.stats_reset_at, 'epoch')
           GROUP BY w.target_id
           HAVING count(*) > s.woofs_score
         ) x) AS woofs_rank,
        (SELECT 1 + count(*)::int FROM (
           SELECT po.author_id FROM post_likes pl
           JOIN posts po ON po.id = pl.post_id AND po.deleted_at IS NULL
           JOIN profiles p2 ON p2.account_id = po.author_id
           WHERE pl.created_at > COALESCE(p2.stats_reset_at, 'epoch')
           GROUP BY po.author_id
           HAVING count(*) > s.likes_score
         ) x) AS likes_rank,
        (SELECT 1 + count(*)::int FROM (
           SELECT g.receiver_id FROM gift_transfers g
           JOIN profiles p2 ON p2.account_id = g.receiver_id
           WHERE g.created_at > COALESCE(p2.stats_reset_at, 'epoch')
           GROUP BY g.receiver_id
           HAVING count(*) > s.gifts_score
         ) x) AS gifts_rank,
        (SELECT 1 + count(*)::int FROM (
           SELECT f.followee_id FROM follows f
           JOIN profiles p2 ON p2.account_id = f.followee_id
           WHERE f.created_at > COALESCE(p2.stats_reset_at, 'epoch')
           GROUP BY f.followee_id
           HAVING count(*) > s.followers_score
         ) x) AS followers_rank
      FROM scores s
    `;
    if (!row) throw new HttpError(404, 'USER_NOT_FOUND');

    const boards = [
      { board: 'court', rank: row.court_rank, score: row.court_score, nonzero: row.court_score > 1 },
      { board: 'woofs', rank: row.woofs_rank, score: row.woofs_score, nonzero: row.woofs_score > 0 },
      { board: 'likes', rank: row.likes_rank, score: row.likes_score, nonzero: row.likes_score > 0 },
      { board: 'gifts', rank: row.gifts_rank, score: row.gifts_score, nonzero: row.gifts_score > 0 },
      { board: 'followers', rank: row.followers_rank, score: row.followers_score, nonzero: row.followers_score > 0 },
    ];
    return {
      // RankChips (the profile badges) still only wants boards worth
      // bragging about, so it filters this itself. The profile's
      // written "your standing" list wants every board spelled out,
      // nonzero or not, so nothing is filtered out here anymore.
      ranks: boards.map(({ board, rank, score }) => ({ board, rank, score })),
    };
  });
};

export default leaderboardRoutes;
