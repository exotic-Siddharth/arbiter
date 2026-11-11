import {
  AdminContestPageSchema,
  AdminContestSchema,
  RateContestResponseSchema,
  type AdminContestBodyInput,
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

const HOUR = 60 * 60 * 1000;
const app = createApp({ rateLimits: false });
let prisma: PrismaClient;
let admin: User;
let user: User;

const hoursFromNow = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();

function body(overrides: Partial<AdminContestBodyInput> = {}): AdminContestBodyInput {
  return {
    slug: `round-${uniqueSuffix()}`,
    title: 'Weekly Round',
    descriptionMd: 'Good luck.',
    startsAt: hoursFromNow(24),
    endsAt: hoursFromNow(26),
    isPublished: true,
    penaltyMinutes: 10,
    problems: [],
    ...overrides,
  };
}

beforeAll(async () => {
  prisma = await setupTestDatabase();
  await resetTables(prisma);
  admin = await createUser(prisma, { role: 'ADMIN' });
  user = await createUser(prisma);
});

describe('admin contests RBAC', () => {
  it('USER gets 403 and guests 401 on every admin contest route', async () => {
    const contest = await createContest(prisma);
    const calls = [
      () => request(app).get('/api/admin/contests'),
      () => request(app).post('/api/admin/contests').send(body()),
      () => request(app).get(`/api/admin/contests/${contest.id}`),
      () => request(app).put(`/api/admin/contests/${contest.id}`).send(body()),
      () => request(app).delete(`/api/admin/contests/${contest.id}`),
      () => request(app).post(`/api/admin/contests/${contest.id}/rate`),
    ];
    for (const call of calls) {
      expect((await call()).status).toBe(401);
      expect((await call().set(authHeader(user))).status).toBe(403);
    }
    expect(await prisma.contest.findUnique({ where: { id: contest.id } })).not.toBeNull();
  });
});

describe('admin contest CRUD', () => {
  it('creates a contest with labelled problems in order', async () => {
    const [p1, p2] = [
      await createProblem(prisma),
      await createProblem(prisma, { isPublished: false }),
    ];
    const input = body({
      problems: [
        { problemId: p2.id, label: 'A' },
        { problemId: p1.id, label: 'B' },
      ],
    });
    const res = await request(app).post('/api/admin/contests').set(authHeader(admin)).send(input);
    expect(res.status).toBe(201);
    const contest = AdminContestSchema.parse(res.body);
    expect(contest).toMatchObject({
      slug: input.slug,
      title: 'Weekly Round',
      penaltyMinutes: 10,
      status: 'UPCOMING',
      ratedAt: null,
      participantCount: 0,
      isPublished: true,
    });
    expect(contest.problems).toEqual([
      { problemId: p2.id, label: 'A', ordinal: 1, slug: p2.slug, title: p2.title },
      { problemId: p1.id, label: 'B', ordinal: 2, slug: p1.slug, title: p1.title },
    ]);

    const fetched = await request(app)
      .get(`/api/admin/contests/${contest.id}`)
      .set(authHeader(admin));
    expect(fetched.status).toBe(200);
    expect(AdminContestSchema.parse(fetched.body)).toEqual(contest);
  });

  it('rejects duplicate slugs (409), duplicate labels and unknown problems (400)', async () => {
    const input = body();
    const first = await request(app).post('/api/admin/contests').set(authHeader(admin)).send(input);
    expect(first.status).toBe(201);
    const dup = await request(app).post('/api/admin/contests').set(authHeader(admin)).send(input);
    expect(dup.status).toBe(409);

    const problem = await createProblem(prisma);
    const twice = await request(app)
      .post('/api/admin/contests')
      .set(authHeader(admin))
      .send(
        body({
          problems: [
            { problemId: problem.id, label: 'A' },
            { problemId: (await createProblem(prisma)).id, label: 'A' },
          ],
        }),
      );
    expect(twice.status).toBe(400);

    const unknown = await request(app)
      .post('/api/admin/contests')
      .set(authHeader(admin))
      .send(body({ problems: [{ problemId: 'missing-problem', label: 'A' }] }));
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.details).toEqual([
      expect.objectContaining({ path: 'problems.0.problemId' }),
    ]);
  });

  it('lists every contest (unpublished too) with search and paging', async () => {
    const tag = uniqueSuffix();
    await request(app)
      .post('/api/admin/contests')
      .set(authHeader(admin))
      .send(body({ slug: `hidden-${tag}`, title: `Hidden ${tag}`, isPublished: false }));
    await request(app)
      .post('/api/admin/contests')
      .set(authHeader(admin))
      .send(body({ slug: `shown-${tag}`, title: `Shown ${tag}` }));
    const res = await request(app)
      .get('/api/admin/contests')
      .query({ search: tag, pageSize: 1 })
      .set(authHeader(admin));
    expect(res.status).toBe(200);
    const page = AdminContestPageSchema.parse(res.body);
    expect(page).toMatchObject({ total: 2, page: 1, pageSize: 1 });
    expect(page.items).toHaveLength(1);
    const all = AdminContestPageSchema.parse(
      (await request(app).get('/api/admin/contests').query({ search: tag }).set(authHeader(admin)))
        .body,
    );
    expect(all.items.map((c) => c.isPublished).sort()).toEqual([false, true]);
  });

  it('PUT replaces the fields and the problem list and drops the cached scoreboard', async () => {
    const [p1, p2, p3] = [
      await createProblem(prisma),
      await createProblem(prisma),
      await createProblem(prisma),
    ];
    const contest = await createContest(prisma, {
      problems: [
        { problemId: p1.id, label: 'A' },
        { problemId: p2.id, label: 'B' },
      ],
      registrations: [user.id],
    });
    await createSubmission(prisma, {
      userId: user.id,
      problemId: p1.id,
      contestId: contest.id,
      status: 'DONE',
      verdict: 'AC',
    });
    await rebuildScoreboard(contest.id);
    const keys = scoreboardKeys(contest.id);
    expect(await getRedis().exists(keys.rank)).toBe(1);

    const input = body({
      slug: contest.slug,
      title: 'Renamed',
      startsAt: contest.startsAt.toISOString(),
      endsAt: contest.endsAt.toISOString(),
      problems: [
        { problemId: p3.id, label: 'A' },
        { problemId: p1.id, label: 'C' },
      ],
    });
    const res = await request(app)
      .put(`/api/admin/contests/${contest.id}`)
      .set(authHeader(admin))
      .send(input);
    expect(res.status).toBe(200);
    const updated = AdminContestSchema.parse(res.body);
    expect(updated).toMatchObject({ title: 'Renamed', penaltyMinutes: 10, participantCount: 1 });
    expect(updated.problems.map((p) => [p.label, p.problemId, p.ordinal])).toEqual([
      ['A', p3.id, 1],
      ['C', p1.id, 2],
    ]);
    expect(await getRedis().exists(keys.rank)).toBe(0);
    // The scoreboard is rebuilt with the new labels on the next read.
    const board = await request(app).get(`/api/contests/${contest.slug}/scoreboard`);
    expect(board.body.problems).toEqual([{ label: 'A' }, { label: 'C' }]);
    expect(board.body.rows[0].cells[1]).toMatchObject({ label: 'C', solved: true });
  });

  it('PUT: 404 for unknown ids and 409 when the slug belongs to another contest', async () => {
    const a = await createContest(prisma);
    const b = await createContest(prisma);
    const missing = await request(app)
      .put('/api/admin/contests/no-such-id')
      .set(authHeader(admin))
      .send(body());
    expect(missing.status).toBe(404);
    const taken = await request(app)
      .put(`/api/admin/contests/${b.id}`)
      .set(authHeader(admin))
      .send(body({ slug: a.slug }));
    expect(taken.status).toBe(409);
  });

  it('DELETE answers 204, then 404', async () => {
    const contest = await createContest(prisma);
    const del = await request(app)
      .delete(`/api/admin/contests/${contest.id}`)
      .set(authHeader(admin));
    expect(del.status).toBe(204);
    expect(await prisma.contest.findUnique({ where: { id: contest.id } })).toBeNull();
    const again = await request(app)
      .delete(`/api/admin/contests/${contest.id}`)
      .set(authHeader(admin));
    expect(again.status).toBe(404);
    const get = await request(app).get(`/api/admin/contests/${contest.id}`).set(authHeader(admin));
    expect(get.status).toBe(404);
  });
});

