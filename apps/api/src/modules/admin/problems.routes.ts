import {
  AdminProblemBody,
  AdminProblemListQuery,
  AdminProblemPageSchema,
  AdminProblemSchema,
  AdminTestBody,
  AdminTestCaseSchema,
  AdminTestListSchema,
  BulkTestsBody,
  BulkTestsResponseSchema,
  IdParams,
  ProblemTestParams,
} from '@arbiter/shared';
import express from 'express';
import { createRouter, notImplemented } from '../../lib/router';

// Owner: lane A3. Scaffold stub: replace `notImplemented` with the real handlers (keep the defs).
const { router, route } = createRouter('/api/admin/problems');
export { router };

// R5: the app-level 1 MB JSON parser skips /api/admin/problems/:id/tests*; these routes get 20 MB.
router.use('/:id/tests', express.json({ limit: '20mb' }));

route(
  {
    method: 'get',
    path: '/',
    summary: 'All problems, including unpublished ones',
    tags: ['Admin: problems'],
    auth: 'admin',
    request: { query: AdminProblemListQuery },
    responses: { 200: AdminProblemPageSchema },
  },
  notImplemented,
);

route(
  {
    method: 'post',
    path: '/',
    summary: 'Create a problem',
    tags: ['Admin: problems'],
    auth: 'admin',
    request: { body: AdminProblemBody },
    responses: { 201: AdminProblemSchema, 409: 'Slug already taken' },
  },
  notImplemented,
);

route(
  {
    method: 'get',
    path: '/:id',
    summary: 'A problem with its reference solution',
    tags: ['Admin: problems'],
    auth: 'admin',
    request: { params: IdParams },
    responses: { 200: AdminProblemSchema, 404: 'Problem not found' },
  },
  notImplemented,
);

route(
  {
    method: 'put',
    path: '/:id',
    summary: 'Replace a problem',
    tags: ['Admin: problems'],
    auth: 'admin',
    request: { params: IdParams, body: AdminProblemBody },
    responses: { 200: AdminProblemSchema, 404: 'Problem not found', 409: 'Slug already taken' },
  },
  notImplemented,
);

route(
  {
    method: 'delete',
    path: '/:id',
    summary: 'Delete a problem',
    tags: ['Admin: problems'],
    auth: 'admin',
    request: { params: IdParams },
    responses: { 204: null, 404: 'Problem not found' },
  },
  notImplemented,
);

route(
  {
    method: 'get',
    path: '/:id/tests',
    summary: 'Test cases of a problem (sizes and short previews)',
    tags: ['Admin: problems'],
    auth: 'admin',
    request: { params: IdParams },
    responses: { 200: AdminTestListSchema, 404: 'Problem not found' },
  },
  notImplemented,
);

route(
  {
    method: 'post',
    path: '/:id/tests',
    summary: 'Add a test case',
    tags: ['Admin: problems'],
    auth: 'admin',
    request: { params: IdParams, body: AdminTestBody },
    responses: { 201: AdminTestCaseSchema, 404: 'Problem not found', 409: 'Ordinal already used' },
  },
  notImplemented,
);

route(
  {
    method: 'post',
    path: '/:id/tests/bulk',
    summary: 'Upload many test cases (replace=true deletes the existing ones first)',
    description: 'JSON body limit 20 MB.',
    tags: ['Admin: problems'],
    auth: 'admin',
    request: { params: IdParams, body: BulkTestsBody },
    responses: {
      200: BulkTestsResponseSchema,
      404: 'Problem not found',
      413: 'Body larger than 20 MB',
    },
  },
  notImplemented,
);

route(
  {
    method: 'get',
    path: '/:id/tests/:testId',
    summary: 'One test case with its full input and expected output',
    tags: ['Admin: problems'],
    auth: 'admin',
    request: { params: ProblemTestParams },
    responses: { 200: AdminTestCaseSchema, 404: 'Test case not found' },
  },
  notImplemented,
);

route(
  {
    method: 'put',
    path: '/:id/tests/:testId',
    summary: 'Replace a test case',
    tags: ['Admin: problems'],
    auth: 'admin',
    request: { params: ProblemTestParams, body: AdminTestBody },
    responses: {
      200: AdminTestCaseSchema,
      404: 'Test case not found',
      409: 'Ordinal already used',
    },
  },
  notImplemented,
);

route(
  {
    method: 'delete',
    path: '/:id/tests/:testId',
    summary: 'Delete a test case',
    tags: ['Admin: problems'],
    auth: 'admin',
    request: { params: ProblemTestParams },
    responses: { 204: null, 404: 'Test case not found' },
  },
  notImplemented,
);
