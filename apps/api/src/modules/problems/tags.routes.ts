import { TagListSchema } from '@arbiter/shared';
import { createRouter, notImplemented } from '../../lib/router';

// Owner: lane A3. Scaffold stub: replace `notImplemented` with the real handler (keep the def).
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
  notImplemented,
);
