import {
  CreateSubmissionResponseSchema,
  ErrorBodySchema,
  SubmissionDetailSchema,
  SubmissionPageSchema,
  type ScoreRow,
} from '@arbiter/shared';
import type { Contest, PrismaClient, Problem, User } from '@prisma/client';
import request from 'supertest';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
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
import { enqueueSubmission } from '../../judge/queue';
import { clock, HOUR_MS } from '../../lib/time';
import { emitter } from '../../realtime/emitter';
import { recomputeRow } from '../contests/scoreboard';

vi.mock('../../judge/queue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../judge/queue')>()),
  enqueueSubmission: vi.fn(async () => undefined),
}));

const fakeRow: ScoreRow = {
  rank: 1,
  username: 'someone',
  rating: 1200,
  solved: 0,
  penalty: 0,
  cells: [
    { label: 'A', solved: false, attempts: 0, acMinute: null, firstSolve: false, pending: true },
  ],
};

vi.mock('../contests/scoreboard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../contests/scoreboard')>()),
  recomputeRow: vi.fn(async () => fakeRow),
}));

const enqueueMock = vi.mocked(enqueueSubmission);
const recomputeMock = vi.mocked(recomputeRow);

let prisma: PrismaClient;
const app = createApp({ rateLimits: { submissions: false } });
const limitedApp = createApp({ rateLimits: true });
const s = uniqueSuffix();
const CODE = 'a, b = map(int, input().split())\nprint(a + b)\n';

let problem: Problem;
let unpublished: Problem;
let alice: User;
let bob: User;
let admin: User;
let emitSpy: MockInstance<typeof emitter.emitScoreboardRow>;

beforeAll(async () => {
  prisma = await setupTestDatabase();
  await resetTables(prisma);
  problem = await createProblem(prisma, { title: `Sum ${s}` });
  unpublished = await createProblem(prisma, { isPublished: false });
  alice = await createUser(prisma, { username: `Alice_${s}` });
  bob = await createUser(prisma);
  admin = await createUser(prisma, { role: 'ADMIN' });
});

