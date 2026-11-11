import { TagListSchema } from '@arbiter/shared';
import { getDeps } from '../../lib/deps';
import { createRouter } from '../../lib/router';
import { listTags } from './service';

// Owner: lane A3a.
const { router, route } = createRouter('/api/tags');
export { router };

route(
  {
    method: 'get',
    path: '/',
    summary: 'Tags with the number of published problems',
    tags: ['Problems'],
    responses: { 200: TagListSchema },
  },
  async (req, res) => {
    res.json(await listTags(getDeps(req).prisma));
  },
);
