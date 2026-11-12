import {
  PlagiarismCreatedResponseSchema,
  PlagiarismReportDetailSchema,
  PlagiarismReportListSchema,
} from '@arbiter/shared';
import type { PrismaClient, User } from '@prisma/client';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetTables, setupTestDatabase } from '../../../test/db';
import {
  authHeader,
  createContest,
  createProblem,
  createSubmission,
  createUser,
} from '../../../test/factories';
import { createApp } from '../../app';
import { enqueuePlagiarism } from '../../judge/queue';
import {
  CPP_ORIGINAL,
  CPP_RENAMED_REFORMATTED,
  CPP_UNRELATED,
} from '../plagiarism/samples.fixture';
import { MAX_DETAIL_PAIRS } from '../plagiarism/admin';
import { runPlagiarismReport } from '../plagiarism/service';

vi.mock('../../judge/queue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../judge/queue')>()),
  enqueuePlagiarism: vi.fn(async () => undefined),
}));

const app = createApp({ rateLimits: false });
let prisma: PrismaClient;
let admin: User;
let user: User;

beforeAll(async () => {
  prisma = await setupTestDatabase();
  await resetTables(prisma);
  admin = await createUser(prisma, { role: 'ADMIN' });
  user = await createUser(prisma);
});

beforeEach(() => {
  vi.mocked(enqueuePlagiarism).mockClear();
  vi.mocked(enqueuePlagiarism).mockImplementation(async () => undefined);
});

async function contestWithCopies() {
  const problem = await createProblem(prisma);
  const [alice, bob, carol] = [
    await createUser(prisma),
    await createUser(prisma),
    await createUser(prisma),
  ];
  const contest = await createContest(prisma, {
    problems: [{ problemId: problem.id, label: 'A' }],
    registrations: [alice.id, bob.id, carol.id],
  });
  const sub = (userId: string, sourceCode: string, minutesAgo: number) =>
    createSubmission(prisma, {
      userId,
      problemId: problem.id,
      contestId: contest.id,
      language: 'CPP',
      sourceCode,
      status: 'DONE',
      verdict: 'AC',
      createdAt: new Date(Date.now() - minutesAgo * 60_000),
    });
  const a = await sub(alice.id, CPP_ORIGINAL, 30);
  const b = await sub(bob.id, CPP_RENAMED_REFORMATTED, 20);
  await sub(carol.id, CPP_UNRELATED, 10);
  return { problem, contest, alice, bob, a, b };
}

