import {
  AdminProblemPageSchema,
  AdminProblemSchema,
  AdminTestCaseSchema,
  AdminTestListSchema,
  BulkTestsResponseSchema,
  type AdminProblemBodyInput,
} from '@arbiter/shared';
import type { PrismaClient, User } from '@prisma/client';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { resetTables, setupTestDatabase } from '../../../test/db';
import {
  authHeader,
  createContest,
  createProblem,
  createSubmission,
  createUser,
  uniqueSuffix,
} from '../../../test/factories';
import { createApp } from '../../app';
import { getRedis } from '../../lib/redis';
import { rebuildScoreboard, scoreboardKeys } from '../contests/scoreboard';

let prisma: PrismaClient;
const app = createApp({ rateLimits: false });
let admin: User;
let user: User;

beforeAll(async () => {
  prisma = await setupTestDatabase();
  await resetTables(prisma);
  admin = await createUser(prisma, { role: 'ADMIN' });
  user = await createUser(prisma);
});

function body(overrides: Partial<AdminProblemBodyInput> = {}): AdminProblemBodyInput {
  const s = uniqueSuffix();
  return {
    slug: `admin-${s}`,
    title: `Admin problem ${s}`,
    statementMd: 'Print the answer.',
    difficulty: 'MEDIUM',
    timeLimitMs: 2000,
    memoryLimitMb: 128,
    tags: ['math', 'greedy'],
    ...overrides,
  };
}

const asAdmin = () => authHeader(admin);

async function createViaApi(overrides: Partial<AdminProblemBodyInput> = {}) {
  const res = await request(app).post('/api/admin/problems').set(asAdmin()).send(body(overrides));
  expect(res.status).toBe(201);
  return AdminProblemSchema.parse(res.body);
}

