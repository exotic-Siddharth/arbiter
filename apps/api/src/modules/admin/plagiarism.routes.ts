import {
  CreatePlagiarismBody,
  IdParams,
  PlagiarismCreatedResponseSchema,
  PlagiarismListQuery,
  PlagiarismReportDetailSchema,
  PlagiarismReportListSchema,
} from '@arbiter/shared';
import { getDeps } from '../../lib/deps';
import { createRouter } from '../../lib/router';
import {
  createPlagiarismReport,
  getPlagiarismReport,
  listPlagiarismReports,
} from '../plagiarism/admin';

// Owner: lane A3b. Mounted at /api/admin/plagiarism behind requireRole('ADMIN') (R10).
const { router, route } = createRouter('/api/admin/plagiarism');
export { router };

route(
  {
    method: 'post',
    path: '/',
    summary: 'Start a plagiarism check for a contest (job on the plagiarism queue)',
    tags: ['Admin: plagiarism'],
    auth: 'admin',
    request: { body: CreatePlagiarismBody },
    responses: { 202: PlagiarismCreatedResponseSchema, 404: 'Contest or problem not found' },
  },
  async (req, res) => {
    res.status(202).json(await createPlagiarismReport(getDeps(req).prisma, req.body));
  },
);

route(
  {
    method: 'get',
    path: '/',
    summary: 'Plagiarism reports, newest first',
    tags: ['Admin: plagiarism'],
    auth: 'admin',
    request: { query: PlagiarismListQuery },
    responses: { 200: PlagiarismReportListSchema },
  },
  async (req, res) => {
    res.json(await listPlagiarismReports(getDeps(req).prisma, req.validatedQuery.contestId));
  },
);

route(
  {
    method: 'get',
    path: '/:id',
    summary: 'A report with its pairs (highest similarity first)',
    tags: ['Admin: plagiarism'],
    auth: 'admin',
    request: { params: IdParams },
    responses: { 200: PlagiarismReportDetailSchema, 404: 'Report not found' },
  },
  async (req, res) => {
    res.json(await getPlagiarismReport(getDeps(req).prisma, req.params.id));
  },
);
