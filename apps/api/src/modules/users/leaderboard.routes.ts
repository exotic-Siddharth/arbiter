import { LeaderboardPageSchema, LeaderboardQuery } from '@arbiter/shared';
import { getDeps } from '../../lib/deps';
import { createRouter } from '../../lib/router';
import { getLeaderboard } from './leaderboard.service';

const { router, route } = createRouter('/api/leaderboard');
export { router };

route(
  {
    method: 'get',
    path: '/',
    summary: 'Leaderboard by rating or by problems solved (ties share a rank)',
    tags: ['Leaderboard'],
    request: { query: LeaderboardQuery },
    responses: { 200: LeaderboardPageSchema },
  },
  async (req, res) => {
    res.json(await getLeaderboard(getDeps(req).prisma, req.validatedQuery));
  },
);
