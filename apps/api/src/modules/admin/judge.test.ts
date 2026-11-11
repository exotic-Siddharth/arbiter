import {
  AdminJobSchema,
  GenerateOutputsResponseSchema,
  JudgeStatusSchema,
  ValidateReferenceResponseSchema,
} from '@arbiter/shared';
import type { PrismaClient, User } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetTables, setupTestDatabase } from '../../../test/db';
import { authHeader, createProblem, createSubmission, createUser } from '../../../test/factories';
import { createApp } from '../../app';
import { startHeartbeat, type Heartbeat } from '../../judge/heartbeat';
import { getQueue } from '../../judge/queue';

let prisma: PrismaClient;
const app = createApp({ rateLimits: false });
let admin: User;
let user: User;
let heartbeat: Heartbeat | undefined;

const REFERENCE = { referenceLanguage: 'PYTHON' as const, referenceSolution: 'print(1)' };

beforeAll(async () => {
  prisma = await setupTestDatabase();
  await resetTables(prisma);
  admin = await createUser(prisma, { role: 'ADMIN' });
  user = await createUser(prisma);
});

afterAll(async () => {
  await heartbeat?.stop();
});

describe('admin judge RBAC', () => {
  it('USER gets 403 and a guest 401 on every admin judge route', async () => {
    const problem = await createProblem(prisma, REFERENCE);
    const paths: ['get' | 'post', string][] = [
      ['post', `/api/admin/problems/${problem.id}/validate-reference`],
      ['post', `/api/admin/problems/${problem.id}/generate-outputs`],
      ['get', '/api/admin/jobs/some-id'],
      ['get', '/api/admin/judge'],
    ];
    for (const [method, path] of paths) {
      expect((await request(app)[method](path).set(authHeader(user))).status).toBe(403);
      expect((await request(app)[method](path)).status).toBe(401);
    }
  });
});

describe('POST /api/admin/problems/:id/validate-reference', () => {
  it('creates a QUEUED REFERENCE submission and enqueues it', async () => {
    const problem = await createProblem(prisma, { ...REFERENCE, isPublished: false });
    const res = await request(app)
      .post(`/api/admin/problems/${problem.id}/validate-reference`)
      .set(authHeader(admin));
    expect(res.status).toBe(202);
    const { submissionId } = ValidateReferenceResponseSchema.parse(res.body);
    const submission = await prisma.submission.findUniqueOrThrow({ where: { id: submissionId } });
    expect(submission).toMatchObject({
      kind: 'REFERENCE',
      userId: admin.id,
      problemId: problem.id,
      language: 'PYTHON',
      sourceCode: 'print(1)',
      status: 'QUEUED',
      testsTotal: 5,
      contestId: null,
    });
    const job = await getQueue('judge').getJob(`sub-${submissionId}`);
    expect(job?.data).toEqual({ type: 'SUBMISSION', submissionId });
  });

  it('is 409 without a reference solution and 404 for an unknown problem', async () => {
    const problem = await createProblem(prisma);
    const missing = await request(app)
      .post(`/api/admin/problems/${problem.id}/validate-reference`)
      .set(authHeader(admin));
    expect(missing.status).toBe(409);
    const unknown = await request(app)
      .post('/api/admin/problems/does-not-exist/validate-reference')
      .set(authHeader(admin));
    expect(unknown.status).toBe(404);
  });
});

describe('generate outputs and admin jobs', () => {
  it('creates a PENDING GENERATE_OUTPUTS job, enqueues it and reports its progress', async () => {
    const problem = await createProblem(prisma, REFERENCE);
    const res = await request(app)
      .post(`/api/admin/problems/${problem.id}/generate-outputs`)
      .set(authHeader(admin));
    expect(res.status).toBe(202);
    const { jobId } = GenerateOutputsResponseSchema.parse(res.body);
    const queued = await getQueue('judge').getJob(`gen-${jobId}`);
    expect(queued?.data).toEqual({ type: 'GENERATE_OUTPUTS', adminJobId: jobId });

    const job = await request(app).get(`/api/admin/jobs/${jobId}`).set(authHeader(admin));
    expect(job.status).toBe(200);
    expect(AdminJobSchema.parse(job.body)).toEqual({
      id: jobId,
      type: 'GENERATE_OUTPUTS',
      status: 'PENDING',
      progress: 0,
      total: 5,
      error: null,
    });
  });

  it('is 409 without a reference, 404 for unknown problems and jobs', async () => {
    const problem = await createProblem(prisma);
    expect(
      (
        await request(app)
          .post(`/api/admin/problems/${problem.id}/generate-outputs`)
          .set(authHeader(admin))
      ).status,
    ).toBe(409);
    expect(
      (await request(app).post('/api/admin/problems/nope/generate-outputs').set(authHeader(admin)))
        .status,
    ).toBe(404);
    expect((await request(app).get('/api/admin/jobs/nope').set(authHeader(admin))).status).toBe(
      404,
    );
  });
});

describe('GET /api/admin/judge', () => {
  it('reports queues, live workers, latency and throughput', async () => {
    heartbeat = startHeartbeat({ concurrency: 2, workerId: 'test-worker-1' });
    await heartbeat.beat();
    const problem = await createProblem(prisma);
    const now = Date.now();
    for (const latencyMs of [1000, 2000, 3000, 4000]) {
      await createSubmission(prisma, {
        userId: user.id,
        problemId: problem.id,
        status: 'DONE',
        verdict: 'AC',
        createdAt: new Date(now - latencyMs - 5000),
        judgedAt: new Date(now - 5000),
      });
    }

    const res = await request(app).get('/api/admin/judge').set(authHeader(admin));
    expect(res.status).toBe(200);
    const status = JudgeStatusSchema.parse(res.body);
    expect(Object.keys(status.queues).sort()).toEqual(['judge', 'plagiarism', 'run']);
    expect(status.workers).toEqual([
      expect.objectContaining({ id: 'test-worker-1', concurrency: 2 }),
    ]);
    expect(status.latency).toEqual({ p50Ms: 2000, p95Ms: 4000, sample: 4 });
    expect(status.throughputPerMin).toHaveLength(30);
    expect(status.throughputPerMin.reduce((sum, m) => sum + m.count, 0)).toBe(4);
    const minutes = status.throughputPerMin.map((m) => Date.parse(m.minute));
    expect([...minutes].sort((a, b) => a - b)).toEqual(minutes);
  });
});
