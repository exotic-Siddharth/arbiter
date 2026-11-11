import {
  AdminJobSchema,
  GenerateOutputsResponseSchema,
  IdParams,
  JudgeStatusSchema,
  ValidateReferenceResponseSchema,
} from '@arbiter/shared';
import { getAdminJob, startGenerateOutputs, validateReference } from '../../judge/admin';
import { getJudgeStatus } from '../../judge/monitor';
import { getDeps } from '../../lib/deps';
import { unauthorized } from '../../lib/errors';
import { createRouter } from '../../lib/router';

// Owner: lane A2. Mounted FIRST at /api/admin (R10).
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
  async (req, res) => {
    if (!req.user) throw unauthorized();
    res.status(202).json(await validateReference(getDeps(req).prisma, req.params.id, req.user.id));
  },
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
  async (req, res) => {
    res.status(202).json(await startGenerateOutputs(getDeps(req).prisma, req.params.id));
  },
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
  async (req, res) => {
    res.json(await getAdminJob(getDeps(req).prisma, req.params.id));
  },
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
  async (req, res) => {
    const { prisma, redis } = getDeps(req);
    res.json(await getJudgeStatus({ prisma, redis }));
  },
);
