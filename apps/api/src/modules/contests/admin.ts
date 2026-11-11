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
import { invalidateScoreboard, loadStandings } from './scoreboard';

/** Admin contest CRUD and rating (spec section 10, /api/admin/contests). Owner: lane A3b. */

/** One write pair per participant: allow large contests more than Prisma's 5 s default. */
const RATE_TRANSACTION_OPTIONS = { timeout: 60_000, maxWait: 10_000 };

const adminInclude = {
  _count: { select: { registrations: true } },
  problems: {
    orderBy: { ordinal: 'asc' },
    include: { problem: { select: { slug: true, title: true } } },
  },
} satisfies Prisma.ContestInclude;

type AdminContestRow = Prisma.ContestGetPayload<{ include: typeof adminInclude }>;

function toAdminContest(row: AdminContestRow): AdminContest {
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

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

async function assertProblemsExist(prisma: PrismaClient, body: AdminContestBody): Promise<void> {
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
  return toAdminContest(row);
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
    return toAdminContest(row);
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict('Slug already taken');
    throw error;
  }
}

/** Full replace, problem list included; drops the cached scoreboard. */
export async function updateAdminContest(
  prisma: PrismaClient,
  id: string,
  body: AdminContestBody,
): Promise<AdminContest> {
  const existing = await prisma.contest.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw notFound('Contest not found');
  await assertProblemsExist(prisma, body);
  try {
    const row = await prisma.$transaction(async (tx) => {
      await tx.contestProblem.deleteMany({ where: { contestId: id } });
      return tx.contest.update({
        where: { id },
        data: { ...contestData(body), problems: { create: problemRows(body) } },
        include: adminInclude,
      });
    });
    await invalidateScoreboard(id);
    return toAdminContest(row);
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict('Slug already taken');
    throw error;
  }
}

export async function deleteAdminContest(prisma: PrismaClient, id: string): Promise<void> {
  const { count } = await prisma.contest.deleteMany({ where: { id } });
  if (count === 0) throw notFound('Contest not found');
  await invalidateScoreboard(id);
}

/**
 * POST /api/admin/contests/:id/rate: pairwise Elo over the final standings. 409 before the end or
 * when already rated. RatingChange rows, user ratings and ratedAt are written in one transaction;
 * the conditional ratedAt update makes concurrent calls safe (only one wins).
 */
export async function rateContest(prisma: PrismaClient, id: string): Promise<RateContestResponse> {
  const contest = await prisma.contest.findUnique({ where: { id } });
  if (!contest) throw notFound('Contest not found');
  const now = clock.now();
  if (contestStatus(contest, now) !== 'ENDED') throw conflict('The contest has not ended yet');
  if (contest.ratedAt) throw conflict('The contest is already rated');

  const changes = await prisma.$transaction(async (tx) => {
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
      result.push({ username: row.username, oldRating: row.rating, newRating, rank: row.rank });
    }
    return result;
  }, RATE_TRANSACTION_OPTIONS);
  // Rows carry the users' ratings: rebuild them on the next read.
  await invalidateScoreboard(id);
  return { changes };
}