describe('admin problems RBAC', () => {
  it('USER gets 403 and a guest 401 on every admin problem route', async () => {
    const problem = await createProblem(prisma);
    const test = problem.testCases[0]!;
    const makeCalls = () => [
      request(app).get('/api/admin/problems'),
      request(app).post('/api/admin/problems').send(body()),
      request(app).get(`/api/admin/problems/${problem.id}`),
      request(app).put(`/api/admin/problems/${problem.id}`).send(body()),
      request(app).delete(`/api/admin/problems/${problem.id}`),
      request(app).get(`/api/admin/problems/${problem.id}/tests`),
      request(app)
        .post(`/api/admin/problems/${problem.id}/tests`)
        .send({ input: '1\n', expectedOutput: '1\n' }),
      request(app).post(`/api/admin/problems/${problem.id}/tests/bulk`).send({ tests: [] }),
      request(app).get(`/api/admin/problems/${problem.id}/tests/${test.id}`),
      request(app)
        .put(`/api/admin/problems/${problem.id}/tests/${test.id}`)
        .send({ input: '1\n', expectedOutput: '1\n' }),
      request(app).delete(`/api/admin/problems/${problem.id}/tests/${test.id}`),
    ];
    for (const call of makeCalls()) {
      const res = await call.set(authHeader(user));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
    for (const call of makeCalls()) expect((await call).status).toBe(401);
    expect(await prisma.problem.count({ where: { id: problem.id } })).toBe(1);
  });
});

describe('admin problem CRUD', () => {
  it('POST creates a problem (201) with tags, author and defaults', async () => {
    const created = await createViaApi({
      referenceLanguage: 'PYTHON',
      referenceSolution: 'print(42)\n',
    });
    expect(created).toMatchObject({
      difficulty: 'MEDIUM',
      timeLimitMs: 2000,
      memoryLimitMb: 128,
      checker: 'TOKENS',
      floatTolerance: null,
      isPublished: false,
      tags: ['greedy', 'math'],
      referenceLanguage: 'PYTHON',
      referenceSolution: 'print(42)\n',
      testCount: 0,
      sampleCount: 0,
      submissionCount: 0,
      acceptedCount: 0,
    });
    const row = await prisma.problem.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.authorId).toBe(admin.id);
  });

  it('POST rejects a duplicate slug with 409 and invalid bodies with 400', async () => {
    const created = await createViaApi();
    const dup = await request(app)
      .post('/api/admin/problems')
      .set(asAdmin())
      .send(body({ slug: created.slug }));
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('CONFLICT');
    const floatWithoutTolerance = await request(app)
      .post('/api/admin/problems')
      .set(asAdmin())
      .send(body({ checker: 'FLOAT' }));
    expect(floatWithoutTolerance.status).toBe(400);
    const badSlug = await request(app)
      .post('/api/admin/problems')
      .set(asAdmin())
      .send(body({ slug: 'Bad Slug' }));
    expect(badSlug.status).toBe(400);
  });

  it('GET / lists unpublished problems too, with search and counts', async () => {
    const draft = await createViaApi({ title: `Needle ${uniqueSuffix()}` });
    const published = await createProblem(prisma);
    const res = await request(app)
      .get('/api/admin/problems')
      .query({ search: draft.title.toUpperCase() })
      .set(asAdmin());
    expect(res.status).toBe(200);
    const page = AdminProblemPageSchema.parse(res.body);
    expect(page.items.map((p) => p.id)).toEqual([draft.id]);
    expect(page.items[0]).toMatchObject({ isPublished: false, testCount: 0, hasReference: false });

    const bySlug = AdminProblemPageSchema.parse(
      (
        await request(app)
          .get('/api/admin/problems')
          .query({ search: published.slug })
          .set(asAdmin())
      ).body,
    );
    expect(bySlug.items[0]).toMatchObject({ id: published.id, testCount: 5, isPublished: true });

    const all = AdminProblemPageSchema.parse(
      (await request(app).get('/api/admin/problems').query({ pageSize: '100' }).set(asAdmin()))
        .body,
    );
    expect(all.items.map((p) => p.id)).toEqual(expect.arrayContaining([draft.id, published.id]));
  });

  it('GET /:id returns the problem with test and sample counts; 404 when unknown', async () => {
    const problem = await createProblem(prisma, { tags: ['zeta', 'alpha'] });
    const res = await request(app).get(`/api/admin/problems/${problem.id}`).set(asAdmin());
    expect(res.status).toBe(200);
    expect(AdminProblemSchema.parse(res.body)).toMatchObject({
      id: problem.id,
      slug: problem.slug,
      tags: ['alpha', 'zeta'],
      testCount: 5,
      sampleCount: 2,
      referenceSolution: null,
    });
    expect((await request(app).get('/api/admin/problems/missing-id').set(asAdmin())).status).toBe(
      404,
    );
  });

  it('PUT replaces fields and tags, keeps the reference when omitted and clears it with null', async () => {
    const created = await createViaApi({
      referenceLanguage: 'CPP',
      referenceSolution: 'int main(){}',
    });
    await request(app)
      .post(`/api/admin/problems/${created.id}/tests`)
      .set(asAdmin())
      .send({ input: '1 2\n', expectedOutput: '3\n' })
      .expect(201);
    const put = await request(app)
      .put(`/api/admin/problems/${created.id}`)
      .set(asAdmin())
      .send(
        body({
          slug: created.slug,
          title: 'Renamed',
          tags: ['strings'],
          isPublished: true,
          checker: 'FLOAT',
          floatTolerance: 1e-6,
        }),
      );
    expect(put.status).toBe(200);
    expect(AdminProblemSchema.parse(put.body)).toMatchObject({
      title: 'Renamed',
      tags: ['strings'],
      isPublished: true,
      checker: 'FLOAT',
      floatTolerance: 1e-6,
      referenceLanguage: 'CPP',
      referenceSolution: 'int main(){}',
    });

    const cleared = await request(app)
      .put(`/api/admin/problems/${created.id}`)
      .set(asAdmin())
      .send(body({ slug: created.slug, referenceLanguage: null, referenceSolution: null }));
    expect(cleared.status).toBe(200);
    expect(cleared.body).toMatchObject({
      referenceLanguage: null,
      referenceSolution: null,
      checker: 'TOKENS',
      floatTolerance: null,
      tags: ['greedy', 'math'],
    });
  });

  it('refuses to publish a problem without tests, on create and on PUT (409)', async () => {
    const created = await request(app)
      .post('/api/admin/problems')
      .set(asAdmin())
      .send(body({ isPublished: true }));
    expect(created.status).toBe(409);
    expect(created.body.error.code).toBe('CONFLICT');

    const draft = await createViaApi();
    const put = await request(app)
      .put(`/api/admin/problems/${draft.id}`)
      .set(asAdmin())
      .send(body({ slug: draft.slug, isPublished: true }));
    expect(put.status).toBe(409);
    expect((await prisma.problem.findUniqueOrThrow({ where: { id: draft.id } })).isPublished).toBe(
      false,
    );
  });

  it('refuses to delete the last test of a published problem (409) but allows it on a draft', async () => {
    const published = await createProblem(prisma, {
      tests: [{ input: '1\n', expectedOutput: '1\n' }],
    });
    const only = published.testCases[0]!;
    const res = await request(app)
      .delete(`/api/admin/problems/${published.id}/tests/${only.id}`)
      .set(asAdmin());
    expect(res.status).toBe(409);
    expect(await prisma.testCase.count({ where: { problemId: published.id } })).toBe(1);

    const draft = await createProblem(prisma, {
      isPublished: false,
      tests: [{ input: '1\n', expectedOutput: '1\n' }],
    });
    await request(app)
      .delete(`/api/admin/problems/${draft.id}/tests/${draft.testCases[0]!.id}`)
      .set(asAdmin())
      .expect(204);
  });

  it('PUT answers 404 for an unknown id and 409 for a slug taken by another problem', async () => {
    const a = await createViaApi();
    const b = await createViaApi();
    const missing = await request(app)
      .put('/api/admin/problems/missing-id')
      .set(asAdmin())
      .send(body());
    expect(missing.status).toBe(404);
    const taken = await request(app)
      .put(`/api/admin/problems/${a.id}`)
      .set(asAdmin())
      .send(body({ slug: b.slug }));
    expect(taken.status).toBe(409);
  });

  it('DELETE removes the problem (204), then 404', async () => {
    const problem = await createProblem(prisma);
    const res = await request(app).delete(`/api/admin/problems/${problem.id}`).set(asAdmin());
    expect(res.status).toBe(204);
    expect(await prisma.problem.count({ where: { id: problem.id } })).toBe(0);
    expect(await prisma.testCase.count({ where: { problemId: problem.id } })).toBe(0);
    const again = await request(app).delete(`/api/admin/problems/${problem.id}`).set(asAdmin());
    expect(again.status).toBe(404);
  });

  it('DELETE drops the cached scoreboard of every contest that used the problem', async () => {
    const problem = await createProblem(prisma);
    const player = await createUser(prisma);
    const contest = await createContest(prisma, {
      problems: [{ problemId: problem.id, label: 'A' }],
      registrations: [player.id],
    });
    await createSubmission(prisma, {
      userId: player.id,
      problemId: problem.id,
      contestId: contest.id,
      status: 'DONE',
      verdict: 'AC',
    });
    await rebuildScoreboard(contest.id);
    const keys = scoreboardKeys(contest.id);
    expect(await getRedis().exists(keys.rank)).toBe(1);
    const res = await request(app).delete(`/api/admin/problems/${problem.id}`).set(asAdmin());
    expect(res.status).toBe(204);
    expect(await getRedis().exists(keys.rank, keys.rows)).toBe(0);
  });

  it('DELETE refuses (409) a problem of a rated contest and keeps its link and submissions', async () => {
    const problem = await createProblem(prisma);
    const player = await createUser(prisma);
    const contest = await createContest(prisma, {
      startsAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      endsAt: new Date(Date.now() - 60 * 60 * 1000),
      ratedAt: new Date(),
      problems: [{ problemId: problem.id, label: 'A' }],
      registrations: [player.id],
    });
    await createSubmission(prisma, {
      userId: player.id,
      problemId: problem.id,
      contestId: contest.id,
      status: 'DONE',
      verdict: 'AC',
    });
    const res = await request(app).delete(`/api/admin/problems/${problem.id}`).set(asAdmin());
    expect(res.status).toBe(409);
    expect(await prisma.problem.count({ where: { id: problem.id } })).toBe(1);
    expect(await prisma.contestProblem.count({ where: { contestId: contest.id } })).toBe(1);
    expect(await prisma.submission.count({ where: { contestId: contest.id } })).toBe(1);
  });
});

