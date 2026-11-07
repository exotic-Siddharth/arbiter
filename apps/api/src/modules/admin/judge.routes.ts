import {
  AdminJobSchema,
  GenerateOutputsResponseSchema,
  IdParams,
  JudgeStatusSchema,
  ValidateReferenceResponseSchema,
} from '@arbiter/shared';
import { createRouter, notImplemented } from '../../lib/router';

// Owner: lane A2. Mounted FIRST at /api/admin (R10). Scaffold stub: replace `notImplemented`.
const { router, route } = createRouter('/api/admin');
export { router };

route(
  {
    method: 'post',
    path: '/problems/:id/validate-reference',
    summary: 'Judge the stored reference solution as a REFERENCE submission',
    description: 'Watch the returned submission like any other (socket submission:subscribe).',
    tags: ['Admin: judge'],
    auth: 'admin',
    request: { params: IdParams },
    responses: {
      202: ValidateReferenceResponseSchema,
      404: 'Problem not found',
      409: 'The problem has no reference solution',
    },
  },
  notImplemented,
);

route(
  {
    method: 'post',
    path: '/problems/:id/generate-outputs',
    summary: 'Run the reference on every test input and overwrite expectedOutput',
    tags: ['Admin: judge'],
    auth: 'admin',
    request: { params: IdParams },
    responses: {
      202: GenerateOutputsResponseSchema,
      404: 'Problem not found',
      409: 'The problem has no reference solution',
    },
  },
  notImplemented,
);

route(
  {
    method: 'get',
    path: '/jobs/:id',
    summary: 'Progress of an admin job (generate outputs)',
    tags: ['Admin: judge'],
    auth: 'admin',
    request: { params: IdParams },
    responses: { 200: AdminJobSchema, 404: 'Job not found' },
  },
  notImplemented,
);

route(
  {
    method: 'get',
    path: '/judge',
    summary: 'Judge monitor: queue counts, workers, latency, throughput',
    tags: ['Admin: judge'],
    auth: 'admin',
    responses: { 200: JudgeStatusSchema },
  },
  notImplemented,
);