describe('admin plagiarism routes', () => {
  it('USER gets 403 and guests 401', async () => {
    const contest = await createContest(prisma);
    const calls = [
      () => request(app).post('/api/admin/plagiarism').send({ contestId: contest.id }),
      () => request(app).get('/api/admin/plagiarism'),
      () => request(app).get('/api/admin/plagiarism/some-id'),
    ];
    for (const call of calls) {
      expect((await call()).status).toBe(401);
      expect((await call().set(authHeader(user))).status).toBe(403);
    }
    expect(enqueuePlagiarism).not.toHaveBeenCalled();
  });

  it('POST creates a PENDING report, enqueues it and answers 202 {reportId}', async () => {
    const { contest, problem } = await contestWithCopies();
    const res = await request(app)
      .post('/api/admin/plagiarism')
      .set(authHeader(admin))
      .send({ contestId: contest.id, problemId: problem.id, threshold: 0.8 });
    expect(res.status).toBe(202);
    const { reportId } = PlagiarismCreatedResponseSchema.parse(res.body);
    expect(enqueuePlagiarism).toHaveBeenCalledWith(reportId);
    const report = await prisma.plagiarismReport.findUniqueOrThrow({ where: { id: reportId } });
    expect(report).toMatchObject({
      contestId: contest.id,
      problemId: problem.id,
      threshold: 0.8,
      status: 'PENDING',
    });

    const defaults = await request(app)
      .post('/api/admin/plagiarism')
      .set(authHeader(admin))
      .send({ contestId: contest.id });
    expect(defaults.status).toBe(202);
    const created = await prisma.plagiarismReport.findUniqueOrThrow({
      where: { id: defaults.body.reportId },
    });
    expect(created).toMatchObject({ threshold: 0.6, problemId: null });
  });

  it('POST: 404 for an unknown contest or a problem outside the contest, 400 for a bad threshold', async () => {
    const contest = await createContest(prisma);
    const outside = await createProblem(prisma);
    const missing = await request(app)
      .post('/api/admin/plagiarism')
      .set(authHeader(admin))
      .send({ contestId: 'no-such-contest' });
    expect(missing.status).toBe(404);
    const notInContest = await request(app)
      .post('/api/admin/plagiarism')
      .set(authHeader(admin))
      .send({ contestId: contest.id, problemId: outside.id });
    expect(notInContest.status).toBe(404);
    const bad = await request(app)
      .post('/api/admin/plagiarism')
      .set(authHeader(admin))
      .send({ contestId: contest.id, threshold: 1.5 });
    expect(bad.status).toBe(400);
    expect(enqueuePlagiarism).not.toHaveBeenCalled();
  });

  it('POST marks the report FAILED when the queue is unavailable', async () => {
    vi.mocked(enqueuePlagiarism).mockRejectedValueOnce(new Error('redis down'));
    const contest = await createContest(prisma);
    const res = await request(app)
      .post('/api/admin/plagiarism')
      .set(authHeader(admin))
      .send({ contestId: contest.id });
    expect(res.status).toBe(500);
    const report = await prisma.plagiarismReport.findFirstOrThrow({
      where: { contestId: contest.id },
    });
    expect(report.status).toBe('FAILED');
    expect(report.error).toMatch(/redis down/);
  });

  it('GET lists reports newest first, filtered by contestId, with pair counts', async () => {
    const { contest } = await contestWithCopies();
    const older = await prisma.plagiarismReport.create({
      data: { contestId: contest.id, createdAt: new Date(Date.now() - 60_000) },
    });
    await runPlagiarismReport(older.id);
    const newer = await prisma.plagiarismReport.create({ data: { contestId: contest.id } });
    const other = await createContest(prisma);
    await prisma.plagiarismReport.create({ data: { contestId: other.id } });

    const res = await request(app)
      .get('/api/admin/plagiarism')
      .query({ contestId: contest.id })
      .set(authHeader(admin));
    expect(res.status).toBe(200);
    const list = PlagiarismReportListSchema.parse(res.body);
    expect(list.map((r) => r.id)).toEqual([newer.id, older.id]);
    expect(list[1]).toMatchObject({
      contestSlug: contest.slug,
      contestTitle: contest.title,
      status: 'DONE',
      pairCount: 1,
      threshold: 0.6,
    });
    expect(list[0]).toMatchObject({ status: 'PENDING', pairCount: 0, finishedAt: null });

    const all = PlagiarismReportListSchema.parse(
      (await request(app).get('/api/admin/plagiarism').set(authHeader(admin))).body,
    );
    expect(all.length).toBeGreaterThanOrEqual(3);
  });

  it('GET /:id returns the pairs with both sources and matched lines; 404 when unknown', async () => {
    const { contest, problem, alice, bob, a, b } = await contestWithCopies();
    const report = await prisma.plagiarismReport.create({ data: { contestId: contest.id } });
    await runPlagiarismReport(report.id);

    const res = await request(app).get(`/api/admin/plagiarism/${report.id}`).set(authHeader(admin));
    expect(res.status).toBe(200);
    const detail = PlagiarismReportDetailSchema.parse(res.body);
    expect(detail).toMatchObject({ id: report.id, status: 'DONE', pairCount: 1 });
    expect(detail.pairs).toHaveLength(1);
    const [pair] = detail.pairs;
    expect(pair).toMatchObject({
      problemId: problem.id,
      problemSlug: problem.slug,
      problemTitle: problem.title,
      a: {
        submissionId: a.id,
        username: alice.username,
        language: 'CPP',
        sourceCode: CPP_ORIGINAL,
      },
      b: { submissionId: b.id, username: bob.username, sourceCode: CPP_RENAMED_REFORMATTED },
    });
    expect(pair.similarity).toBeGreaterThanOrEqual(0.9);
    expect(pair.a.matchedLines.length).toBeGreaterThan(5);
    expect(pair.b.matchedLines.length).toBeGreaterThan(5);

    const missing = await request(app)
      .get('/api/admin/plagiarism/no-such-report')
      .set(authHeader(admin));
    expect(missing.status).toBe(404);
  });

  it('GET /:id caps the pairs at the top MAX_DETAIL_PAIRS by similarity; deleted pairs do not use up the cap', async () => {
    const { contest, problem, a, b } = await contestWithCopies();
    const report = await prisma.plagiarismReport.create({
      data: { contestId: contest.id, status: 'DONE' },
    });
    const total = MAX_DETAIL_PAIRS + 5;
    const pair = (similarity: number, submissionBId: string) => ({
      reportId: report.id,
      problemId: problem.id,
      submissionAId: a.id,
      submissionBId,
      similarity,
      matchedLinesA: [1],
      matchedLinesB: [1],
    });
    await prisma.plagiarismPair.createMany({
      data: [
        pair(0.99, 'deleted-submission'),
        ...Array.from({ length: total }, (_, i) => pair(0.5 + i / (total * 4), b.id)),
      ],
    });
    const res = await request(app).get(`/api/admin/plagiarism/${report.id}`).set(authHeader(admin));
    expect(res.status).toBe(200);
    const detail = PlagiarismReportDetailSchema.parse(res.body);
    expect(detail.pairCount).toBe(total + 1);
    expect(detail.pairs).toHaveLength(MAX_DETAIL_PAIRS);
    const scores = detail.pairs.map((p) => p.similarity);
    expect(scores).toEqual([...scores].sort((x, y) => y - x));
    expect(scores[0]).toBeCloseTo(0.5 + (total - 1) / (total * 4), 10);
  });

  it('GET /:id reads a bounded number of pair rows however many are stored', async () => {
    const { contest, problem, a, b } = await contestWithCopies();
    const report = await prisma.plagiarismReport.create({
      data: { contestId: contest.id, status: 'DONE' },
    });
    const total = MAX_DETAIL_PAIRS * 5;
    const pair = (similarity: number, submissionBId: string) => ({
      reportId: report.id,
      problemId: problem.id,
      submissionAId: a.id,
      submissionBId,
      similarity,
      matchedLinesA: [1],
      matchedLinesB: [1],
    });
    // Three deleted pairs at the top force one refill; the kept pairs are the next 200 by score.
    await prisma.plagiarismPair.createMany({
      data: [
        ...[0.999, 0.998, 0.997].map((s) => pair(s, 'deleted-submission')),
        ...Array.from({ length: total }, (_, i) => pair(0.5 + i / (total * 4), b.id)),
      ],
    });
    const rowsRead: number[] = [];
    const findMany = prisma.plagiarismPair.findMany.bind(prisma.plagiarismPair);
    const spy = vi.spyOn(prisma.plagiarismPair, 'findMany').mockImplementation(((
      args: Parameters<typeof findMany>[0],
    ) =>
      findMany(args).then((rows) => {
        rowsRead.push(rows.length);
        return rows;
      })) as never);
    let res;
    try {
      res = await request(app).get(`/api/admin/plagiarism/${report.id}`).set(authHeader(admin));
    } finally {
      spy.mockRestore();
    }
    expect(res.status).toBe(200);
    const detail = PlagiarismReportDetailSchema.parse(res.body);
    expect(detail.pairCount).toBe(total + 3);
    expect(detail.pairs).toHaveLength(MAX_DETAIL_PAIRS);
    expect(detail.pairs.every((p) => p.b.submissionId === b.id)).toBe(true);
    const scores = detail.pairs.map((p) => p.similarity);
    expect(scores[0]).toBeCloseTo(0.5 + (total - 1) / (total * 4), 10);
    expect(scores.at(-1)).toBeCloseTo(0.5 + (total - MAX_DETAIL_PAIRS) / (total * 4), 10);
    const sum = rowsRead.reduce((x, y) => x + y, 0);
    expect(sum).toBeLessThanOrEqual(3 * MAX_DETAIL_PAIRS);
  });
});
