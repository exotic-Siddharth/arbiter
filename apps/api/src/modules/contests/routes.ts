import {
  ContestDetailSchema,
  ContestListSchema,
  ContestProblemParams,
  ContestSubmissionsQuery,
  ListContestsQuery,
  ProblemDetailSchema,
  ScoreboardQuery,
  ScoreboardSchema,
  SlugParams,
  SubmissionPageSchema,
} from '@arbiter/shared';
import { createRouter, notImplemented } from '../../lib/router';

// Owner: lane A3. Scaffold stub: replace `notImplemented` with the real handlers (keep the defs).
const { router, route } = createRouter('/api/contests');
export { router };

route(
  {
    method: 'get',
    path: '/',
    summary: 'Contests by status',
    tags: ['Contests'],
    auth: 'optional',
    request: { query: ListContestsQuery },
    responses: { 200: ContestListSchema },
  },
  notImplemented,
);

route(
  {
    method: 'get',
    path: '/:slug',
    summary: 'Contest detail (problems are null before the start for non-admins)',
    tags: ['Contests'],
    auth: 'optional',
    request: { params: SlugParams },
    responses: { 200: ContestDetailSchema, 404: 'Contest not found' },
  },
  notImplemented,
);

route(
  {
    method: 'post',
    path: '/:slug/register',
    summary: 'Register for a contest (allowed until endsAt)',
    tags: ['Contests'],
    auth: 'user',
    request: { params: SlugParams },
    responses: {
      204: null,
      403: 'The contest has ended',
      404: 'Contest not found',
      409: 'Already registered',
    },
  },
  notImplemented,
);

route(
  {
    method: 'get',
    path: '/:slug/problems/:label',
    summary: 'A contest problem by label (after the start)',
    tags: ['Contests'],
    auth: 'optional',
    request: { params: ContestProblemParams },
    responses: { 200: ProblemDetailSchema, 404: 'Contest or problem not found (or not started)' },
  },
  notImplemented,
);

route(
  {
    method: 'get',
    path: '/:slug/scoreboard',
    summary: 'ICPC scoreboard page',
    tags: ['Contests'],
    auth: 'optional',
    request: { params: SlugParams, query: ScoreboardQuery },
    responses: { 200: ScoreboardSchema, 404: 'Contest not found' },
  },
  notImplemented,
);

route(
  {
    method: 'get',
    path: '/:slug/submissions',
    summary: 'Contest submissions (mine=true for your own)',
    tags: ['Contests'],
    auth: 'user',
    request: { params: SlugParams, query: ContestSubmissionsQuery },
    responses: { 200: SubmissionPageSchema, 404: 'Contest not found' },
  },
  notImplemented,
);
