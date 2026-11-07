import { LeaderboardPageSchema, LeaderboardQuery } from '@arbiter/shared';
import { createRouter, notImplemented } from '../../lib/router';

// Owner: lane A1. Scaffold stub: replace `notImplemented` with the real handler (keep the def).
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
  notImplemented,
);
