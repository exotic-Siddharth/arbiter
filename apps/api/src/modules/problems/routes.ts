import {
  ListProblemsQuery,
  ProblemDetailSchema,
  ProblemPageSchema,
  SlugParams,
} from '@arbiter/shared';
import { createRouter, notImplemented } from '../../lib/router';

// Owner: lane A3. Scaffold stub: replace `notImplemented` with the real handlers (keep the defs).
const { router, route } = createRouter('/api/problems');
export { router };

route(
  {
    method: 'get',
    path: '/',
    summary: 'Published problems with search, filters, sort and paging',
    description: 'status=solved|attempted|unsolved needs a signed-in user.',
    tags: ['Problems'],
    auth: 'optional',
    request: { query: ListProblemsQuery },
    responses: { 200: ProblemPageSchema },
  },
  notImplemented,
);

route(
  {
    method: 'get',
    path: '/:slug',
    summary: 'Problem statement, limits and samples (published, or admin)',
    tags: ['Problems'],
    auth: 'optional',
    request: { params: SlugParams },
    responses: { 200: ProblemDetailSchema, 404: 'Problem not found' },
  },
  notImplemented,
);
