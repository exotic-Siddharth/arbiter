import { CreateRunResponseSchema, RunStatusResponseSchema, type RunResult } from '@arbiter/shared';
import type { PrismaClient, User } from '@prisma/client';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { resetTables, setupTestDatabase } from '../../../test/db';
import { authHeader, createContest, createProblem, createUser } from '../../../test/factories';
import { createApp } from '../../app';
import { RUN_TTL_SEC, getQueue, runKey, type RunJobData, type StoredRun } from '../../judge/queue';
import { getRedis } from '../../lib/redis';

let prisma: PrismaClient;
const app = createApp({ rateLimits: false });
let owner: User;
let other: User;
let admin: User;

beforeAll(async () => {
  prisma = await setupTestDatabase();
  await resetTables(prisma);
  owner = await createUser(prisma);
  other = await createUser(prisma);
  admin = await createUser(prisma, { role: 'ADMIN' });
});

const body = (extra: Record<string, unknown> = {}) => ({
  language: 'PYTHON',
  sourceCode: 'print(input())',
  input: 'hello\n',
  ...extra,
});

async function postRun(user: User, extra: Record<string, unknown> = {}) {
  return request(app).post('/api/runs').set(authHeader(user)).send(body(extra));
}

async function queuedJob(runId: string): Promise<RunJobData> {
  const job = await getQueue('run').getJob(`run-${runId}`);
  expect(job).toBeDefined();
  return job!.data as RunJobData;
}

describe('POST /api/runs', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/runs').send(body());
    expect(res.status).toBe(401);
  });

  it('enqueues a run with the default limits (1000 ms / 256 MB)', async () => {
    const res = await postRun(owner);
    expect(res.status).toBe(202);
    const { runId } = CreateRunResponseSchema.parse(res.body);
    expect(await queuedJob(runId)).toEqual({
      runId,
      userId: owner.id,
      language: 'PYTHON',
      sourceCode: 'print(input())',
      input: 'hello\n',
      timeLimitMs: 1000,
      memoryLimitMb: 256,
    });
    const ttl = await getRedis().ttl(runKey(runId));
    expect(ttl).toBeGreaterThan(RUN_TTL_SEC - 30);
  });

  it('takes the limits of a published problem', async () => {
    const problem = await createProblem(prisma, { timeLimitMs: 2500, memoryLimitMb: 64 });
    const res = await postRun(owner, { problemSlug: problem.slug });
    expect(res.status).toBe(202);
    expect(await queuedJob(res.body.runId)).toMatchObject({
      timeLimitMs: 2500,
      memoryLimitMb: 64,
    });
  });

  it('hides unpublished problems from users (404) but not from admins', async () => {
    const problem = await createProblem(prisma, { isPublished: false, timeLimitMs: 3000 });
    expect((await postRun(owner, { problemSlug: problem.slug })).status).toBe(404);
    const res = await postRun(admin, { problemSlug: problem.slug });
    expect(res.status).toBe(202);
    expect(await queuedJob(res.body.runId)).toMatchObject({ timeLimitMs: 3000 });
  });

  it('allows an unpublished problem of a started contest, not of an upcoming one', async () => {
    const started = await createProblem(prisma, { isPublished: false, timeLimitMs: 1500 });
    await createContest(prisma, { problems: [{ problemId: started.id, label: 'A' }] });
    const upcoming = await createProblem(prisma, { isPublished: false });
    const inHour = Date.now() + 3_600_000;
    await createContest(prisma, {
      startsAt: new Date(inHour),
      endsAt: new Date(inHour + 3_600_000),
      problems: [{ problemId: upcoming.id, label: 'A' }],
    });
    const ok = await postRun(owner, { problemSlug: started.slug });
    expect(ok.status).toBe(202);
    expect(await queuedJob(ok.body.runId)).toMatchObject({ timeLimitMs: 1500 });
    expect((await postRun(owner, { problemSlug: upcoming.slug })).status).toBe(404);
    expect((await postRun(owner, { problemSlug: 'no-such-problem' })).status).toBe(404);
  });

  it('validates the body', async () => {
    const res = await request(app)
      .post('/api/runs')
      .set(authHeader(owner))
      .send({ language: 'COBOL', sourceCode: 'x', input: '' });
    expect(res.status).toBe(400);
  });

  it('rate-limits runs to 12 per minute per user', async () => {
    const limited = createApp({ rateLimits: { runs: true } });
    const user = await createUser(prisma);
    for (let i = 0; i < 12; i += 1) {
      const res = await request(limited).post('/api/runs').set(authHeader(user)).send(body());
      expect(res.status).toBe(202);
    }
    const res = await request(limited).post('/api/runs').set(authHeader(user)).send(body());
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
  });
});

describe('GET /api/runs/:runId', () => {
  it('is PENDING for the owner until the worker stores the result', async () => {
    const { body: created } = await postRun(owner);
    const pending = await request(app).get(`/api/runs/${created.runId}`).set(authHeader(owner));
    expect(pending.status).toBe(200);
    expect(RunStatusResponseSchema.parse(pending.body)).toEqual({ status: 'PENDING' });

    const result: RunResult = {
      runId: created.runId,
      status: 'OK',
      stdout: 'hello\n',
      stderr: '',
      compileOutput: null,
      timeMs: 12,
      memoryKb: 9000,
    };
    const stored: StoredRun = { userId: owner.id, status: 'DONE', result };
    await getRedis().set(runKey(created.runId), JSON.stringify(stored), 'EX', 60);
    const done = await request(app).get(`/api/runs/${created.runId}`).set(authHeader(owner));
    expect(done.status).toBe(200);
    expect(RunStatusResponseSchema.parse(done.body)).toEqual({ status: 'DONE', result });
  });

  it('is 404 for anyone but the owner (admins included) and for unknown runs', async () => {
    const { body: created } = await postRun(owner);
    for (const user of [other, admin]) {
      const res = await request(app).get(`/api/runs/${created.runId}`).set(authHeader(user));
      expect(res.status).toBe(404);
    }
    const unknown = await request(app).get('/api/runs/nope').set(authHeader(owner));
    expect(unknown.status).toBe(404);
    expect((await request(app).get(`/api/runs/${created.runId}`)).status).toBe(401);
  });
});
