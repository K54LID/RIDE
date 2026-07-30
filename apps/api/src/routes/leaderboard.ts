import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { sql } from '../lib/db.js';

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

const INTERVAL: Record<string, string> = {
  day: '1 day',
  week: '7 days',
  month: '30 days',
};

const leaderboardRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/leaderboard', { preHandler: [app.requireAuth] }, async (req) => {
    const { board, period, limit } = QuerySchema.parse(req.query);
    const since = period === 'all' ? null : INTERVAL[period]!;

    let rows;

    if (board === 'woofs') {
      rows = await sql`
        SELECT p.account_id, p.display_name, p.handle, p.court_value,
               (p.verification = 'approved') AS verified,
               count(w.id)::int AS score
        FROM profiles p
        JOIN accounts a ON a.id = p.account_id AND a.status = 'active'
        LEFT JOIN woofs w ON w.target_id = p.account_id
          ${since ? sql`AND w.created_at > now() - ${since}::interval` : sql``}
        WHERE NOT p.ghost_mode
        GROUP BY p.account_id, p.display_name, p.handle, p.court_value, p.verification
        HAVING count(w.id) > 0
        ORDER BY score DESC, p.court_value DESC
        LIMIT ${limit}
      `;
    } else if (board === 'gifts') {
      rows = await sql`
        SELECT p.account_id, p.display_name, p.handle, p.court_value,
               (p.verification = 'approved') AS verified,
               count(g.id)::int AS score
        FROM profiles p
        JOIN accounts a ON a.id = p.account_id AND a.status = 'active'
        LEFT JOIN gift_transfers g ON g.receiver_id = p.account_id
          ${since ? sql`AND g.created_at > now() - ${since}::interval` : sql``}
        WHERE NOT p.ghost_mode
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
               (p.verification = 'approved') AS verified,
               count(pl.post_id)::int AS score
        FROM profiles p
        JOIN accounts a ON a.id = p.account_id AND a.status = 'active'
        JOIN posts po   ON po.author_id = p.account_id AND po.deleted_at IS NULL
        JOIN post_likes pl ON pl.post_id = po.id
          ${since ? sql`AND pl.created_at > now() - ${since}::interval` : sql``}
        WHERE NOT p.ghost_mode
        GROUP BY p.account_id, p.display_name, p.handle, p.court_value, p.verification
        HAVING count(pl.post_id) > 0
        ORDER BY score DESC
        LIMIT ${limit}
      `;
    } else if (board === 'followers') {
      rows = await sql`
        SELECT p.account_id, p.display_name, p.handle, p.court_value,
               (p.verification = 'approved') AS verified,
               count(f.follower_id)::int AS score
        FROM profiles p
        JOIN accounts a ON a.id = p.account_id AND a.status = 'active'
        LEFT JOIN follows f ON f.followee_id = p.account_id
          ${since ? sql`AND f.created_at > now() - ${since}::interval` : sql``}
        WHERE NOT p.ghost_mode
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
                   (p.verification = 'approved') AS verified,
                   COALESCE(sum(c.value_after - c.value_before), 0)::int AS score
            FROM profiles p
            JOIN accounts a ON a.id = p.account_id AND a.status = 'active'
            JOIN court_events c ON c.target_id = p.account_id
              AND c.created_at > now() - ${since}::interval
            WHERE NOT p.ghost_mode
            GROUP BY p.account_id, p.display_name, p.handle, p.court_value, p.verification
            ORDER BY score DESC
            LIMIT ${limit}
          `
        : await sql`
            SELECT p.account_id, p.display_name, p.handle, p.court_value,
                   (p.verification = 'approved') AS verified,
                   p.court_value::int AS score
            FROM profiles p
            JOIN accounts a ON a.id = p.account_id AND a.status = 'active'
            WHERE NOT p.ghost_mode AND p.court_value > 1
            ORDER BY score DESC
            LIMIT ${limit}
          `;
    }

    return {
      board,
      period,
      entries: rows.map((r, i) => ({ rank: i + 1, ...r })),
    };
  });
};

export default leaderboardRoutes;

/**
 * A single person's standing across every board, plus the name of the
 * tier their court value falls in. The profile shows "Baron · #14"
 * rather than a bare number, which means nothing on its own.
 */
export const TIERS: Array<{ min: number; name: string }> = [
  { min: 0, name: 'Newcomer' },
  { min: 2, name: 'Noticed' },
  { min: 4, name: 'Admired' },
  { min: 8, name: 'Courted' },
  { min: 16, name: 'Baron' },
  { min: 64, name: 'Viscount' },
  { min: 256, name: 'Earl' },
  { min: 1024, name: 'Marquess' },
  { min: 4096, name: 'Duke' },
  { min: 16384, name: 'Sovereign' },
];

export function tierName(courtValue: number): string {
  let name = TIERS[0]!.name;
  for (const t of TIERS) if (courtValue >= t.min) name = t.name;
  return name;
}

export const standingRoutes = async (app: import('fastify').FastifyInstance) => {
  app.get('/v1/standing', { preHandler: [app.requireAuth] }, async (req) => {
    const me = req.accountId!;

    // One pass per board. Each is a rank over an aggregate, filtered to
    // this account — cheap at current scale and always consistent with
    // what the leaderboard screen shows.
    const [row] = await sql<Array<{
      court_value: number; court_rank: number | null; woof_rank: number | null;
      like_rank: number | null; gift_rank: number | null; follower_rank: number | null;
      woofs: number; likes: number; gifts: number; followers: number; total_players: number;
    }>>`
      WITH base AS (
        SELECT p.account_id, p.court_value::int AS court_value,
               (SELECT count(*) FROM woofs w WHERE w.target_id = p.account_id)::int AS woofs,
               (SELECT count(*) FROM post_likes pl
                  JOIN posts po ON po.id = pl.post_id
                 WHERE po.author_id = p.account_id AND po.deleted_at IS NULL)::int AS likes,
               (SELECT count(*) FROM gift_transfers g WHERE g.receiver_id = p.account_id)::int AS gifts,
               (SELECT count(*) FROM follows f WHERE f.followee_id = p.account_id)::int AS followers
        FROM profiles p
        JOIN accounts a ON a.id = p.account_id AND a.status = 'active'
        WHERE NOT p.ghost_mode
      ), ranked AS (
        SELECT account_id, court_value, woofs, likes, gifts, followers,
               rank() OVER (ORDER BY court_value DESC) AS court_rank,
               rank() OVER (ORDER BY woofs DESC)       AS woof_rank,
               rank() OVER (ORDER BY likes DESC)       AS like_rank,
               rank() OVER (ORDER BY gifts DESC)       AS gift_rank,
               rank() OVER (ORDER BY followers DESC)   AS follower_rank,
               count(*) OVER ()                        AS total_players
        FROM base
      )
      SELECT * FROM ranked WHERE account_id = ${me}
    `;

    if (!row) return { tier: tierName(0), court_value: 0, ranks: null };

    return {
      court_value: row.court_value,
      tier: tierName(row.court_value),
      next_tier: TIERS.find((t) => t.min > row.court_value)?.name ?? null,
      next_tier_at: TIERS.find((t) => t.min > row.court_value)?.min ?? null,
      total_players: Number(row.total_players),
      ranks: {
        court: Number(row.court_rank),
        woofs: Number(row.woof_rank),
        likes: Number(row.like_rank),
        gifts: Number(row.gift_rank),
        followers: Number(row.follower_rank),
      },
      totals: {
        woofs: row.woofs, likes: row.likes,
        gifts: row.gifts, followers: row.followers,
      },
    };
  });
};
