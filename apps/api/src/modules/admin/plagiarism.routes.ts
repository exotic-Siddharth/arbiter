import {
  CreatePlagiarismBody,
  IdParams,
  PlagiarismCreatedResponseSchema,
  PlagiarismListQuery,
  PlagiarismReportDetailSchema,
  PlagiarismReportListSchema,
} from '@arbiter/shared';
import { createRouter, notImplemented } from '../../lib/router';

// Owner: lane A3. Scaffold stub: replace `notImplemented` with the real handlers (keep the defs).
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
  notImplemented,
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
  notImplemented,
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
  notImplemented,
);
