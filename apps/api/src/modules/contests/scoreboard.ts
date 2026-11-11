import type { ScoreRow, Scoreboard } from '@arbiter/shared';
import type { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../db/prisma';
import { notFound } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { getRedis } from '../../lib/redis';
import { clock } from '../../lib/time';
import { emitter } from '../../realtime/emitter';
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
export const countedWhere = (contestId: string) => ({
  contestId,
  kind: 'NORMAL' as const,
  user: { registrations: { some: { contestId } } },
});

const SCORING_CONTEST_SELECT = {
  slug: true,
  startsAt: true,
  penaltyMinutes: true,
  problems: { select: { problemId: true, label: true }, orderBy: { ordinal: 'asc' } },
} satisfies Prisma.ContestSelect;

function loadScoringContest(
  contestId: string,
): Promise<(ScoringContest & { slug: string }) | null> {
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

/** Recompute every row from Postgres and replace the cache in one atomic MULTI. */
async function writeFullCache(contestId: string): Promise<void> {
  const redis = getRedis();
  const keys = scoreboardKeys(contestId);
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
}

/**
 * Recompute every row of a contest from Postgres and replace the cache atomically, under a Redis
 * lock. When another process holds the lock, wait for it (up to 10 s). If it finished without
 * building the cache (it failed, or its lock expired), take the lock once more; as a last resort
 * build without it (the replace is atomic and Postgres is the source of truth), so this never
 * returns with the cache silently missing.
 */
export async function rebuildScoreboard(contestId: string): Promise<void> {
  const redis = getRedis();
  const keys = scoreboardKeys(contestId);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = randomUUID();
    const acquired = await redis.set(keys.lock, token, 'PX', LOCK_TTL_MS, 'NX');
    if (acquired === 'OK') {
      try {
        await writeFullCache(contestId);
      } finally {
        await redis.eval(RELEASE_LOCK, 1, keys.lock, token);
      }
      return;
    }
    const deadline = Date.now() + LOCK_WAIT_MS;
    while (Date.now() < deadline && (await redis.exists(keys.lock)) === 1) {
      await sleep(LOCK_POLL_MS);
    }
    if (await isBuilt(contestId)) return;
  }
  await writeFullCache(contestId);
}

/**
 * ZADD + HSET + SET only when the rank ZSET exists, so a write can never create a cache that holds
 * a single row: after an invalidation the next rebuild must produce the board. Returns 1 if written.
 */
const WRITE_ROW_IF_BUILT = `
if redis.call('exists', KEYS[1]) == 0 then return 0 end
redis.call('zadd', KEYS[1], ARGV[1], ARGV[2])
redis.call('hset', KEYS[2], ARGV[2], ARGV[3])
redis.call('set', KEYS[3], ARGV[4])
return 1`;

/** True when the row was written; false when the cache is missing (the caller rebuilds). */
async function writeRow(contestId: string, row: UserScoreRow): Promise<boolean> {
  const keys = scoreboardKeys(contestId);
  const written = await getRedis().eval(
    WRITE_ROW_IF_BUILT,
    3,
    keys.rank,
    keys.rows,
    keys.updatedAt,
    String(scoreOf(row)),
    row.userId,
    JSON.stringify(toStored(row)),
    clock.now().toISOString(),
  );
  return written === 1;
}

async function readStoredRows(contestId: string, userIds: string[]): Promise<(StoredRow | null)[]> {
  if (userIds.length === 0) return [];
  const raw = await getRedis().hmget(scoreboardKeys(contestId).rows, ...userIds);
  return raw.map((json) => (json ? (JSON.parse(json) as StoredRow) : null));
}

/**
 * Runs `work` under a short per-(contest, user) lock (SET NX PX, token-checked release), so two
 * recomputes of one user cannot interleave and leave the older Postgres snapshot as the last
 * write. A waiter polls until the holder is done (it then reads the newest state); the TTL frees a
 * crashed holder's lock, and after LOCK_WAIT_MS the work runs unlocked rather than failing a verdict.
 */
async function withRowLock<T>(
  contestId: string,
  userId: string,
  work: () => Promise<T>,
): Promise<T> {
  const redis = getRedis();
  const key = `contest:${contestId}:rowlock:${userId}`;
  const token = randomUUID();
  const deadline = Date.now() + LOCK_WAIT_MS;
  let held = false;
  for (;;) {
    held = (await redis.set(key, token, 'PX', LOCK_TTL_MS, 'NX')) === 'OK';
    if (held || Date.now() >= deadline) break;
    await sleep(LOCK_POLL_MS);
  }
  try {
    return await work();
  } finally {
    if (held) await redis.eval(RELEASE_LOCK, 1, key, token);
  }
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

  const keys = scoreboardKeys(contestId);
  const { contest, row, newFirsts, cacheLost } = await withRowLock(contestId, userId, async () => {
    // Read inside the lock: a waiter must see what the holder just committed.
    const contest: ScoringContest = { ...base, firstSolveAt: await loadFirstSolves(contestId) };
    const fresh = await loadUserRow(contest, contestId, userId);
    if (!fresh) {
      await getRedis().multi().zrem(keys.rank, userId).hdel(keys.rows, userId).exec();
      return { contest, row: null, newFirsts: [], cacheLost: false };
    }
    // A late-judged earlier AC can take a first solve from someone else: refresh their rows too.
    const [previous] = await readStoredRows(contestId, [userId]);
    const firsts = fresh.cells
      .filter((cell, i) => cell.firstSolve && !previous?.cells[i]?.firstSolve)
      .map((cell) => cell.label);
    const cacheLost = !(await writeRow(contestId, fresh));
    return { contest, row: fresh, newFirsts: firsts, cacheLost };
  });
  if (!row) return null;
  if (cacheLost) {
    // The cache vanished (admin edit) or was never built: Postgres already holds this verdict.
    await rebuildScoreboard(contestId);
    return { rank: await rankOfScore(contestId, scoreOf(row)), ...toStored(row) };
  }
  if (newFirsts.length > 0) {
    const memberIds = (await getRedis().zrange(keys.rank, 0, -1)).filter((id) => id !== userId);
    const others = await readStoredRows(contestId, memberIds);
    for (const [index, other] of others.entries()) {
      const stale = other?.cells.some((cell) => cell.firstSolve && newFirsts.includes(cell.label));
      if (!stale) continue;
      const refreshed = await withRowLock(contestId, memberIds[index], async () => {
        const fresh = await loadUserRow(contest, contestId, memberIds[index]);
        return { fresh, written: fresh ? await writeRow(contestId, fresh) : true };
      });
      if (!refreshed.written) break; // cache vanished: next read rebuilds
      // Live clients re-rank locally from pushed rows: tell them the star moved off this row.
      if (refreshed.fresh) {
        try {
          emitter.emitScoreboardRow(contestId, {
            contestSlug: base.slug,
            row: {
              rank: await rankOfScore(contestId, scoreOf(refreshed.fresh)),
              ...toStored(refreshed.fresh),
            },
          });
        } catch (error) {
          logger.warn({ contestId, err: String(error) }, 'scoreboard row emit failed');
        }
      }
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
