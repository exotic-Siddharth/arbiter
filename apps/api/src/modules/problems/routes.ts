import {
  ListProblemsQuery,
  ProblemDetailSchema,
  ProblemPageSchema,
  SlugParams,
} from '@arbiter/shared';
import { getDeps } from '../../lib/deps';
import { createRouter } from '../../lib/router';
import { getProblemDetail, listProblems } from './service';

// Owner: lane A3a.
const { router, route } = createRouter('/api/problems');
export { router };

route(
  {
    method: 'get',
    path: '/',
    summary: 'Published problems with search, filters, sort and paging',
    description:
      'status=solved|attempted|unsolved applies to the signed-in user (a guest has solved and attempted nothing; unsolved = not solved).',
    tags: ['Problems'],
    auth: 'optional',
    request: { query: ListProblemsQuery },
    responses: { 200: ProblemPageSchema },
  },
  async (req, res) => {
    res.json(await listProblems(getDeps(req).prisma, req.validatedQuery, req.user));
  },
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
  async (req, res) => {
    res.json(await getProblemDetail(getDeps(req).prisma, req.params.slug, req.user));
  },
);
