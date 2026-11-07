import {
  AdminContestBody,
  AdminContestListQuery,
  AdminContestPageSchema,
  AdminContestSchema,
  IdParams,
  RateContestResponseSchema,
} from '@arbiter/shared';
import { createRouter, notImplemented } from '../../lib/router';

// Owner: lane A3. Scaffold stub: replace `notImplemented` with the real handlers (keep the defs).
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
  notImplemented,
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
  notImplemented,
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
  notImplemented,
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
  notImplemented,
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
  notImplemented,
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
  notImplemented,
);
