import type { ScoreRow, Scoreboard } from '@arbiter/shared';
import type { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../db/prisma';
import { notFound } from '../../lib/errors';
import { getRedis } from '../../lib/redis';
import { clock } from '../../lib/time';
import {
  computeRow,
  computeStandings,
  scoreOf,
  type ScoringContest,
  type ScoringSubmission,
  type UserScoreRow,
} from './icpc';

/**
 * ICPC scoreboard cache (spec section 9, resolution R3). Redis keys:
 *   contest:<id>:rank       ZSET    score = solved * 10^7 - penalty, member = userId
 *   contest:<id>:rows       HASH    userId -> row JSON (ScoreRow without its rank)
 *   contest:<id>:updatedAt  STRING  ISO time of the last write (Scoreboard.updatedAt)
 *   contest:<id>:lock       STRING  rebuild lock (SET NX PX)
 * The cache counts as built when the rank ZSET exists; Postgres is the source of truth.
 * Owner: lane A3b.
 */

export function scoreboardKeys(contestId: string) {
  const base = `contest:${contestId}`;
  return {
    rank: `${base}:rank`,
    rows: `${base}:rows`,
    updatedAt: `${base}:updatedAt`,
    lock: `${base}:lock`,
  };
}

const LOCK_TTL_MS = 15_000;
const LOCK_WAIT_MS = 10_000;
const LOCK_POLL_MS = 50;

type StoredRow = Omit<ScoreRow, 'rank'>;

const toStored = ({ username, rating, solved, penalty, cells }: UserScoreRow): StoredRow => ({
  username,
  rating,
  solved,
  penalty,
  cells,
});

const SUBMISSION_SELECT = {
  id: true,
  userId: true,
  problemId: true,
  status: true,
  verdict: true,
  createdAt: true,
  user: { select: { username: true, rating: true } },
} satisfies Prisma.SubmissionSelect;

/** Contest submissions that count: NORMAL kind (R7), by registrants (spec section 9). */
const countedWhere = (contestId: string) => ({
  contestId,
  kind: 'NORMAL' as const,
  user: { registrations: { some: { contestId } } },
});

const SCORING_CONTEST_SELECT = {
  startsAt: true,
  penaltyMinutes: true,
  problems: { select: { problemId: true, label: true }, orderBy: { ordinal: 'asc' } },
} satisfies Prisma.ContestSelect;

function loadScoringContest(contestId: string): Promise<ScoringContest | null> {
  return prisma.contest.findUnique({ where: { id: contestId }, select: SCORING_CONTEST_SELECT });
}

/** Earliest AC per problem across the contest (Postgres aggregate). */
async function loadFirstSolves(contestId: string): Promise<Map<string, Date>> {
  const groups = await prisma.submission.groupBy({
    by: ['problemId'],
    where: { ...countedWhere(contestId), status: 'DONE', verdict: 'AC' },
    _min: { createdAt: true },
  });
  const firsts = new Map<string, Date>();
  for (const group of groups) {
    if (group._min.createdAt) firsts.set(group.problemId, group._min.createdAt);
  }
  return firsts;
}

async function loadUserRow(
  contest: ScoringContest,
  contestId: string,
  userId: string,
): Promise<UserScoreRow | null> {
  const submissions: ScoringSubmission[] = await prisma.submission.findMany({
    where: { ...countedWhere(contestId), userId },
    select: SUBMISSION_SELECT,
  });
  return submissions.length > 0 ? computeRow(contest, submissions) : null;
}

/**
 * The full ranked standings straight from Postgres (no cache). The admin rate route uses it inside
 * its transaction, so ranks and pre-contest ratings are read consistently.
 */
export async function loadStandings(
  contestId: string,
  client: Pick<PrismaClient, 'contest' | 'submission'> = prisma,
): Promise<UserScoreRow[]> {
  const contest = await client.contest.findUnique({
    where: { id: contestId },
    select: SCORING_CONTEST_SELECT,
  });
  if (!contest) return [];
  const submissions: ScoringSubmission[] = await client.submission.findMany({
    where: countedWhere(contestId),
    select: SUBMISSION_SELECT,
  });
  return computeStandings(contest, submissions);
}

/** Drop the cached scoreboard (after an admin edit); the next read rebuilds it. */
export async function invalidateScoreboard(contestId: string): Promise<void> {
  const keys = scoreboardKeys(contestId);
  await getRedis().del(keys.rank, keys.rows, keys.updatedAt);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function isBuilt(contestId: string): Promise<boolean> {
  return (await getRedis().exists(scoreboardKeys(contestId).rank)) === 1;
}

/** 1 + number of rows with a strictly higher score. */
async function rankOfScore(contestId: string, score: number): Promise<number> {
  return 1 + (await getRedis().zcount(scoreboardKeys(contestId).rank, `(${score}`, '+inf'));
}

const RELEASE_LOCK =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0";

/**
 * Recompute every row of a contest from Postgres and replace the cache atomically, under a Redis
 * lock. When another process holds the lock, wait for it to finish instead (up to 10 s).
 */
export async function rebuildScoreboard(contestId: string): Promise<void> {
  const redis = getRedis();
  const keys = scoreboardKeys(contestId);
  const token = randomUUID();
  const acquired = await redis.set(keys.lock, token, 'PX', LOCK_TTL_MS, 'NX');
  if (acquired !== 'OK') {
    const deadline = Date.now() + LOCK_WAIT_MS;
    while (Date.now() < deadline && (await redis.exists(keys.lock)) === 1) {
      await sleep(LOCK_POLL_MS);
    }
    return;
  }
  try {
    const rows = await loadStandings(contestId);
    const multi = redis.multi().del(keys.rank, keys.rows);
    if (rows.length > 0) {
      multi.zadd(keys.rank, ...rows.flatMap((row) => [scoreOf(row), row.userId]));
      multi.hset(
        keys.rows,
        Object.fromEntries(rows.map((row) => [row.userId, JSON.stringify(toStored(row))])),
      );
    }
    multi.set(keys.updatedAt, clock.now().toISOString());
    await multi.exec();
  } finally {
    await redis.eval(RELEASE_LOCK, 1, keys.lock, token);
  }
}

async function writeRow(contestId: string, row: UserScoreRow): Promise<void> {
  const keys = scoreboardKeys(contestId);
  await getRedis()
    .multi()
    .zadd(keys.rank, scoreOf(row), row.userId)
    .hset(keys.rows, row.userId, JSON.stringify(toStored(row)))
    .set(keys.updatedAt, clock.now().toISOString())
    .exec();
}

async function readStoredRows(contestId: string, userIds: string[]): Promise<(StoredRow | null)[]> {
  if (userIds.length === 0) return [];
  const raw = await getRedis().hmget(scoreboardKeys(contestId).rows, ...userIds);
  return raw.map((json) => (json ? (JSON.parse(json) as StoredRow) : null));
}

/**
 * Rebuild one user's row from Postgres, write the ZSET + HASH and return the row (null when the
 * user is not a participant, or the contest does not exist). rank = 1 + number of rows with a
 * strictly higher score. Callers emit emitter.emitScoreboardRow(contestId, { contestSlug, row }).
 * Builds the whole cache first when it is missing.
 */
export async function recomputeRow(contestId: string, userId: string): Promise<ScoreRow | null> {
  const base = await loadScoringContest(contestId);
  if (!base) return null;
  if (!(await isBuilt(contestId))) await rebuildScoreboard(contestId);

  const contest: ScoringContest = { ...base, firstSolveAt: await loadFirstSolves(contestId) };
  const row = await loadUserRow(contest, contestId, userId);
  const keys = scoreboardKeys(contestId);
  if (!row) {
    await getRedis().multi().zrem(keys.rank, userId).hdel(keys.rows, userId).exec();
    return null;
  }

  // A late-judged earlier AC can take a first solve from someone else: refresh their rows too.
  const [previous] = await readStoredRows(contestId, [userId]);
  const newFirsts = row.cells
    .filter((cell, i) => cell.firstSolve && !previous?.cells[i]?.firstSolve)
    .map((cell) => cell.label);
  await writeRow(contestId, row);
  if (newFirsts.length > 0) {
    const memberIds = (await getRedis().zrange(keys.rank, 0, -1)).filter((id) => id !== userId);
    const others = await readStoredRows(contestId, memberIds);
    for (const [index, other] of others.entries()) {
      const stale = other?.cells.some((cell) => cell.firstSolve && newFirsts.includes(cell.label));
      if (!stale) continue;
      const fresh = await loadUserRow(contest, contestId, memberIds[index]);
      if (fresh) await writeRow(contestId, fresh);
    }
  }

  return { rank: await rankOfScore(contestId, scoreOf(row)), ...toStored(row) };
}

/** Page of the ranked scoreboard (rebuilds first if the keys are missing). */
export async function getScoreboard(
  contestId: string,
  page: number,
  pageSize: number,
): Promise<Scoreboard> {
  const contest = await prisma.contest.findUnique({
    where: { id: contestId },
    select: { slug: true, problems: { select: { label: true }, orderBy: { ordinal: 'asc' } } },
  });
  if (!contest) throw notFound('Contest not found');
  if (!(await isBuilt(contestId))) await rebuildScoreboard(contestId);

  const redis = getRedis();
  const keys = scoreboardKeys(contestId);
  const start = (page - 1) * pageSize;
  const [total, flat, updatedAt] = await Promise.all([
    redis.zcard(keys.rank),
    redis.zrevrange(keys.rank, start, start + pageSize - 1, 'WITHSCORES'),
    redis.get(keys.updatedAt),
  ]);
  const members: { userId: string; score: number }[] = [];
  for (let i = 0; i < flat.length; i += 2) {
    members.push({ userId: flat[i], score: Number(flat[i + 1]) });
  }
  const stored = await readStoredRows(
    contestId,
    members.map((m) => m.userId),
  );

  const rows: ScoreRow[] = [];
  let rank = 0;
  let previousScore: number | null = null;
  for (const [index, member] of members.entries()) {
    if (previousScore === null) rank = await rankOfScore(contestId, member.score);
    else if (member.score !== previousScore) rank = start + index + 1;
    previousScore = member.score;
    const row = stored[index];
    if (row) rows.push({ rank, ...row });
  }

  return {
    contestSlug: contest.slug,
    problems: contest.problems.map(({ label }) => ({ label })),
    rows,
    total,
    page,
    pageSize,
    updatedAt: updatedAt ?? clock.now().toISOString(),
  };
}
