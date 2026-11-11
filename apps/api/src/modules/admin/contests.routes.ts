import {
  AdminContestBody,
  AdminContestListQuery,
  AdminContestPageSchema,
  AdminContestSchema,
  IdParams,
  RateContestResponseSchema,
} from '@arbiter/shared';
import { getDeps } from '../../lib/deps';
import { createRouter } from '../../lib/router';
import {
  createAdminContest,
  deleteAdminContest,
  getAdminContest,
  listAdminContests,
  rateContest,
  updateAdminContest,
} from '../contests/admin';

// Owner: lane A3b. Mounted at /api/admin/contests behind requireRole('ADMIN') (R10).
const { router, route } = createRouter('/api/admin/contests');
export { router };

route(
  {
    method: 'get',
    path: '/',
    summary: 'All contests, including unpublished ones',
    tags: ['Admin: contests'],
    auth: 'admin',
    request: { query: AdminContestListQuery },
    responses: { 200: AdminContestPageSchema },
  },
  async (req, res) => {
    res.json(await listAdminContests(getDeps(req).prisma, req.validatedQuery));
  },
);

route(
  {
    method: 'post',
    path: '/',
    summary: 'Create a contest with labelled problems',
    tags: ['Admin: contests'],
    auth: 'admin',
    request: { body: AdminContestBody },
    responses: { 201: AdminContestSchema, 409: 'Slug already taken' },
  },
  async (req, res) => {
    res.status(201).json(await createAdminContest(getDeps(req).prisma, req.body));
  },
);

route(
  {
    method: 'get',
    path: '/:id',
    summary: 'A contest with its problems',
    tags: ['Admin: contests'],
    auth: 'admin',
    request: { params: IdParams },
    responses: { 200: AdminContestSchema, 404: 'Contest not found' },
  },
  async (req, res) => {
    res.json(await getAdminContest(getDeps(req).prisma, req.params.id));
  },
);

route(
  {
    method: 'put',
    path: '/:id',
    summary: 'Replace a contest and its problem list',
    tags: ['Admin: contests'],
    auth: 'admin',
    request: { params: IdParams, body: AdminContestBody },
    responses: { 200: AdminContestSchema, 404: 'Contest not found', 409: 'Slug already taken' },
  },
  async (req, res) => {
    res.json(await updateAdminContest(getDeps(req).prisma, req.params.id, req.body));
  },
);

route(
  {
    method: 'delete',
    path: '/:id',
    summary: 'Delete a contest',
    tags: ['Admin: contests'],
    auth: 'admin',
    request: { params: IdParams },
    responses: { 204: null, 404: 'Contest not found' },
  },
  async (req, res) => {
    await deleteAdminContest(getDeps(req).prisma, req.params.id);
    res.status(204).end();
  },
);

route(
  {
    method: 'post',
    path: '/:id/rate',
    summary: 'Apply Elo rating changes (once, after the end)',
    tags: ['Admin: contests'],
    auth: 'admin',
    request: { params: IdParams },
    responses: {
      200: RateContestResponseSchema,
      404: 'Contest not found',
      409: 'The contest has not ended or is already rated',
    },
  },
  async (req, res) => {
    res.json(await rateContest(getDeps(req).prisma, req.params.id));
  },
);
