import type {
  AdminContest,
  AdminContestBody,
  AdminContestListQuery,
  AdminContestPage,
  AdminContestSummary,
  RateContestResponse,
} from '@arbiter/shared';
import { Prisma, type PrismaClient } from '@prisma/client';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { paginate, toPage } from '../../lib/pagination';
import { clock, contestStatus, toIso, toIsoOrNull } from '../../lib/time';
import { computeRatingDeltas } from './rating';
import { countedWhere, invalidateScoreboard, loadStandings } from './scoreboard';

/** Admin contest CRUD and rating (spec section 10, /api/admin/contests). Owner: lane A3b. */

/**
 * One write pair per participant: allow large contests more than Prisma's 5 s default. The
 * rated-contest guards use it too: they may wait for a rating in flight (see lockContests).
 */
export const RATE_TRANSACTION_OPTIONS = { timeout: 60_000, maxWait: 10_000 };

/**
 * Locks the contest rows (SELECT ... FOR UPDATE, in id order) and returns their latest committed
 * ratedAt. The rating apply, the contest PUT and the problem DELETE all take this lock inside
 * their transaction before checking ratedAt: a guard that starts while a rating is open waits for
 * it and then sees the contest as rated, and a rating that starts after a guard's write sees it.
 */
export async function lockContests(
  tx: Prisma.TransactionClient,
  ids: string[],
): Promise<{ id: string; ratedAt: Date | null }[]> {
  if (ids.length === 0) return [];
  return tx.$queryRaw<{ id: string; ratedAt: Date | null }[]>`
    SELECT id, "ratedAt" FROM "Contest" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;
}

const adminInclude = {
  _count: { select: { registrations: true } },
  problems: {
    orderBy: { ordinal: 'asc' },
    include: { problem: { select: { slug: true, title: true } } },
  },
} satisfies Prisma.ContestInclude;

type AdminContestRow = Prisma.ContestGetPayload<{ include: typeof adminInclude }>;

function toAdminContest(row: AdminContestRow, pendingSubmissions: number): AdminContest {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    descriptionMd: row.descriptionMd,
    startsAt: toIso(row.startsAt),
    endsAt: toIso(row.endsAt),
    isPublished: row.isPublished,
    penaltyMinutes: row.penaltyMinutes,
    ratedAt: toIsoOrNull(row.ratedAt),
    status: contestStatus(row, clock.now()),
    participantCount: row._count.registrations,
    pendingSubmissions,
    problems: row.problems.map((cp) => ({
      problemId: cp.problemId,
      label: cp.label,
      ordinal: cp.ordinal,
      slug: cp.problem.slug,
      title: cp.problem.title,
    })),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

/** Counted contest submissions that have no verdict yet (rating waits for them). */
const countPending = (client: Prisma.TransactionClient | PrismaClient, contestId: string) =>
  client.submission.count({
    where: { ...countedWhere(contestId), status: { in: ['QUEUED', 'COMPILING', 'RUNNING'] } },
  });

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

async function assertProblemsExist(
  prisma: Pick<PrismaClient, 'problem'>,
  body: AdminContestBody,
): Promise<void> {
  const ids = body.problems.map((p) => p.problemId);
  if (ids.length === 0) return;
  const found = await prisma.problem.findMany({ where: { id: { in: ids } }, select: { id: true } });
  const known = new Set(found.map((p) => p.id));
  const details = body.problems.flatMap((p, index) =>
    known.has(p.problemId)
      ? []
      : [
          {
            location: 'body',
            path: `problems.${index}.problemId`,
            message: 'Unknown problem',
            code: 'custom',
          },
        ],
  );
  if (details.length > 0) throw badRequest('Unknown problem id', details);
}

const contestData = (body: AdminContestBody) => ({
  slug: body.slug,
  title: body.title,
  descriptionMd: body.descriptionMd,
  startsAt: new Date(body.startsAt),
  endsAt: new Date(body.endsAt),
  isPublished: body.isPublished,
  penaltyMinutes: body.penaltyMinutes,
});

const problemRows = (body: AdminContestBody) =>
  body.problems.map((p, index) => ({ problemId: p.problemId, label: p.label, ordinal: index + 1 }));

export async function listAdminContests(
  prisma: PrismaClient,
  query: AdminContestListQuery,
): Promise<AdminContestPage> {
  const where: Prisma.ContestWhereInput = query.search
    ? {
        OR: [
          { slug: { contains: query.search, mode: 'insensitive' } },
          { title: { contains: query.search, mode: 'insensitive' } },
        ],
      }
    : {};
  const { skip, take, page, pageSize } = paginate(query);
  const now = clock.now();
  const [rows, total] = await Promise.all([
    prisma.contest.findMany({
      where,
      orderBy: [{ startsAt: 'desc' }, { id: 'asc' }],
      skip,
      take,
      include: { _count: { select: { registrations: true, problems: true } } },
    }),
    prisma.contest.count({ where }),
  ]);
  const items: AdminContestSummary[] = rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    startsAt: toIso(row.startsAt),
    endsAt: toIso(row.endsAt),
    status: contestStatus(row, now),
    isPublished: row.isPublished,
    problemCount: row._count.problems,
    participantCount: row._count.registrations,
    ratedAt: toIsoOrNull(row.ratedAt),
  }));
  return toPage(items, total, { page, pageSize });
}

export async function getAdminContest(prisma: PrismaClient, id: string): Promise<AdminContest> {
  const row = await prisma.contest.findUnique({ where: { id }, include: adminInclude });
  if (!row) throw notFound('Contest not found');
  return toAdminContest(row, await countPending(prisma, id));
}

export async function createAdminContest(
  prisma: PrismaClient,
  body: AdminContestBody,
): Promise<AdminContest> {
  await assertProblemsExist(prisma, body);
  try {
    const row = await prisma.contest.create({
      data: { ...contestData(body), problems: { create: problemRows(body) } },
      include: adminInclude,
    });
    return toAdminContest(row, 0);
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict('Slug already taken');
    throw error;
  }
}

/** True when `body` alters the times, penalty or problem list a rated contest was scored with. */
function changesRatedStandings(
  existing: {
    startsAt: Date;
    endsAt: Date;
    penaltyMinutes: number;
    problems: { problemId: string; label: string }[];
  },
  body: AdminContestBody,
): boolean {
  return (
    new Date(body.startsAt).getTime() !== existing.startsAt.getTime() ||
    new Date(body.endsAt).getTime() !== existing.endsAt.getTime() ||
    body.penaltyMinutes !== existing.penaltyMinutes ||
    JSON.stringify(body.problems.map((p) => [p.problemId, p.label])) !==
      JSON.stringify(existing.problems.map((p) => [p.problemId, p.label]))
  );
}

/** Full replace, problem list included; drops the cached scoreboard. Rated contests: see above. */
export async function updateAdminContest(
  prisma: PrismaClient,
  id: string,
  body: AdminContestBody,
): Promise<AdminContest> {
  try {
    const row = await prisma.$transaction(async (tx) => {
      // Under the contest lock: a rating in flight finishes first, and its ratedAt is seen here.
      if ((await lockContests(tx, [id])).length === 0) throw notFound('Contest not found');
      const existing = await tx.contest.findUniqueOrThrow({
        where: { id },
        select: {
          ratedAt: true,
          startsAt: true,
          endsAt: true,
          penaltyMinutes: true,
          problems: { orderBy: { ordinal: 'asc' }, select: { problemId: true, label: true } },
        },
      });
      // The ratings were computed from the final standings: what defines them stays fixed.
      if (existing.ratedAt && changesRatedStandings(existing, body)) {
        throw conflict('A rated contest keeps its times, penalty and problems');
      }
      await assertProblemsExist(tx, body);
      await tx.contestProblem.deleteMany({ where: { contestId: id } });
      return tx.contest.update({
        where: { id },
        data: { ...contestData(body), problems: { create: problemRows(body) } },
        include: adminInclude,
      });
    }, RATE_TRANSACTION_OPTIONS);
    await invalidateScoreboard(id);
    return toAdminContest(row, await countPending(prisma, id));
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict('Slug already taken');
    throw error;
  }
}

export async function deleteAdminContest(prisma: PrismaClient, id: string): Promise<void> {
  // Deleting would cascade the RatingChange history while the deltas stay in User.rating.
  const { count } = await prisma.contest.deleteMany({ where: { id, ratedAt: null } });
  if (count === 0) {
    if (await prisma.contest.findUnique({ where: { id }, select: { id: true } })) {
      throw conflict('A rated contest cannot be deleted');
    }
    throw notFound('Contest not found');
  }
  await invalidateScoreboard(id);
}

/**
 * POST /api/admin/contests/:id/rate: pairwise Elo over the final standings. 409 before the end,
 * while counted submissions are still being judged, or when already rated. RatingChange rows, user
 * ratings and ratedAt are written in one transaction; the conditional ratedAt update makes
 * concurrent calls safe (only one wins).
 */
export async function rateContest(prisma: PrismaClient, id: string): Promise<RateContestResponse> {
  const contest = await prisma.contest.findUnique({ where: { id } });
  if (!contest) throw notFound('Contest not found');
  const now = clock.now();
  if (contestStatus(contest, now) !== 'ENDED') throw conflict('The contest has not ended yet');
  if (contest.ratedAt) throw conflict('The contest is already rated');

  const userIds: string[] = [];
  const changes = await prisma.$transaction(async (tx) => {
    // Ratings are absolute values shared across contests: apply one contest at a time (the lock
    // ends with the transaction), so concurrent calls neither lose an update nor deadlock on rows.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('arbiter:rate-contest'))`;
    // The contest row lock serialises the rating with the rated-contest guards (lockContests).
    const [locked] = await lockContests(tx, [id]);
    if (!locked) throw notFound('Contest not found');
    if (locked.ratedAt) throw conflict('The contest is already rated');
    // Provisional standings must never become final: wait until every counted submission has a verdict.
    const judging = await countPending(tx, id);
    if (judging > 0) throw conflict(`Judging is still in progress (${judging} submissions)`);
    const claimed = await tx.contest.updateMany({
      where: { id, ratedAt: null },
      data: { ratedAt: now },
    });
    if (claimed.count === 0) throw conflict('The contest is already rated');

    const standings = await loadStandings(id, tx);
    const deltas = computeRatingDeltas(
      standings.map((row) => ({ userId: row.userId, rating: row.rating, rank: row.rank })),
    );
    const result: RateContestResponse['changes'] = [];
    for (const row of standings) {
      const newRating = row.rating + (deltas.get(row.userId) ?? 0);
      await tx.ratingChange.create({
        data: {
          userId: row.userId,
          contestId: id,
          oldRating: row.rating,
          newRating,
          rank: row.rank,
        },
      });
      await tx.user.update({ where: { id: row.userId }, data: { rating: newRating } });
      userIds.push(row.userId);
      result.push({ username: row.username, oldRating: row.rating, newRating, rank: row.rank });
    }
    return result;
  }, RATE_TRANSACTION_OPTIONS);
  // Rows carry the users' ratings: rebuild them on the next read, here and in every other contest
  // the rated users take part in.
  const others = await prisma.contestRegistration.findMany({
    where: { userId: { in: userIds }, contestId: { not: id } },
    select: { contestId: true },
    distinct: ['contestId'],
  });
  await Promise.all([id, ...others.map((other) => other.contestId)].map(invalidateScoreboard));
  return { changes };
}
