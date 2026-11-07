import { StatsSchema } from '@arbiter/shared';
import { createRouter, notImplemented } from '../../lib/router';

// Owner: lane A1. Scaffold stub: replace `notImplemented` with the real handler (keep the def).
const { router, route } = createRouter('/api/stats');
export { router };

route(
  {
    method: 'get',
    path: '/',
    summary: 'Site statistics for the landing page',
    tags: ['Stats'],
    responses: { 200: StatsSchema },
  },
  notImplemented,
);
