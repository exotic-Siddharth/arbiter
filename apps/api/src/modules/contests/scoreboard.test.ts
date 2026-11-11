import { ScoreboardSchema, type ScoreRow } from '@arbiter/shared';
import type { Contest, PrismaClient, User } from '@prisma/client';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { setupTestDatabase, resetTables } from '../../../test/db';
import {
  createContest,
  createProblem,
  createSubmission,
  createUser,
} from '../../../test/factories';
import { createApp } from '../../app';
import { getRedis } from '../../lib/redis';
import {
  FIXTURE_EXPECTED,
  FIXTURE_LABELS,
  FIXTURE_SUBMISSIONS,
  FIXTURE_USERS,
  expectedCells,
  type FixtureUser,
} from './icpc.fixture';
import { getScoreboard, rebuildScoreboard, recomputeRow, scoreboardKeys } from './scoreboard';

let prisma: PrismaClient;
const app = createApp({ rateLimits: false });

const T0 = new Date(Date.now() - 2 * 60 * 60 * 1000);
const at = (minute: number) => new Date(T0.getTime() + Math.round(minute * 60_000));

interface Seeded {
  contest: Contest;
  users: Record<FixtureUser, User>;
  problemIds: Record<string, string>;
}

/** The hand-computed fixture contest in Postgres (names get a unique suffix). */
async function seedFixture(): Promise<Seeded> {
  const problems = await Promise.all(FIXTURE_LABELS.map(() => createProblem(prisma)));
  const problemIds = Object.fromEntries(FIXTURE_LABELS.map((label, i) => [label, problems[i].id]));
  const entries = await Promise.all(
    FIXTURE_USERS.map(async (name) => [name, await createUser(prisma)] as const),
  );
  const users = Object.fromEntries(entries) as Record<FixtureUser, User>;
  const bystander = await createUser(prisma); // registered, never submits: not a participant
  const contest = await createContest(prisma, {
    startsAt: T0,
    endsAt: new Date(Date.now() + 60 * 60 * 1000),
    penaltyMinutes: 20,
    problems: FIXTURE_LABELS.map((label) => ({ problemId: problemIds[label], label })),
    registrations: [...FIXTURE_USERS.map((name) => users[name].id), bystander.id],
  });
  for (const s of FIXTURE_SUBMISSIONS) {
    await createSubmission(prisma, {
      userId: users[s.user].id,
      problemId: problemIds[s.label],
      contestId: contest.id,
      status: s.status,
      verdict: s.verdict,
      createdAt: at(s.minute),
    });
  }
  // Ignored: an admin REFERENCE run and a practice submission (contestId null).
  await createSubmission(prisma, {
    userId: users.eve.id,
    problemId: problemIds.A,
    contestId: contest.id,
    kind: 'REFERENCE',
    status: 'DONE',
    verdict: 'AC',
    createdAt: at(1),
  });
  await createSubmission(prisma, {
    userId: users.eve.id,
    problemId: problemIds.A,
    status: 'DONE',
    verdict: 'AC',
    createdAt: at(2),
  });
  return { contest, users, problemIds };
}

function expectFixtureRows(rows: ScoreRow[], users: Record<FixtureUser, User>) {
  expect(rows).toHaveLength(FIXTURE_USERS.length);
  for (const name of FIXTURE_USERS) {
    const row = rows.find((r) => r.username === users[name].username);
    expect(row, name).toEqual({
      rank: FIXTURE_EXPECTED[name].rank,
      username: users[name].username,
      rating: 1200,
      solved: FIXTURE_EXPECTED[name].solved,
      penalty: FIXTURE_EXPECTED[name].penalty,
      cells: expectedCells(name),
    });
  }
  expect(rows.map((r) => r.rank)).toEqual([1, 2, 2, 4, 5]);
}

beforeAll(async () => {
  prisma = await setupTestDatabase();
  await resetTables(prisma);
});

