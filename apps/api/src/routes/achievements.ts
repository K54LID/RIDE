import type { FastifyPluginAsync } from 'fastify';
import { listAchievements, evaluateAchievements } from '../lib/achievements.js';

const achievementRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/achievements', { preHandler: [app.requireAuth] }, async (req) => {
    // Evaluate on read: cheap, and it means a badge is never "owed" but
    // unshown. Anything newly earned comes back for the celebration.
    const newlyUnlocked = await evaluateAchievements(req.accountId!);
    const all = await listAchievements(req.accountId!);

    return {
      achievements: all,
      newly_unlocked: newlyUnlocked.map((a) => a.slug),
      unlocked_count: all.filter((a) => a.unlocked).length,
      total_count: all.length,
    };
  });
};

export default achievementRoutes;
