import {
  ContestDetailSchema,
  ContestListSchema,
  ProblemDetailSchema,
  ScoreboardSchema,
  SubmissionPageSchema,
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
} from '../../../test/factories';
import { createApp } from '../../app';

const HOUR = 60 * 60 * 1000;
const app = createApp({ rateLimits: false });
let prisma: PrismaClient;
let user: User;
let other: User;
let admin: User;

const hoursFromNow = (hours: number) => new Date(Date.now() + hours * HOUR);

beforeAll(async () => {
  prisma = await setupTestDatabase();
  await resetTables(prisma);
  user = await createUser(prisma);
  other = await createUser(prisma);
  admin = await createUser(prisma, { role: 'ADMIN' });
});

describe('GET /api/contests', () => {
  it('filters by status and lists published contests only', async () => {
    const upcoming = await createContest(prisma, {
      startsAt: hoursFromNow(2),
      endsAt: hoursFromNow(4),
      registrations: [user.id],
    });
    const running = await createContest(prisma, { registrations: [user.id, other.id] });
    const past = await createContest(prisma, {
      startsAt: hoursFromNow(-5),
      endsAt: hoursFromNow(-3),
      ratedAt: hoursFromNow(-2),
    });
    const hidden = await createContest(prisma, { isPublished: false });

    const slugsFor = async (status?: string) => {
      const res = await request(app)
        .get('/api/contests')
        .query(status ? { status } : {});
      expect(res.status).toBe(200);
      return ContestListSchema.parse(res.body).map((c) => c.slug);
    };
    const up = await slugsFor('upcoming');
    expect(up).toContain(upcoming.slug);
    expect(up).not.toContain(running.slug);
    expect(up).not.toContain(past.slug);
    const run = await slugsFor('running');
    expect(run).toContain(running.slug);
    expect(run).not.toContain(upcoming.slug);
    expect(run).not.toContain(past.slug);
    const old = await slugsFor('past');
    expect(old).toContain(past.slug);
    expect(old).not.toContain(running.slug);
    const all = await slugsFor();
    expect(all).toEqual(expect.arrayContaining([upcoming.slug, running.slug, past.slug]));
    expect(all).not.toContain(hidden.slug);

    const asUser = await request(app)
      .get('/api/contests')
      .query({ status: 'running' })
      .set(authHeader(user));
    const summary = ContestListSchema.parse(asUser.body).find((c) => c.slug === running.slug);
    expect(summary).toMatchObject({
      status: 'RUNNING',
      isRegistered: true,
      participantCount: 2,
      problemCount: 0,
      rated: false,
    });
    const pastSummary = ContestListSchema.parse(
      (await request(app).get('/api/contests').query({ status: 'past' })).body,
    ).find((c) => c.slug === past.slug);
    expect(pastSummary).toMatchObject({ status: 'ENDED', rated: true, isRegistered: false });
  });

  it('rejects an unknown status', async () => {
    const res = await request(app).get('/api/contests').query({ status: 'later' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/contests/:slug', () => {
  it('hides problems before the start from non-admins but not from admins', async () => {
    const problem = await createProblem(prisma);
    const contest = await createContest(prisma, {
      startsAt: hoursFromNow(1),
      endsAt: hoursFromNow(3),
      problems: [{ problemId: problem.id, label: 'A' }],
    });
    const guest = await request(app).get(`/api/contests/${contest.slug}`);
    expect(guest.status).toBe(200);
    const detail = ContestDetailSchema.parse(guest.body);
    expect(detail).toMatchObject({ status: 'UPCOMING', problems: null, problemCount: 1 });

    const asUser = await request(app).get(`/api/contests/${contest.slug}`).set(authHeader(user));
    expect(ContestDetailSchema.parse(asUser.body).problems).toBeNull();

    const asAdmin = await request(app).get(`/api/contests/${contest.slug}`).set(authHeader(admin));
    expect(ContestDetailSchema.parse(asAdmin.body).problems).toEqual([
      {
        label: 'A',
        title: problem.title,
        slug: problem.slug,
        solvedCount: 0,
        attemptedCount: 0,
        userStatus: null,
      },
    ]);
  });

  it('includes serverTime (ISO, the server clock) and the contest fields', async () => {
    const contest = await createContest(prisma, { penaltyMinutes: 15, descriptionMd: '# Hi' });
    const before = Date.now();
    const res = await request(app).get(`/api/contests/${contest.slug}`);
    const after = Date.now();
    const detail = ContestDetailSchema.parse(res.body);
    const serverTime = Date.parse(detail.serverTime);
    expect(serverTime).toBeGreaterThanOrEqual(before);
    expect(serverTime).toBeLessThanOrEqual(after);
    expect(detail).toMatchObject({
      slug: contest.slug,
      title: contest.title,
      descriptionMd: '# Hi',
      penaltyMinutes: 15,
      startsAt: contest.startsAt.toISOString(),
      endsAt: contest.endsAt.toISOString(),
      status: 'RUNNING',
    });
  });

  it('counts solvers and attempters per problem and shows the viewer status', async () => {
    const [a, b] = [await createProblem(prisma), await createProblem(prisma)];
    const contest = await createContest(prisma, {
      problems: [
        { problemId: a.id, label: 'A' },
        { problemId: b.id, label: 'B' },
      ],
      registrations: [user.id, other.id],
    });
    const base = { contestId: contest.id, status: 'DONE' as const };
    await createSubmission(prisma, { ...base, userId: user.id, problemId: a.id, verdict: 'WA' });
    await createSubmission(prisma, { ...base, userId: user.id, problemId: a.id, verdict: 'AC' });
    await createSubmission(prisma, { ...base, userId: other.id, problemId: a.id, verdict: 'WA' });
    await createSubmission(prisma, { ...base, userId: user.id, problemId: b.id, verdict: 'TLE' });
    await createSubmission(prisma, {
      ...base,
      userId: admin.id,
      problemId: b.id,
      verdict: 'AC',
      kind: 'REFERENCE',
    });

    const res = await request(app).get(`/api/contests/${contest.slug}`).set(authHeader(user));
    const problems = ContestDetailSchema.parse(res.body).problems;
    expect(problems).toEqual([
      expect.objectContaining({
        label: 'A',
        solvedCount: 1,
        attemptedCount: 2,
        userStatus: 'SOLVED',
      }),
      expect.objectContaining({
        label: 'B',
        solvedCount: 0,
        attemptedCount: 1,
        userStatus: 'ATTEMPTED',
      }),
    ]);
  });

  it('404 for unknown and unpublished contests (admins can open unpublished ones)', async () => {
    expect((await request(app).get('/api/contests/no-such-contest')).status).toBe(404);
    const hidden = await createContest(prisma, { isPublished: false });
    expect((await request(app).get(`/api/contests/${hidden.slug}`)).status).toBe(404);
    const asAdmin = await request(app).get(`/api/contests/${hidden.slug}`).set(authHeader(admin));
    expect(asAdmin.status).toBe(200);
  });
});

describe('POST /api/contests/:slug/register', () => {
  it('204 then 409 when already registered', async () => {
    const contest = await createContest(prisma);
    const first = await request(app)
      .post(`/api/contests/${contest.slug}/register`)
      .set(authHeader(user));
    expect(first.status).toBe(204);
    const again = await request(app)
      .post(`/api/contests/${contest.slug}/register`)
      .set(authHeader(user));
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('CONFLICT');
    const registration = await prisma.contestRegistration.findUnique({
      where: { contestId_userId: { contestId: contest.id, userId: user.id } },
    });
    expect(registration).not.toBeNull();
  });

  it('allows registration before the start', async () => {
    const contest = await createContest(prisma, {
      startsAt: hoursFromNow(1),
      endsAt: hoursFromNow(2),
    });
    const res = await request(app)
      .post(`/api/contests/${contest.slug}/register`)
      .set(authHeader(other));
    expect(res.status).toBe(204);
  });

  it('register after the end is 403', async () => {
    const contest = await createContest(prisma, {
      startsAt: hoursFromNow(-3),
      endsAt: new Date(Date.now() - 1),
    });
    const res = await request(app)
      .post(`/api/contests/${contest.slug}/register`)
      .set(authHeader(user));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('401 for guests and 404 for unknown or unpublished contests', async () => {
    const contest = await createContest(prisma);
    expect((await request(app).post(`/api/contests/${contest.slug}/register`)).status).toBe(401);
    const missing = await request(app).post('/api/contests/nope-x/register').set(authHeader(user));
    expect(missing.status).toBe(404);
    const hidden = await createContest(prisma, { isPublished: false });
    const res = await request(app)
      .post(`/api/contests/${hidden.slug}/register`)
      .set(authHeader(user));
    expect(res.status).toBe(404);
  });
});

describe('GET /api/contests/:slug/problems/:label', () => {
  it('returns the problem by label with samples only and the contest link', async () => {
    const problem = await createProblem(prisma, { isPublished: false });
    const contest = await createContest(prisma, {
      problems: [{ problemId: problem.id, label: 'A' }],
    });
    const res = await request(app).get(`/api/contests/${contest.slug}/problems/A`);
    expect(res.status).toBe(200);
    const detail = ProblemDetailSchema.parse(res.body);
    expect(detail).toMatchObject({
      slug: problem.slug,
      title: problem.title,
      contest: { slug: contest.slug, label: 'A' },
    });
    expect(detail.samples.map((s) => s.ordinal)).toEqual([1, 2]);
    // Lower-case labels resolve too.
    expect((await request(app).get(`/api/contests/${contest.slug}/problems/a`)).status).toBe(200);
  });

  it('404 before the start for non-admins, for unknown labels and unknown contests', async () => {
    const problem = await createProblem(prisma);
    const contest = await createContest(prisma, {
      startsAt: hoursFromNow(1),
      endsAt: hoursFromNow(2),
      problems: [{ problemId: problem.id, label: 'A' }],
    });
    const path = `/api/contests/${contest.slug}/problems/A`;
    expect((await request(app).get(path)).status).toBe(404);
    expect((await request(app).get(path).set(authHeader(user))).status).toBe(404);
    expect((await request(app).get(path).set(authHeader(admin))).status).toBe(200);
    const running = await createContest(prisma, {
      problems: [{ problemId: problem.id, label: 'A' }],
    });
    expect((await request(app).get(`/api/contests/${running.slug}/problems/B`)).status).toBe(404);
    expect((await request(app).get('/api/contests/nope-x/problems/A')).status).toBe(404);
  });

  it('shows the viewer status from their contest submissions', async () => {
    const problem = await createProblem(prisma);
    const contest = await createContest(prisma, {
      problems: [{ problemId: problem.id, label: 'A' }],
      registrations: [user.id],
    });
    await createSubmission(prisma, {
      userId: user.id,
      problemId: problem.id,
      contestId: contest.id,
      status: 'DONE',
      verdict: 'WA',
    });
    const res = await request(app)
      .get(`/api/contests/${contest.slug}/problems/A`)
      .set(authHeader(user));
    expect(ProblemDetailSchema.parse(res.body).userStatus).toBe('ATTEMPTED');
  });
});

describe('GET /api/contests/:slug/scoreboard', () => {
  it('serves the scoreboard page and 404 for unknown or unpublished contests', async () => {
    const problem = await createProblem(prisma);
    const contest = await createContest(prisma, {
      problems: [{ problemId: problem.id, label: 'A' }],
      registrations: [user.id],
    });
    await createSubmission(prisma, {
      userId: user.id,
      problemId: problem.id,
      contestId: contest.id,
      status: 'DONE',
      verdict: 'AC',
    });
    const res = await request(app)
      .get(`/api/contests/${contest.slug}/scoreboard`)
      .query({ page: 1, pageSize: 10 });
    expect(res.status).toBe(200);
    const board = ScoreboardSchema.parse(res.body);
    expect(board).toMatchObject({ contestSlug: contest.slug, total: 1, page: 1, pageSize: 10 });
    expect(board.rows[0]).toMatchObject({ rank: 1, username: user.username, solved: 1 });
    expect((await request(app).get('/api/contests/nope-x/scoreboard')).status).toBe(404);
    const hidden = await createContest(prisma, { isPublished: false });
    expect((await request(app).get(`/api/contests/${hidden.slug}/scoreboard`)).status).toBe(404);
  });
});

describe('GET /api/contests/:slug/submissions', () => {
  async function contestWithSubmissions(endsAt: Date) {
    const problem = await createProblem(prisma);
    const contest = await createContest(prisma, {
      startsAt: hoursFromNow(-2),
      endsAt,
      problems: [{ problemId: problem.id, label: 'A' }],
      registrations: [user.id, other.id],
    });
    const mine = await createSubmission(prisma, {
      userId: user.id,
      problemId: problem.id,
      contestId: contest.id,
      createdAt: hoursFromNow(-1.5),
    });
    const theirs = await createSubmission(prisma, {
      userId: other.id,
      problemId: problem.id,
      contestId: contest.id,
      createdAt: hoursFromNow(-1),
    });
    await createSubmission(prisma, {
      userId: admin.id,
      problemId: problem.id,
      contestId: contest.id,
      kind: 'REFERENCE',
    });
    await createSubmission(prisma, { userId: user.id, problemId: problem.id }); // practice
    return { contest, mine, theirs };
  }

  it("hides other users' submissions while the contest runs", async () => {
    const { contest, mine } = await contestWithSubmissions(hoursFromNow(1));
    const res = await request(app)
      .get(`/api/contests/${contest.slug}/submissions`)
      .set(authHeader(user));
    expect(res.status).toBe(200);
    const page = SubmissionPageSchema.parse(res.body);
    expect(page.items.map((s) => s.id)).toEqual([mine.id]);
    expect(page.items[0]).toMatchObject({
      contestSlug: contest.slug,
      user: { username: user.username },
    });
    expect(page.total).toBe(1);

    const asAdmin = await request(app)
      .get(`/api/contests/${contest.slug}/submissions`)
      .set(authHeader(admin));
    expect(SubmissionPageSchema.parse(asAdmin.body).total).toBe(2);
  });

  it('shows everyone after the end, newest first; mine=true filters to the viewer', async () => {
    const { contest, mine, theirs } = await contestWithSubmissions(hoursFromNow(-0.5));
    const all = await request(app)
      .get(`/api/contests/${contest.slug}/submissions`)
      .set(authHeader(user));
    expect(SubmissionPageSchema.parse(all.body).items.map((s) => s.id)).toEqual([
      theirs.id,
      mine.id,
    ]);
    const own = await request(app)
      .get(`/api/contests/${contest.slug}/submissions`)
      .query({ mine: 'true', pageSize: 1 })
      .set(authHeader(user));
    const page = SubmissionPageSchema.parse(own.body);
    expect(page).toMatchObject({ total: 1, page: 1, pageSize: 1 });
    expect(page.items.map((s) => s.id)).toEqual([mine.id]);
  });

  it('401 for guests and 404 for unknown contests', async () => {
    const contest = await createContest(prisma);
    expect((await request(app).get(`/api/contests/${contest.slug}/submissions`)).status).toBe(401);
    const res = await request(app).get('/api/contests/nope-x/submissions').set(authHeader(user));
    expect(res.status).toBe(404);
  });
});
