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
import { getDeps } from '../../lib/deps';
import { createRouter } from '../../lib/router';
import { getScoreboard } from './scoreboard';
import {
  findVisibleContest,
  getContestDetail,
  getContestProblem,
  listContestSubmissions,
  listContests,
  registerForContest,
} from './service';

// Owner: lane A3b. Public contest routes (spec sections 9 and 10).
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
  async (req, res) => {
    res.json(await listContests(getDeps(req).prisma, req.validatedQuery.status, req.user));
  },
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
  async (req, res) => {
    res.json(await getContestDetail(getDeps(req).prisma, req.params.slug, req.user));
  },
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
  async (req, res) => {
    await registerForContest(getDeps(req).prisma, req.params.slug, req.user!);
    res.status(204).end();
  },
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
  async (req, res) => {
    const { slug, label } = req.params;
    res.json(await getContestProblem(getDeps(req).prisma, slug, label, req.user));
  },
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
  async (req, res) => {
    const contest = await findVisibleContest(getDeps(req).prisma, req.params.slug, req.user);
    const { page, pageSize } = req.validatedQuery;
    res.json(await getScoreboard(contest.id, page, pageSize));
  },
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
  async (req, res) => {
    res.json(
      await listContestSubmissions(
        getDeps(req).prisma,
        req.params.slug,
        req.validatedQuery,
        req.user!,
      ),
    );
  },
);
