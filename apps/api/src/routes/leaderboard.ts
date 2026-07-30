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