describe('admin test-case CRUD', () => {
  it('GET /:id/tests lists sizes and 256-character previews in ordinal order', async () => {
    const big = 'x'.repeat(1000);
    const accented = String.fromCharCode(0xe9).repeat(10);
    const problem = await createProblem(prisma, {
      tests: [
        { input: '1\n', expectedOutput: '1\n', isSample: true, explanation: 'One.' },
        { input: big, expectedOutput: accented },
      ],
    });
    const res = await request(app).get(`/api/admin/problems/${problem.id}/tests`).set(asAdmin());
    expect(res.status).toBe(200);
    const list = AdminTestListSchema.parse(res.body);
    expect(list.map((t) => t.ordinal)).toEqual([1, 2]);
    expect(list[0]).toMatchObject({
      id: problem.testCases[0]!.id,
      isSample: true,
      explanation: 'One.',
      inputBytes: 2,
      inputPreview: '1\n',
    });
    expect(list[1]).toMatchObject({
      isSample: false,
      explanation: null,
      inputBytes: 1000,
      expectedOutputBytes: 20,
      expectedOutputPreview: accented,
    });
    expect(list[1]!.inputPreview).toHaveLength(256);
    expect(
      (await request(app).get('/api/admin/problems/missing/tests').set(asAdmin())).status,
    ).toBe(404);
  });

  it('GET /:id/tests/:testId returns one full test case', async () => {
    const big = 'y'.repeat(5000);
    const problem = await createProblem(prisma, {
      tests: [{ input: big, expectedOutput: 'ok\n' }],
    });
    const test = problem.testCases[0]!;
    const res = await request(app)
      .get(`/api/admin/problems/${problem.id}/tests/${test.id}`)
      .set(asAdmin());
    expect(res.status).toBe(200);
    expect(AdminTestCaseSchema.parse(res.body)).toEqual({
      id: test.id,
      problemId: problem.id,
      ordinal: 1,
      input: big,
      expectedOutput: 'ok\n',
      isSample: false,
      explanation: null,
    });
    const other = await createProblem(prisma);
    const wrongProblem = await request(app)
      .get(`/api/admin/problems/${other.id}/tests/${test.id}`)
      .set(asAdmin());
    expect(wrongProblem.status).toBe(404);
  });

  it('POST appends after the last ordinal, or uses the given one (409 when taken)', async () => {
    const problem = await createProblem(prisma);
    const appended = await request(app)
      .post(`/api/admin/problems/${problem.id}/tests`)
      .set(asAdmin())
      .send({ input: '2 2\n', expectedOutput: '4\n' });
    expect(appended.status).toBe(201);
    expect(AdminTestCaseSchema.parse(appended.body)).toMatchObject({
      problemId: problem.id,
      ordinal: 6,
      isSample: false,
      explanation: null,
    });
    const placed = await request(app)
      .post(`/api/admin/problems/${problem.id}/tests`)
      .set(asAdmin())
      .send({ input: '3\n', expectedOutput: '3\n', ordinal: 10, isSample: true, explanation: 'E' });
    expect(placed.status).toBe(201);
    expect(placed.body).toMatchObject({ ordinal: 10, isSample: true, explanation: 'E' });
    const taken = await request(app)
      .post(`/api/admin/problems/${problem.id}/tests`)
      .set(asAdmin())
      .send({ input: '', expectedOutput: '', ordinal: 1 });
    expect(taken.status).toBe(409);
    const missing = await request(app)
      .post('/api/admin/problems/missing/tests')
      .set(asAdmin())
      .send({ input: '', expectedOutput: '' });
    expect(missing.status).toBe(404);
  });

  it('PUT replaces a test case (ordinal kept when omitted), 404 for a foreign test, 409 for a taken ordinal', async () => {
    const problem = await createProblem(prisma);
    const [first, second] = problem.testCases;
    const res = await request(app)
      .put(`/api/admin/problems/${problem.id}/tests/${second!.id}`)
      .set(asAdmin())
      .send({ input: 'new\n', expectedOutput: 'out\n', isSample: false });
    expect(res.status).toBe(200);
    expect(AdminTestCaseSchema.parse(res.body)).toMatchObject({
      id: second!.id,
      ordinal: 2,
      input: 'new\n',
      expectedOutput: 'out\n',
      isSample: false,
      explanation: null,
    });
    const taken = await request(app)
      .put(`/api/admin/problems/${problem.id}/tests/${second!.id}`)
      .set(asAdmin())
      .send({ input: 'x', expectedOutput: 'y', ordinal: first!.ordinal });
    expect(taken.status).toBe(409);
    const other = await createProblem(prisma);
    const foreign = await request(app)
      .put(`/api/admin/problems/${other.id}/tests/${first!.id}`)
      .set(asAdmin())
      .send({ input: 'x', expectedOutput: 'y' });
    expect(foreign.status).toBe(404);
  });

  it('DELETE removes one test case (204), then 404', async () => {
    const problem = await createProblem(prisma);
    const test = problem.testCases[4]!;
    const path = `/api/admin/problems/${problem.id}/tests/${test.id}`;
    expect((await request(app).delete(path).set(asAdmin())).status).toBe(204);
    expect(await prisma.testCase.count({ where: { problemId: problem.id } })).toBe(4);
    expect((await request(app).delete(path).set(asAdmin())).status).toBe(404);
  });

  it('bulk appends after the last ordinal, or replaces every test', async () => {
    const problem = await createProblem(prisma);
    const tests = [
      { input: 'a\n', expectedOutput: 'A\n', isSample: true, explanation: 'first' },
      { input: 'b\n', expectedOutput: 'B\n' },
    ];
    const appended = await request(app)
      .post(`/api/admin/problems/${problem.id}/tests/bulk`)
      .set(asAdmin())
      .send({ tests });
    expect(appended.status).toBe(200);
    expect(BulkTestsResponseSchema.parse(appended.body)).toEqual({ created: 2, total: 7 });
    const afterAppend = await prisma.testCase.findMany({
      where: { problemId: problem.id },
      orderBy: { ordinal: 'asc' },
    });
    expect(afterAppend.map((t) => t.ordinal)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(afterAppend[5]).toMatchObject({ input: 'a\n', isSample: true, explanation: 'first' });

    const replaced = await request(app)
      .post(`/api/admin/problems/${problem.id}/tests/bulk`)
      .set(asAdmin())
      .send({ tests, replace: true });
    expect(replaced.status).toBe(200);
    expect(replaced.body).toEqual({ created: 2, total: 2 });
    const afterReplace = await prisma.testCase.findMany({
      where: { problemId: problem.id },
      orderBy: { ordinal: 'asc' },
    });
    expect(afterReplace.map((t) => [t.ordinal, t.input])).toEqual([
      [1, 'a\n'],
      [2, 'b\n'],
    ]);
  });

  it('bulk accepts bodies over 1 MB (20 MB parser) and answers 404 for an unknown problem', async () => {
    const problem = await createProblem(prisma, { tests: [] });
    const large = 'z'.repeat(2 * 1024 * 1024);
    const res = await request(app)
      .post(`/api/admin/problems/${problem.id}/tests/bulk`)
      .set(asAdmin())
      .send({ tests: [{ input: large, expectedOutput: '1\n' }], replace: true });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ created: 1, total: 1 });
    const missing = await request(app)
      .post('/api/admin/problems/missing/tests/bulk')
      .set(asAdmin())
      .send({ tests: [{ input: '1', expectedOutput: '1' }] });
    expect(missing.status).toBe(404);
  });
});