beforeEach(() => {
  enqueueMock.mockClear();
  recomputeMock.mockClear();
  emitSpy = vi.spyOn(emitter, 'emitScoreboardRow').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function submit(user: User | null, body: Record<string, unknown>, target = app) {
  const req = request(target).post('/api/submissions');
  if (user) req.set(authHeader(user));
  return req.send({ language: 'PYTHON', sourceCode: CODE, ...body });
}

describe('POST /api/submissions', () => {
  it('creates a QUEUED practice submission, answers 202 and enqueues it', async () => {
    const res = await submit(alice, { problemSlug: problem.slug });
    expect(res.status).toBe(202);
    const { submission } = CreateSubmissionResponseSchema.parse(res.body);
    expect(submission).toMatchObject({
      problem: { slug: problem.slug, title: problem.title },
      user: { username: alice.username },
      language: 'PYTHON',
      status: 'QUEUED',
      verdict: null,
      testsPassed: 0,
      testsTotal: 5,
      contestSlug: null,
      judgedAt: null,
    });
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    expect(enqueueMock).toHaveBeenCalledWith(submission.id);
    const row = await prisma.submission.findUniqueOrThrow({ where: { id: submission.id } });
    expect(row).toMatchObject({ kind: 'NORMAL', contestId: null, userId: alice.id });
    expect(row.sourceCode).toBe(CODE);
    expect(recomputeMock).not.toHaveBeenCalled();
  });

  it('requires a signed-in user', async () => {
    const res = await submit(null, { problemSlug: problem.slug });
    expect(res.status).toBe(401);
  });

  it('answers 404 for an unknown problem, and for an unpublished one unless admin', async () => {
    expect((await submit(alice, { problemSlug: `nope-${s}` })).status).toBe(404);
    expect((await submit(alice, { problemSlug: unpublished.slug })).status).toBe(404);
    expect((await submit(admin, { problemSlug: unpublished.slug })).status).toBe(202);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
  });

  it('accepts exactly 64 KB of source and rejects one byte more (UTF-8 bytes)', async () => {
    const ok = await submit(alice, { problemSlug: problem.slug, sourceCode: 'x'.repeat(65536) });
    expect(ok.status).toBe(202);
    const tooBig = await submit(alice, {
      problemSlug: problem.slug,
      sourceCode: 'x'.repeat(65537),
    });
    expect(tooBig.status).toBe(400);
    const body = ErrorBodySchema.parse(tooBig.body);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details).toEqual([
      expect.objectContaining({ location: 'body', path: 'sourceCode' }),
    ]);
    // 32769 two-byte characters = 65538 bytes, although only 32769 characters.
    const multiByte = await submit(alice, {
      problemSlug: problem.slug,
      sourceCode: String.fromCharCode(0xe9).repeat(32769),
    });
    expect(multiByte.status).toBe(400);
  });

  it('rejects an unknown language and empty source with 400', async () => {
    expect((await submit(alice, { problemSlug: problem.slug, language: 'RUST' })).status).toBe(400);
    expect((await submit(alice, { problemSlug: problem.slug, sourceCode: '' })).status).toBe(400);
  });

  it('marks the submission FAILED/IE when it cannot be queued', async () => {
    enqueueMock.mockRejectedValueOnce(new Error('redis down'));
    const user = await createUser(prisma);
    const res = await submit(user, { problemSlug: problem.slug });
    expect(res.status).toBe(500);
    const row = await prisma.submission.findFirstOrThrow({ where: { userId: user.id } });
    expect(row).toMatchObject({ status: 'FAILED', verdict: 'IE' });
    expect(row.errorMessage).toContain('redis down');
    expect(row.judgedAt).not.toBeNull();
  });

  it('7th submission in a minute is 429 with Retry-After', async () => {
    const user = await createUser(prisma);
    for (let i = 0; i < 6; i += 1) {
      const res = await submit(user, { problemSlug: problem.slug }, limitedApp);
      expect(res.status).toBe(202);
    }
    const res = await submit(user, { problemSlug: problem.slug }, limitedApp);
    expect(res.status).toBe(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    const body = ErrorBodySchema.parse(res.body);
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.error.details).toEqual({ retryAfterSec: expect.any(Number) });
    expect(enqueueMock).toHaveBeenCalledTimes(6);
    // Another user is not affected.
    expect((await submit(bob, { problemSlug: problem.slug }, limitedApp)).status).toBe(202);
  });
});

describe('POST /api/submissions with contestSlug', () => {
  let contestProblem: Problem;
  let running: Contest;
  let ended: Contest;
  let upcoming: Contest;
  let player: User;

  beforeAll(async () => {
    contestProblem = await createProblem(prisma, { isPublished: false });
    player = await createUser(prisma);
    const problems = [{ problemId: contestProblem.id, label: 'A' }];
    const now = Date.now();
    running = await createContest(prisma, { problems, registrations: [player.id] });
    ended = await createContest(prisma, {
      problems,
      registrations: [player.id],
      startsAt: new Date(now - 3 * HOUR_MS),
      endsAt: new Date(now - HOUR_MS),
    });
    upcoming = await createContest(prisma, {
      problems,
      registrations: [player.id],
      startsAt: new Date(now + HOUR_MS),
      endsAt: new Date(now + 3 * HOUR_MS),
    });
  });

  it('running + registered: a contest submission, scoreboard row recomputed and emitted', async () => {
    const res = await submit(player, {
      problemSlug: contestProblem.slug,
      contestSlug: running.slug,
    });
    expect(res.status).toBe(202);
    const { submission } = CreateSubmissionResponseSchema.parse(res.body);
    expect(submission.contestSlug).toBe(running.slug);
    const row = await prisma.submission.findUniqueOrThrow({ where: { id: submission.id } });
    expect(row.contestId).toBe(running.id);
    expect(enqueueMock).toHaveBeenCalledWith(submission.id);
    expect(recomputeMock).toHaveBeenCalledWith(running.id, player.id);
    expect(emitSpy).toHaveBeenCalledWith(running.id, { contestSlug: running.slug, row: fakeRow });
  });

  it('still answers 202 when the scoreboard update fails', async () => {
    recomputeMock.mockRejectedValueOnce(new Error('scoreboard down'));
    const res = await submit(player, {
      problemSlug: contestProblem.slug,
      contestSlug: running.slug,
    });
    expect(res.status).toBe(202);
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('running + unregistered: 403 and nothing is stored', async () => {
    const outsider = await createUser(prisma);
    const res = await submit(outsider, {
      problemSlug: contestProblem.slug,
      contestSlug: running.slug,
    });
    expect(res.status).toBe(403);
    expect(ErrorBodySchema.parse(res.body).error.code).toBe('FORBIDDEN');
    expect(await prisma.submission.count({ where: { userId: outsider.id } })).toBe(0);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('ended: a practice submission, even on an unpublished problem and unregistered', async () => {
    const outsider = await createUser(prisma);
    const res = await submit(outsider, {
      problemSlug: contestProblem.slug,
      contestSlug: ended.slug,
    });
    expect(res.status).toBe(202);
    expect(res.body.submission.contestSlug).toBeNull();
    const row = await prisma.submission.findFirstOrThrow({ where: { userId: outsider.id } });
    expect(row.contestId).toBeNull();
    expect(recomputeMock).not.toHaveBeenCalled();
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('not started: 403, even when registered', async () => {
    const res = await submit(player, {
      problemSlug: contestProblem.slug,
      contestSlug: upcoming.slug,
    });
    expect(res.status).toBe(403);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('submission after end is practice: at endsAt + 1 ms contestId is null', async () => {
    vi.spyOn(clock, 'now').mockReturnValue(new Date(running.endsAt.getTime() + 1));
    const res = await submit(player, {
      problemSlug: contestProblem.slug,
      contestSlug: running.slug,
    });
    expect(res.status).toBe(202);
    expect(res.body.submission.contestSlug).toBeNull();
    const row = await prisma.submission.findUniqueOrThrow({
      where: { id: res.body.submission.id },
    });
    expect(row.contestId).toBeNull();
  });

  it('at endsAt - 1 ms it is still a contest submission; at endsAt it is practice', async () => {
    const nowSpy = vi.spyOn(clock, 'now');
    nowSpy.mockReturnValue(new Date(running.endsAt.getTime() - 1));
    const before = await submit(player, {
      problemSlug: contestProblem.slug,
      contestSlug: running.slug,
    });
    expect(before.body.submission.contestSlug).toBe(running.slug);
    nowSpy.mockReturnValue(new Date(running.endsAt.getTime()));
    const at = await submit(player, {
      problemSlug: contestProblem.slug,
      contestSlug: running.slug,
    });
    expect(at.body.submission.contestSlug).toBeNull();
  });

  it('answers 404 for an unknown contest or a problem outside the contest', async () => {
    expect(
      (await submit(player, { problemSlug: contestProblem.slug, contestSlug: `nope-${s}` })).status,
    ).toBe(404);
    expect(
      (await submit(player, { problemSlug: problem.slug, contestSlug: running.slug })).status,
    ).toBe(404);
  });

  it('hides an unpublished contest from non-admins', async () => {
    const draft = await createContest(prisma, {
      isPublished: false,
      problems: [{ problemId: contestProblem.id, label: 'A' }],
      registrations: [player.id],
    });
    const res = await submit(player, { problemSlug: contestProblem.slug, contestSlug: draft.slug });
    expect(res.status).toBe(404);
  });
});

describe('submission visibility', () => {
  let vProblem: Problem;
  let contest: Contest;
  let practiceId: string;
  let contestSubId: string;
  let referenceId: string;

  beforeAll(async () => {
    vProblem = await createProblem(prisma);
    contest = await createContest(prisma, {
      problems: [{ problemId: vProblem.id, label: 'A' }],
      registrations: [alice.id],
    });
    const practice = await createSubmission(prisma, {
      userId: alice.id,
      problemId: vProblem.id,
      status: 'DONE',
      verdict: 'WA',
      compileOutput: 'warning: unused',
      errorMessage: 'internal detail',
      testsPassed: 1,
      testsTotal: 5,
      judgedAt: new Date(),
      results: {
        create: [
          { ordinal: 1, verdict: 'AC', timeMs: 5, memoryKb: 900, isSample: true },
          {
            ordinal: 2,
            verdict: 'WA',
            timeMs: 6,
            memoryKb: 901,
            isSample: true,
            outputPreview: '5\n',
            stderrPreview: 'oops',
          },
        ],
      },
    });
    practiceId = practice.id;
    contestSubId = (
      await createSubmission(prisma, {
        userId: alice.id,
        problemId: vProblem.id,
        contestId: contest.id,
      })
    ).id;
    referenceId = (
      await createSubmission(prisma, {
        userId: admin.id,
        problemId: vProblem.id,
        kind: 'REFERENCE',
        status: 'DONE',
        verdict: 'AC',
      })
    ).id;
  });

  function detail(id: string, user: User | null) {
    const req = request(app).get(`/api/submissions/${id}`);
    if (user) req.set(authHeader(user));
    return req;
  }

  async function listIds(query: Record<string, string>, user: User | null) {
    const req = request(app).get('/api/submissions').query(query);
    if (user) req.set(authHeader(user));
    const res = await req;
    expect(res.status).toBe(200);
    return SubmissionPageSchema.parse(res.body).items.map((item) => item.id);
  }

  it("the owner sees source, compile output and the failed sample; others don't", async () => {
    const own = await detail(practiceId, alice);
    expect(own.status).toBe(200);
    const mine = SubmissionDetailSchema.parse(own.body);
    expect(mine.sourceCode).toBe(CODE);
    expect(mine.compileOutput).toBe('warning: unused');
    expect(mine.failedSample).toEqual({
      ordinal: 2,
      input: '10 -4\n',
      expectedOutput: '6\n',
      actualOutput: '5\n',
      stderr: 'oops',
    });
    expect(mine.results.map((r) => [r.ordinal, r.verdict])).toEqual([
      [1, 'AC'],
      [2, 'WA'],
    ]);
    expect(own.body).not.toHaveProperty('errorMessage');

    for (const viewer of [bob, null]) {
      const res = await detail(practiceId, viewer);
      expect(res.status).toBe(200);
      const other = SubmissionDetailSchema.parse(res.body);
      expect(other.sourceCode).toBeNull();
      expect(other.compileOutput).toBeNull();
      expect(other.failedSample).toBeNull();
      expect(other.results).toHaveLength(2);
      expect(res.body).not.toHaveProperty('errorMessage');
    }
  });

  it('admins see the source and the errorMessage', async () => {
    const res = await detail(practiceId, admin);
    const body = SubmissionDetailSchema.parse(res.body);
    expect(body.sourceCode).toBe(CODE);
    expect(body.errorMessage).toBe('internal detail');
  });

  it('answers 404 for an unknown id', async () => {
    expect((await detail(`missing${s}`, alice)).status).toBe(404);
  });

  it('hides contest submissions from others while the contest runs', async () => {
    const query = { problemSlug: vProblem.slug };
    expect(await listIds(query, bob)).not.toContain(contestSubId);
    expect(await listIds(query, null)).not.toContain(contestSubId);
    expect(await listIds(query, bob)).toContain(practiceId);
    expect(await listIds(query, alice)).toContain(contestSubId);
    expect(await listIds(query, admin)).toContain(contestSubId);
    expect((await detail(contestSubId, bob)).status).toBe(404);
    expect((await detail(contestSubId, null)).status).toBe(404);
    const own = await detail(contestSubId, alice);
    expect(own.status).toBe(200);
    expect(own.body.contestSlug).toBe(contest.slug);
  });

  it('shows contest submissions as metadata only after the end', async () => {
    vi.spyOn(clock, 'now').mockReturnValue(new Date(contest.endsAt.getTime() + 1));
    expect(await listIds({ problemSlug: vProblem.slug }, bob)).toContain(contestSubId);
    const res = await detail(contestSubId, bob);
    expect(res.status).toBe(200);
    expect(res.body.sourceCode).toBeNull();
  });

  it('REFERENCE submissions only show through GET /:id for the owner or an admin (R7)', async () => {
    for (const viewer of [admin, alice, null]) {
      expect(await listIds({ problemSlug: vProblem.slug }, viewer)).not.toContain(referenceId);
    }
    expect(await listIds({ mine: 'true' }, admin)).not.toContain(referenceId);
    expect((await detail(referenceId, admin)).status).toBe(200);
    const otherAdmin = await createUser(prisma, { role: 'ADMIN' });
    expect((await detail(referenceId, otherAdmin)).status).toBe(200);
    expect((await detail(referenceId, alice)).status).toBe(404);
    expect((await detail(referenceId, null)).status).toBe(404);
  });
});

describe('GET /api/submissions filters', () => {
  let fProblem: Problem;
  let fUser: User;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    fProblem = await createProblem(prisma);
    fUser = await createUser(prisma, { username: `Filter_${s}` });
    const base = Date.now() - 10_000;
    const specs = [
      { key: 'wa', verdict: 'WA', language: 'PYTHON', userId: fUser.id },
      { key: 'ac', verdict: 'AC', language: 'CPP', userId: fUser.id },
      { key: 'bob', verdict: 'AC', language: 'PYTHON', userId: bob.id },
    ] as const;
    for (const [index, spec] of specs.entries()) {
      const row = await createSubmission(prisma, {
        userId: spec.userId,
        problemId: fProblem.id,
        language: spec.language,
        status: 'DONE',
        verdict: spec.verdict,
        createdAt: new Date(base + index * 1000),
      });
      ids[spec.key] = row.id;
    }
  });

  async function page(query: Record<string, string>, user: User | null = null) {
    const req = request(app).get('/api/submissions').query(query);
    if (user) req.set(authHeader(user));
    const res = await req;
    expect(res.status).toBe(200);
    return SubmissionPageSchema.parse(res.body);
  }

  it('lists newest first and filters by problem', async () => {
    const result = await page({ problemSlug: fProblem.slug });
    expect(result.items.map((i) => i.id)).toEqual([ids.bob, ids.ac, ids.wa]);
    expect(result.total).toBe(3);
    expect(result.items[0]).toMatchObject({
      problem: { slug: fProblem.slug },
      user: { username: bob.username },
      contestSlug: null,
    });
    expect(result.items[0]).not.toHaveProperty('sourceCode');
  });

  it('filters by username case-insensitively, verdict and language (lower-case accepted)', async () => {
    const byUser = await page({
      problemSlug: fProblem.slug,
      username: fUser.username.toUpperCase(),
    });
    expect(byUser.items.map((i) => i.id)).toEqual([ids.ac, ids.wa]);
    const byVerdict = await page({ problemSlug: fProblem.slug, verdict: 'ac' });
    expect(byVerdict.items.map((i) => i.id)).toEqual([ids.bob, ids.ac]);
    const byLanguage = await page({ problemSlug: fProblem.slug, language: 'python' });
    expect(byLanguage.items.map((i) => i.id)).toEqual([ids.bob, ids.wa]);
    expect((await page({ username: `nobody${s}` })).total).toBe(0);
    expect((await page({ problemSlug: `nothing-${s}` })).total).toBe(0);
  });

  it('mine=true lists only the caller; a guest gets 401', async () => {
    const mine = await page({ mine: 'true', problemSlug: fProblem.slug }, fUser);
    expect(mine.items.map((i) => i.id)).toEqual([ids.ac, ids.wa]);
    const all = await page({ mine: 'false', problemSlug: fProblem.slug }, fUser);
    expect(all.total).toBe(3);
    const guest = await request(app).get('/api/submissions').query({ mine: 'true' });
    expect(guest.status).toBe(401);
  });

  it('pages results', async () => {
    const second = await page({ problemSlug: fProblem.slug, pageSize: '2', page: '2' });
    expect(second.items.map((i) => i.id)).toEqual([ids.wa]);
    expect(second).toMatchObject({ total: 3, page: 2, pageSize: 2 });
  });
});