describe('scoreboard cache', () => {
  it('builds the hand-computed fixture scoreboard (ranks, penalties, firstSolve, pending)', async () => {
    const { contest, users } = await seedFixture();
    const board = await getScoreboard(contest.id, 1, 50);
    expect(ScoreboardSchema.parse(board)).toEqual(board);
    expect(board).toMatchObject({
      contestSlug: contest.slug,
      problems: [{ label: 'A' }, { label: 'B' }, { label: 'C' }],
      total: 5,
      page: 1,
      pageSize: 50,
    });
    expectFixtureRows(board.rows, users);
  });

  it('pages through the ranked rows and keeps tied ranks across pages', async () => {
    const { contest, users } = await seedFixture();
    const page1 = await getScoreboard(contest.id, 1, 2);
    const page2 = await getScoreboard(contest.id, 2, 2);
    const page3 = await getScoreboard(contest.id, 3, 2);
    expect(page1.rows.map((r) => r.rank)).toEqual([1, 2]);
    expect(page2.rows.map((r) => r.rank)).toEqual([2, 4]);
    expect(page3.rows.map((r) => r.username)).toEqual([users.eve.username]);
    expect(page3.rows[0].rank).toBe(5);
    expect(page1.total).toBe(5);
  });

  it('rebuilds from Postgres when the Redis keys are deleted (through the API)', async () => {
    const { contest, users } = await seedFixture();
    await rebuildScoreboard(contest.id);
    const keys = scoreboardKeys(contest.id);
    const redis = getRedis();
    expect(await redis.zcard(keys.rank)).toBe(5);
    await redis.del(keys.rank, keys.rows);
    expect(await redis.exists(keys.rank, keys.rows)).toBe(0);

    const res = await request(app).get(`/api/contests/${contest.slug}/scoreboard`);
    expect(res.status).toBe(200);
    expectFixtureRows(ScoreboardSchema.parse(res.body).rows, users);
    expect(await redis.zcard(keys.rank)).toBe(5);
    expect(await redis.hlen(keys.rows)).toBe(5);
  });

  it('recomputeRow updates one row, its rank and the ZSET score', async () => {
    const { contest, users, problemIds } = await seedFixture();
    await rebuildScoreboard(contest.id);
    // eve solves C at minute 60: 1 solved, penalty 60 -> behind the four 2-solvers.
    await createSubmission(prisma, {
      userId: users.eve.id,
      problemId: problemIds.C,
      contestId: contest.id,
      status: 'DONE',
      verdict: 'AC',
      createdAt: at(60),
    });
    const row = await recomputeRow(contest.id, users.eve.id);
    expect(row).toMatchObject({ rank: 5, solved: 1, penalty: 60, username: users.eve.username });
    expect(row?.cells[2]).toMatchObject({ label: 'C', solved: true, firstSolve: true });
    const keys = scoreboardKeys(contest.id);
    expect(Number(await getRedis().zscore(keys.rank, users.eve.id))).toBe(10_000_000 - 60);

    // bob solves C at minute 70 after his WA: 3 solved -> rank 1 (strictly higher than all).
    await createSubmission(prisma, {
      userId: users.bob.id,
      problemId: problemIds.C,
      contestId: contest.id,
      status: 'DONE',
      verdict: 'AC',
      createdAt: at(70),
    });
    const bob = await recomputeRow(contest.id, users.bob.id);
    expect(bob).toMatchObject({ rank: 1, solved: 3, penalty: 97 + 70 + 20 });
    const board = await getScoreboard(contest.id, 1, 50);
    expect(board.rows.map((r) => [r.username, r.rank])).toEqual([
      [users.bob.username, 1],
      [users.carol.username, 2],
      expect.anything(),
      expect.anything(),
      [users.eve.username, 5],
    ]);
  });

  it('recomputeRow shows a pending cell for a queued contest submission', async () => {
    const { contest, users, problemIds } = await seedFixture();
    await createSubmission(prisma, {
      userId: users.alice.id,
      problemId: problemIds.C,
      contestId: contest.id,
      createdAt: at(80),
    });
    const row = await recomputeRow(contest.id, users.alice.id);
    expect(row?.cells[2]).toMatchObject({ label: 'C', pending: true, solved: false });
  });

  it('builds the cache on first use when recomputeRow runs before any read', async () => {
    const { contest, users } = await seedFixture();
    const keys = scoreboardKeys(contest.id);
    await getRedis().del(keys.rank, keys.rows);
    const row = await recomputeRow(contest.id, users.dave.id);
    expect(row).toMatchObject({ rank: 2, solved: 2, penalty: 57 });
    expect(await getRedis().zcard(keys.rank)).toBe(5);
  });

  it('moves firstSolve when an earlier AC is judged late', async () => {
    const { contest, users, problemIds } = await seedFixture();
    await rebuildScoreboard(contest.id);
    // A queued submission by eve from minute 8 on problem A is judged AC now: she becomes the
    // first solver of A, so bob's A cell must lose firstSolve.
    const late = await createSubmission(prisma, {
      userId: users.eve.id,
      problemId: problemIds.A,
      contestId: contest.id,
      createdAt: at(8),
    });
    await prisma.submission.update({
      where: { id: late.id },
      data: { status: 'DONE', verdict: 'AC' },
    });
    const eve = await recomputeRow(contest.id, users.eve.id);
    expect(eve?.cells[0]).toMatchObject({ label: 'A', firstSolve: true, acMinute: 8 });
    const board = await getScoreboard(contest.id, 1, 50);
    const bob = board.rows.find((r) => r.username === users.bob.username);
    expect(bob?.cells[0]).toMatchObject({ label: 'A', solved: true, firstSolve: false });
  });

  it('returns null for a non-participant and an empty board for a contest without submissions', async () => {
    const outsider = await createUser(prisma);
    const contest = await createContest(prisma, { registrations: [outsider.id] });
    expect(await recomputeRow(contest.id, outsider.id)).toBeNull();
    const board = await getScoreboard(contest.id, 1, 50);
    expect(board).toMatchObject({ rows: [], total: 0, problems: [] });
    expect(await recomputeRow('no-such-contest', outsider.id)).toBeNull();
  });
});
