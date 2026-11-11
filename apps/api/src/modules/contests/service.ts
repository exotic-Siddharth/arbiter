import type {
  ContestDetail,
  ContestProblemItem,
  ContestSummary,
  ListContestsQuery,
  Page,
  ProblemDetail,
  SubmissionSummary,
  UserProblemStatus,
} from '@arbiter/shared';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { AuthUser } from '../../middleware/auth';
import { conflict, forbidden, notFound } from '../../lib/errors';
import { paginate, toPage } from '../../lib/pagination';
import { clock, contestStatus, toIso } from '../../lib/time';
import { problemDetailInclude, problemDetailOmit, toProblemDetail } from '../problems/mappers';
import { submissionSummarySelect, toSubmissionSummary } from '../submissions/mappers';

/**
 * Public contest reads and registration (spec sections 9 and 10). Visibility: published
 * contests for everyone, unpublished ones for admins only; problems are hidden from non-admins
 * until startsAt. Only NORMAL submissions count (R7). Owner: lane A3b.
 */

type Viewer = AuthUser | undefined;
const isAdmin = (viewer: Viewer) => viewer?.role === 'ADMIN';

const summaryInclude = (viewer: Viewer) =>
  ({
    _count: { select: { problems: true, registrations: true } },
    // Only the viewer's own registration (none for guests): drives isRegistered.
    registrations: { where: { userId: viewer?.id ?? '' }, select: { userId: true } },
  }) satisfies Prisma.ContestInclude;

type ContestWithCounts = Prisma.ContestGetPayload<{
  include: {
    _count: { select: { problems: true; registrations: true } };
    registrations: { select: { userId: true } };
  };
}>;

function toSummary(contest: ContestWithCounts, now: Date): ContestSummary {
  return {
    slug: contest.slug,
    title: contest.title,
    startsAt: toIso(contest.startsAt),
    endsAt: toIso(contest.endsAt),
    status: contestStatus(contest, now),
    problemCount: contest._count.problems,
    participantCount: contest._count.registrations,
    isRegistered: contest.registrations.length > 0,
    rated: contest.ratedAt !== null,
  };
}

function statusWhere(
  status: ListContestsQuery['status'],
  now: Date,
): { where: Prisma.ContestWhereInput; orderBy: Prisma.ContestOrderByWithRelationInput[] } {
  switch (status) {
    case 'upcoming':
      return { where: { startsAt: { gt: now } }, orderBy: [{ startsAt: 'asc' }] };
    case 'running':
      return {
        where: { startsAt: { lte: now }, endsAt: { gt: now } },
        orderBy: [{ endsAt: 'asc' }],
      };
    case 'past':
      return { where: { endsAt: { lte: now } }, orderBy: [{ endsAt: 'desc' }] };
    default:
      return { where: {}, orderBy: [{ startsAt: 'desc' }] };
  }
}

/** GET /api/contests: published contests, filtered by status. */
export async function listContests(
  prisma: PrismaClient,
  status: ListContestsQuery['status'],
  viewer: Viewer,
): Promise<ContestSummary[]> {
  const now = clock.now();
  const { where, orderBy } = statusWhere(status, now);
  const contests = await prisma.contest.findMany({
    where: { ...where, isPublished: true },
    orderBy: [...orderBy, { id: 'asc' }],
    include: summaryInclude(viewer),
  });
  return contests.map((contest) => toSummary(contest, now));
}

/** A contest the viewer may see, by slug (404 otherwise). */
export async function findVisibleContest(prisma: PrismaClient, slug: string, viewer: Viewer) {
  const contest = await prisma.contest.findUnique({ where: { slug } });
  if (!contest || (!contest.isPublished && !isAdmin(viewer))) {
    throw notFound('Contest not found');
  }
  return contest;
}

/**
 * Per problem: distinct users with an AC (solvedCount) and distinct users with any contest
 * submission (attemptedCount), plus the viewer's own status from their contest submissions.
 */
async function problemStats(prisma: PrismaClient, contestId: string, viewer: Viewer) {
  const groups = await prisma.submission.groupBy({
    by: ['problemId', 'userId'],
    where: { contestId, kind: 'NORMAL' },
    _count: { _all: true },
  });
  const accepted = await prisma.submission.groupBy({
    by: ['problemId', 'userId'],
    where: { contestId, kind: 'NORMAL', status: 'DONE', verdict: 'AC' },
    _count: { _all: true },
  });
  const solvedKeys = new Set(accepted.map((g) => `${g.problemId}:${g.userId}`));
  const stats = new Map<
    string,
    { solved: number; attempted: number; userStatus: UserProblemStatus | null }
  >();
  for (const g of groups) {
    const entry = stats.get(g.problemId) ?? { solved: 0, attempted: 0, userStatus: null };
    const solved = solvedKeys.has(`${g.problemId}:${g.userId}`);
    entry.attempted += 1;
    if (solved) entry.solved += 1;
    if (viewer && g.userId === viewer.id) entry.userStatus = solved ? 'SOLVED' : 'ATTEMPTED';
    stats.set(g.problemId, entry);
  }
  return stats;
}

