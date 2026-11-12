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
import { getDeps } from '../../lib/deps';
import { unauthorized } from '../../lib/errors';
import { createRouter } from '../../lib/router';
import {
  bulkAdminTests,
  createAdminProblem,
  createAdminTest,
  deleteAdminProblem,
  deleteAdminTest,
  getAdminProblem,
  getAdminTest,
  listAdminProblems,
  listAdminTests,
  updateAdminProblem,
  updateAdminTest,
} from '../problems/admin.service';

// Owner: lane A3a.
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
  async (req, res) => {
    res.json(await listAdminProblems(getDeps(req).prisma, req.validatedQuery));
  },
);

route(
  {
    method: 'post',
    path: '/',
    summary: 'Create a problem',
    tags: ['Admin: problems'],
    auth: 'admin',
    request: { body: AdminProblemBody },
    responses: { 201: AdminProblemSchema, 409: 'Slug already taken, or publishing without tests' },
  },
  async (req, res) => {
    if (!req.user) throw unauthorized();
    res.status(201).json(await createAdminProblem(getDeps(req).prisma, req.body, req.user.id));
  },
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
  async (req, res) => {
    res.json(await getAdminProblem(getDeps(req).prisma, req.params.id));
  },
);

route(
  {
    method: 'put',
    path: '/:id',
    summary: 'Replace a problem',
    tags: ['Admin: problems'],
    auth: 'admin',
    request: { params: IdParams, body: AdminProblemBody },
    responses: {
      200: AdminProblemSchema,
      404: 'Problem not found',
      409: 'Slug already taken, or publishing without tests',
    },
  },
  async (req, res) => {
    res.json(await updateAdminProblem(getDeps(req).prisma, req.params.id, req.body));
  },
);

route(
  {
    method: 'delete',
    path: '/:id',
    summary: 'Delete a problem',
    tags: ['Admin: problems'],
    auth: 'admin',
    request: { params: IdParams },
    responses: { 204: null, 404: 'Problem not found', 409: 'The problem is in a rated contest' },
  },
  async (req, res) => {
    await deleteAdminProblem(getDeps(req).prisma, req.params.id);
    res.status(204).end();
  },
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
  async (req, res) => {
    res.json(await listAdminTests(getDeps(req).prisma, req.params.id));
  },
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
  async (req, res) => {
    res.status(201).json(await createAdminTest(getDeps(req).prisma, req.params.id, req.body));
  },
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
  async (req, res) => {
    res.json(await bulkAdminTests(getDeps(req).prisma, req.params.id, req.body));
  },
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
  async (req, res) => {
    res.json(await getAdminTest(getDeps(req).prisma, req.params.id, req.params.testId));
  },
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
  async (req, res) => {
    const { id, testId } = req.params;
    res.json(await updateAdminTest(getDeps(req).prisma, id, testId, req.body));
  },
);

route(
  {
    method: 'delete',
    path: '/:id/tests/:testId',
    summary: 'Delete a test case',
    tags: ['Admin: problems'],
    auth: 'admin',
    request: { params: ProblemTestParams },
    responses: { 204: null, 404: 'Test case not found', 409: 'Last test of a published problem' },
  },
  async (req, res) => {
    await deleteAdminTest(getDeps(req).prisma, req.params.id, req.params.testId);
    res.status(204).end();
  },
);
