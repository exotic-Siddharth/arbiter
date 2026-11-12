import { AdminContestBody } from '@arbiter/shared';
import type { PrismaClient } from '@prisma/client';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { resetTables, setupTestDatabase } from '../../../test/db';
import {
  createContest,
  createProblem,
  createSubmission,
  createUser,
} from '../../../test/factories';
import { AppError } from '../../lib/errors';
import { rateContest, updateAdminContest } from '../contests/admin';
import { loadStandings } from '../contests/scoreboard';
import { deleteAdminProblem } from '../problems/admin.service';

// A-R3-02: the rated-contest guards (problem DELETE, contest PUT) must serialise with a rating in
// flight. The hook runs inside rateContest's transaction, right after it has read the standings.
const hook = vi.hoisted(() => ({ current: null as null | (() => Promise<void>) }));

vi.mock('../contests/scoreboard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../contests/scoreboard')>();
  return {
    ...actual,
    loadStandings: async (...args: Parameters<typeof actual.loadStandings>) => {
      const rows = await actual.loadStandings(...args);
      const run = hook.current;
      hook.current = null;
      if (run) await run();
      return rows;
    },
  };
});

const HOUR = 60 * 60 * 1000;
let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDatabase();
  await resetTables(prisma);
});

/** u1 solves A and B, u2 only A (earlier): u1 ranks first; without B, u2 would. */
async function endedContest() {
  const [pa, pb] = await Promise.all([createProblem(prisma), createProblem(prisma)]);
  const [u1, u2] = await Promise.all([
    createUser(prisma, { rating: 1500 }),
    createUser(prisma, { rating: 1500 }),
  ]);
  const startsAt = new Date(Date.now() - 3 * HOUR);
  const contest = await createContest(prisma, {
    startsAt,
    endsAt: new Date(Date.now() - HOUR),
    problems: [
      { problemId: pa.id, label: 'A' },
      { problemId: pb.id, label: 'B' },
    ],
    registrations: [u1.id, u2.id],
  });
  const at = (minute: number) => new Date(startsAt.getTime() + minute * 60_000);
  const ac = (userId: string, problemId: string, minute: number) =>
    createSubmission(prisma, {
      userId,
      problemId,
      contestId: contest.id,
      status: 'DONE',
      verdict: 'AC',
      createdAt: at(minute),
    });
  await ac(u1.id, pa.id, 10);
  await ac(u1.id, pb.id, 20);
  await ac(u2.id, pa.id, 5);
  return { contest, pa, pb };
}

/** Starts `write` while the rating transaction is open and gives it time to run or block. */
function raceDuringRating(write: () => Promise<unknown>) {
  let outcome: Promise<unknown> = Promise.resolve();
  hook.current = async () => {
    outcome = write().then(
      () => 'ok',
      (error: unknown) => error,
    );
    await new Promise((resolve) => setTimeout(resolve, 400));
  };
  return () => outcome;
}

async function expectStandingsMatchRatings(contestId: string) {
  const standings = await loadStandings(contestId, prisma);
  const changes = await prisma.ratingChange.findMany({ where: { contestId } });
  expect(changes).toHaveLength(standings.length);
  for (const row of standings) {
    expect(changes.find((change) => change.userId === row.userId)?.rank).toBe(row.rank);
  }
}

function expectConflict(result: unknown) {
  expect(result).toBeInstanceOf(AppError);
  expect((result as AppError).status).toBe(409);
}

describe('rated-contest guards against a rating in flight', () => {
  it('a problem DELETE during the rating gets 409 and the standings match the RatingChange rows', async () => {
    const { contest, pb } = await endedContest();
    const outcome = raceDuringRating(() => deleteAdminProblem(prisma, pb.id));
    await rateContest(prisma, contest.id);
    expectConflict(await outcome());
    expect(await prisma.problem.count({ where: { id: pb.id } })).toBe(1);
    await expectStandingsMatchRatings(contest.id);
  });

  it('a contest PUT that drops a problem during the rating gets 409', async () => {
    const { contest, pa } = await endedContest();
    const body = AdminContestBody.parse({
      slug: contest.slug,
      title: contest.title,
      descriptionMd: contest.descriptionMd,
      startsAt: contest.startsAt.toISOString(),
      endsAt: contest.endsAt.toISOString(),
      isPublished: contest.isPublished,
      penaltyMinutes: contest.penaltyMinutes,
      problems: [{ problemId: pa.id, label: 'A' }],
    });
    const outcome = raceDuringRating(() => updateAdminContest(prisma, contest.id, body));
    await rateContest(prisma, contest.id);
    expectConflict(await outcome());
    expect(await prisma.contestProblem.count({ where: { contestId: contest.id } })).toBe(2);
    await expectStandingsMatchRatings(contest.id);
  });

  it('a problem DELETE that commits first is seen by the rating (no RatingChange for its solves)', async () => {
    const { contest, pb } = await endedContest();
    await deleteAdminProblem(prisma, pb.id);
    await rateContest(prisma, contest.id);
    await expectStandingsMatchRatings(contest.id);
  });
});