/** GET /api/contests/:slug */
export async function getContestDetail(
  prisma: PrismaClient,
  slug: string,
  viewer: Viewer,
): Promise<ContestDetail> {
  const found = await findVisibleContest(prisma, slug, viewer);
  const now = clock.now();
  const contest = await prisma.contest.findUniqueOrThrow({
    where: { id: found.id },
    include: {
      ...summaryInclude(viewer),
      problems: {
        orderBy: { ordinal: 'asc' },
        include: { problem: { select: { slug: true, title: true } } },
      },
    },
  });
  const showProblems = isAdmin(viewer) || now.getTime() >= contest.startsAt.getTime();
  let problems: ContestProblemItem[] | null = null;
  if (showProblems) {
    const stats = await problemStats(prisma, contest.id, viewer);
    problems = contest.problems.map((cp) => {
      const s = stats.get(cp.problemId);
      return {
        label: cp.label,
        title: cp.problem.title,
        slug: cp.problem.slug,
        solvedCount: s?.solved ?? 0,
        attemptedCount: s?.attempted ?? 0,
        userStatus: s?.userStatus ?? null,
      };
    });
  }
  return {
    ...toSummary(contest, now),
    descriptionMd: contest.descriptionMd,
    penaltyMinutes: contest.penaltyMinutes,
    serverTime: toIso(now),
    problems,
  };
}

/** POST /api/contests/:slug/register: allowed until endsAt; 409 when already registered. */
export async function registerForContest(
  prisma: PrismaClient,
  slug: string,
  viewer: AuthUser,
): Promise<void> {
  const contest = await findVisibleContest(prisma, slug, viewer);
  if (contestStatus(contest, clock.now()) === 'ENDED') {
    throw forbidden('Registration is closed: the contest has ended');
  }
  try {
    await prisma.contestRegistration.create({
      data: { contestId: contest.id, userId: viewer.id },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw conflict('You are already registered for this contest');
    }
    throw error;
  }
}

/** GET /api/contests/:slug/problems/:label (after the start, or for admins). */
export async function getContestProblem(
  prisma: PrismaClient,
  slug: string,
  label: string,
  viewer: Viewer,
): Promise<ProblemDetail> {
  const contest = await findVisibleContest(prisma, slug, viewer);
  if (!isAdmin(viewer) && clock.now().getTime() < contest.startsAt.getTime()) {
    throw notFound('The contest has not started yet');
  }
  const link = await prisma.contestProblem.findUnique({
    where: { contestId_label: { contestId: contest.id, label: label.toUpperCase() } },
    include: { problem: { include: problemDetailInclude, omit: problemDetailOmit } },
  });
  if (!link) throw notFound('Problem not found in this contest');

  let userStatus: UserProblemStatus | null = null;
  if (viewer) {
    const mine = await prisma.submission.findMany({
      where: {
        contestId: contest.id,
        problemId: link.problemId,
        userId: viewer.id,
        kind: 'NORMAL',
      },
      select: { status: true, verdict: true },
    });
    if (mine.some((s) => s.status === 'DONE' && s.verdict === 'AC')) userStatus = 'SOLVED';
    else if (mine.length > 0) userStatus = 'ATTEMPTED';
  }
  return toProblemDetail(link.problem, {
    userStatus,
    contest: { slug: contest.slug, label: link.label },
  });
}

/**
 * GET /api/contests/:slug/submissions. While the contest runs, non-admins see only their own
 * submissions; after the end everyone's are visible as metadata (spec section 9).
 */
export async function listContestSubmissions(
  prisma: PrismaClient,
  slug: string,
  query: { page: number; pageSize: number; mine?: boolean },
  viewer: AuthUser,
): Promise<Page<SubmissionSummary>> {
  const contest = await findVisibleContest(prisma, slug, viewer);
  const onlyMine =
    query.mine === true || (!isAdmin(viewer) && contestStatus(contest, clock.now()) !== 'ENDED');
  const where: Prisma.SubmissionWhereInput = {
    contestId: contest.id,
    kind: 'NORMAL',
    ...(onlyMine ? { userId: viewer.id } : {}),
  };
  const { skip, take, page, pageSize } = paginate(query);
  const [rows, total] = await Promise.all([
    prisma.submission.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take,
      select: submissionSummarySelect,
    }),
    prisma.submission.count({ where }),
  ]);
  return toPage(rows.map(toSubmissionSummary), total, { page, pageSize });
}
