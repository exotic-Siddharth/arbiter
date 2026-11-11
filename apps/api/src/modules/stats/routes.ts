import { StatsSchema } from '@arbiter/shared';
import { getDeps } from '../../lib/deps';
import { createRouter } from '../../lib/router';
import { getSiteStats } from './service';

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
  async (req, res) => {
    res.json(await getSiteStats(getDeps(req).prisma));
  },
);