describe('POST /api/admin/contests/:id/rate', () => {
  async function endedContest() {
    const problem = await createProblem(prisma);
    const [winner, middle, loser, idle] = await Promise.all([
      createUser(prisma, { rating: 1500 }),
      createUser(prisma, { rating: 1500 }),
      createUser(prisma, { rating: 1500 }),
      createUser(prisma, { rating: 1500 }),
    ]);
    const startsAt = new Date(Date.now() - 3 * HOUR);
    const contest = await createContest(prisma, {
      startsAt,
      endsAt: new Date(Date.now() - HOUR),
      problems: [{ problemId: problem.id, label: 'A' }],
      registrations: [winner.id, middle.id, loser.id, idle.id],
    });
    const at = (minute: number) => new Date(startsAt.getTime() + minute * 60_000);
    const sub = (userId: string, minute: number, verdict: 'AC' | 'WA') =>
      createSubmission(prisma, {
        userId,
        problemId: problem.id,
        contestId: contest.id,
        status: 'DONE',
        verdict,
        createdAt: at(minute),
      });
    await sub(winner.id, 10, 'AC');
    await sub(middle.id, 30, 'AC');
    await sub(loser.id, 40, 'WA');
    return { contest, winner, middle, loser, idle };
  }

  it('applies pairwise Elo once: RatingChange rows, user ratings and ratedAt', async () => {
    const { contest, winner, middle, loser, idle } = await endedContest();
    const res = await request(app)
      .post(`/api/admin/contests/${contest.id}/rate`)
      .set(authHeader(admin));
    expect(res.status).toBe(200);
    const { changes } = RateContestResponseSchema.parse(res.body);
    expect(changes).toEqual([
      { username: winner.username, oldRating: 1500, newRating: 1532, rank: 1 },
      { username: middle.username, oldRating: 1500, newRating: 1500, rank: 2 },
      { username: loser.username, oldRating: 1500, newRating: 1468, rank: 3 },
    ]);

    const users = await prisma.user.findMany({
      where: { id: { in: [winner.id, middle.id, loser.id, idle.id] } },
    });
    const ratingOf = (id: string) => users.find((u) => u.id === id)?.rating;
    expect(ratingOf(winner.id)).toBe(1532);
    expect(ratingOf(loser.id)).toBe(1468);
    expect(ratingOf(idle.id)).toBe(1500); // registered without submitting: not rated

    const rows = await prisma.ratingChange.findMany({ where: { contestId: contest.id } });
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.userId === winner.id)).toMatchObject({
      oldRating: 1500,
      newRating: 1532,
      rank: 1,
    });
    const after = await prisma.contest.findUniqueOrThrow({ where: { id: contest.id } });
    expect(after.ratedAt).not.toBeNull();

    const again = await request(app)
      .post(`/api/admin/contests/${contest.id}/rate`)
      .set(authHeader(admin));
    expect(again.status).toBe(409);
    expect(await prisma.ratingChange.count({ where: { contestId: contest.id } })).toBe(3);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: winner.id } })).rating).toBe(1532);

    const detail = await request(app)
      .get(`/api/admin/contests/${contest.id}`)
      .set(authHeader(admin));
    expect(detail.body.ratedAt).toBe(after.ratedAt?.toISOString());
  });

  it('409 while contest submissions are still being judged, 200 once they are done', async () => {
    const { contest, winner } = await endedContest();
    const problem = await prisma.contestProblem.findFirstOrThrow({
      where: { contestId: contest.id },
    });
    const late = await createSubmission(prisma, {
      userId: winner.id,
      problemId: problem.problemId,
      contestId: contest.id,
      status: 'QUEUED',
      verdict: null,
    });
    const pending = await request(app)
      .get(`/api/admin/contests/${contest.id}`)
      .set(authHeader(admin));
    expect(pending.body.pendingSubmissions).toBe(1);
    const blocked = await request(app)
      .post(`/api/admin/contests/${contest.id}/rate`)
      .set(authHeader(admin));
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.message).toMatch(/judging/i);
    expect(
      (await prisma.contest.findUniqueOrThrow({ where: { id: contest.id } })).ratedAt,
    ).toBeNull();
    expect(await prisma.ratingChange.count({ where: { contestId: contest.id } })).toBe(0);

    await prisma.submission.update({
      where: { id: late.id },
      data: { status: 'DONE', verdict: 'WA' },
    });
    const settled = await request(app)
      .get(`/api/admin/contests/${contest.id}`)
      .set(authHeader(admin));
    expect(settled.body.pendingSubmissions).toBe(0);
    const ok = await request(app)
      .post(`/api/admin/contests/${contest.id}/rate`)
      .set(authHeader(admin));
    expect(ok.status).toBe(200);
  });

  it('409 before the end (running or upcoming) and 404 for unknown ids', async () => {
    const running = await createContest(prisma);
    const res = await request(app)
      .post(`/api/admin/contests/${running.id}/rate`)
      .set(authHeader(admin));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    const upcoming = await createContest(prisma, {
      startsAt: new Date(Date.now() + HOUR),
      endsAt: new Date(Date.now() + 2 * HOUR),
    });
    expect(
      (await request(app).post(`/api/admin/contests/${upcoming.id}/rate`).set(authHeader(admin)))
        .status,
    ).toBe(409);
    expect(
      (await prisma.contest.findUniqueOrThrow({ where: { id: running.id } })).ratedAt,
    ).toBeNull();
    const missing = await request(app)
      .post('/api/admin/contests/no-such-id/rate')
      .set(authHeader(admin));
    expect(missing.status).toBe(404);
  });

  it('rating two contests that share users concurrently keeps every delta (no lost update, no deadlock)', async () => {
    const problem = await createProblem(prisma);
    for (let trial = 0; trial < 4; trial += 1) {
      const users = await Promise.all([0, 1, 2].map(() => createUser(prisma, { rating: 1500 })));
      const rated = async (order: typeof users) => {
        const startsAt = new Date(Date.now() - 3 * HOUR);
        const contest = await createContest(prisma, {
          startsAt,
          endsAt: new Date(Date.now() - HOUR),
          problems: [{ problemId: problem.id, label: 'A' }],
          registrations: order.map((u) => u.id),
        });
        for (const [index, u] of order.entries()) {
          await createSubmission(prisma, {
            userId: u.id,
            problemId: problem.id,
            contestId: contest.id,
            status: 'DONE',
            verdict: 'AC',
            createdAt: new Date(startsAt.getTime() + (index + 1) * 600_000),
          });
        }
        return contest;
      };
      const first = await rated(users);
      const second = await rated([...users].reverse());
      const results = await Promise.all(
        [first, second].map((c) =>
          request(app).post(`/api/admin/contests/${c.id}/rate`).set(authHeader(admin)),
        ),
      );
      expect(results.map((r) => r.status)).toEqual([200, 200]);
      for (const u of users) {
        const changes = await prisma.ratingChange.findMany({ where: { userId: u.id } });
        const total = changes.reduce((sum, c) => sum + (c.newRating - c.oldRating), 0);
        const current = (await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).rating;
        expect(current).toBe(1500 + total);
      }
    }
  });

  it("rating a contest drops the cached boards of the rated users' other contests", async () => {
    const { contest, winner } = await endedContest();
    const other = await createContest(prisma, { registrations: [winner.id] });
    await rebuildScoreboard(other.id);
    await getRedis().zadd(scoreboardKeys(other.id).rank, 1, winner.id);
    const res = await request(app)
      .post(`/api/admin/contests/${contest.id}/rate`)
      .set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(await getRedis().exists(scoreboardKeys(other.id).rank)).toBe(0);
  });

  it('a rated contest cannot be deleted (409); its ratings and history stay', async () => {
    const { contest, winner } = await endedContest();
    const rate = await request(app)
      .post(`/api/admin/contests/${contest.id}/rate`)
      .set(authHeader(admin));
    expect(rate.status).toBe(200);
    const res = await request(app)
      .delete(`/api/admin/contests/${contest.id}`)
      .set(authHeader(admin));
    expect(res.status).toBe(409);
    expect(await prisma.contest.count({ where: { id: contest.id } })).toBe(1);
    expect(await prisma.ratingChange.count({ where: { userId: winner.id } })).toBe(1);
  });

  it('a rated contest keeps its times, penalty and problems (409) but its text can change', async () => {
    const { contest } = await endedContest();
    await request(app).post(`/api/admin/contests/${contest.id}/rate`).set(authHeader(admin));
    const detail = AdminContestSchema.parse(
      (await request(app).get(`/api/admin/contests/${contest.id}`).set(authHeader(admin))).body,
    );
    const same = {
      slug: detail.slug,
      title: detail.title,
      descriptionMd: detail.descriptionMd,
      startsAt: detail.startsAt,
      endsAt: detail.endsAt,
      isPublished: detail.isPublished,
      penaltyMinutes: detail.penaltyMinutes,
      problems: detail.problems.map((p) => ({ problemId: p.problemId, label: p.label })),
    };
    const put = (payload: object) =>
      request(app).put(`/api/admin/contests/${contest.id}`).set(authHeader(admin)).send(payload);
    expect((await put({ ...same, title: 'Renamed round' })).status).toBe(200);
    const reopened = hoursFromNow(5);
    expect((await put({ ...same, endsAt: reopened })).status).toBe(409);
    expect((await put({ ...same, penaltyMinutes: same.penaltyMinutes + 1 })).status).toBe(409);
    expect((await put({ ...same, problems: [] })).status).toBe(409);
    const after = await prisma.contest.findUniqueOrThrow({ where: { id: contest.id } });
    expect(after.endsAt.toISOString()).toBe(detail.endsAt);
  });

  it('two concurrent rate calls apply the ratings only once', async () => {
    const { contest, winner } = await endedContest();
    const results = await Promise.all([
      request(app).post(`/api/admin/contests/${contest.id}/rate`).set(authHeader(admin)),
      request(app).post(`/api/admin/contests/${contest.id}/rate`).set(authHeader(admin)),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await prisma.ratingChange.count({ where: { contestId: contest.id } })).toBe(3);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: winner.id } })).rating).toBe(1532);
  });
});
