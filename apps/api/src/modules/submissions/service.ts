import type {
  CreateSubmissionBody,
  ListSubmissionsQuery,
  SubmissionDetail,
  SubmissionPage,
  SubmissionSummary,
} from '@arbiter/shared';
import type { Prisma, PrismaClient } from '@prisma/client';
import { enqueueSubmission } from '../../judge/queue';
import { forbidden, internal, notFound, unauthorized } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { paginate, toPage } from '../../lib/pagination';
import { clock, contestStatus } from '../../lib/time';
import { emitter } from '../../realtime/emitter';
import { recomputeRow } from '../contests/scoreboard';
import {
  submissionDetailInclude,
  submissionSummarySelect,
  toSubmissionDetail,
  toSubmissionSummary,
} from './mappers';

export interface Viewer {
  id: string;
  role: 'USER' | 'ADMIN';
}

const isAdmin = (viewer: Viewer | undefined) => viewer?.role === 'ADMIN';

/**
 * Problems whose submissions non-admins may see: published ones, and those of a published contest
 * that has started (the same rule as R11), so drafts and not-yet-started contest problems never
 * leak through submission lists.
 */
const visibleProblem = (now: Date): Prisma.ProblemWhereInput => ({
  OR: [
    { isPublished: true },
    { contestProblems: { some: { contest: { isPublished: true, startsAt: { lte: now } } } } },
  ],
});

/**
 * Non-admin visibility (spec section 9): during a running contest, other users' contest
 * submissions are hidden; after the end they are visible as metadata. Own submissions are always
 * visible.
 */
function visibleTo(viewer: Viewer | undefined, now: Date): Prisma.SubmissionWhereInput {
  const others: Prisma.SubmissionWhereInput = {
    AND: [
      { OR: [{ contestId: null }, { contest: { endsAt: { lte: now } } }] },
      { problem: visibleProblem(now) },
    ],
  };
  return viewer ? { OR: [{ userId: viewer.id }, others] } : others;
}

/** R3: after an in-window contest submission is stored, refresh its row so the cell shows pending. */
async function refreshScoreboardRow(
  contest: { id: string; slug: string },
  userId: string,
): Promise<void> {
  try {
    const row = await recomputeRow(contest.id, userId);
    if (row) emitter.emitScoreboardRow(contest.id, { contestSlug: contest.slug, row });
  } catch (error) {
    // The submission is stored and queued; the scoreboard catches up on the judge's update.
    logger.warn({ err: error, contestId: contest.id }, 'scoreboard update after submit failed');
  }
}

/**
 * Where a submission with `contestSlug` belongs (spec section 9):
 * running + registered = contest submission; ended = practice; not started or unregistered = 403.
 * The contest is checked before the problem, and a missing problem and one outside the contest
 * answer alike, so an upcoming contest's problem list (or a draft slug) cannot be probed.
 */
async function resolveContest(
  prisma: PrismaClient,
  contestSlug: string,
  problemSlug: string,
  viewer: Viewer,
): Promise<{ contest: { id: string; slug: string } | null; problemId: string }> {
  const contest = await prisma.contest.findUnique({
    where: { slug: contestSlug },
    select: {
      id: true,
      slug: true,
      isPublished: true,
      startsAt: true,
      endsAt: true,
      problems: { where: { problem: { slug: problemSlug } }, select: { problemId: true } },
    },
  });
  if (!contest || (!contest.isPublished && !isAdmin(viewer))) {
    throw notFound('Contest not found');
  }
  const status = contestStatus(contest, clock.now());
  if (status === 'UPCOMING') throw forbidden('The contest has not started yet');
  const member = contest.problems[0];
  if (!member) throw notFound('Problem not found');
  if (status === 'ENDED') return { contest: null, problemId: member.problemId };
  const registration = await prisma.contestRegistration.findUnique({
    where: { contestId_userId: { contestId: contest.id, userId: viewer.id } },
    select: { userId: true },
  });
  if (!registration) throw forbidden('Register for the contest to submit during it');
  return { contest: { id: contest.id, slug: contest.slug }, problemId: member.problemId };
}

/** POST /api/submissions: store a QUEUED submission and enqueue it for judging. */
export async function createSubmission(
  prisma: PrismaClient,
  body: CreateSubmissionBody,
  viewer: Viewer,
): Promise<SubmissionSummary> {
  let contest: { id: string; slug: string } | null = null;
  let where: Prisma.ProblemWhereUniqueInput = { slug: body.problemSlug };
  if (body.contestSlug !== undefined) {
    const resolved = await resolveContest(prisma, body.contestSlug, body.problemSlug, viewer);
    contest = resolved.contest;
    where = { id: resolved.problemId };
  }
  const problem = await prisma.problem.findUnique({
    where,
    select: { id: true, isPublished: true, _count: { select: { testCases: true } } },
  });
  if (!problem || (body.contestSlug === undefined && !problem.isPublished && !isAdmin(viewer))) {
    throw notFound('Problem not found');
  }

  let row = await prisma.submission.create({
    data: {
      kind: 'NORMAL',
      userId: viewer.id,
      problemId: problem.id,
      contestId: contest?.id ?? null,
      language: body.language,
      sourceCode: body.sourceCode,
      testsTotal: problem._count.testCases,
    },
    select: submissionSummarySelect,
  });

  let queueError: unknown;
  try {
    await enqueueSubmission(row.id);
  } catch (error) {
    queueError = error;
    // Never leave a submission QUEUED forever (Review Focus 4): end it as FAILED/IE.
    const detail = error instanceof Error ? error.message : String(error);
    row = await prisma.submission.update({
      where: { id: row.id },
      data: {
        status: 'FAILED',
        verdict: 'IE',
        judgedAt: clock.now(),
        errorMessage: `Could not queue the submission for judging: ${detail}`.slice(0, 2000),
      },
      select: submissionSummarySelect,
    });
  }

  if (contest) await refreshScoreboardRow(contest, viewer.id);
  if (queueError !== undefined) {
    logger.error({ err: queueError, submissionId: row.id }, 'enqueueSubmission failed');
    throw internal('The judge queue is unavailable; please try again shortly');
  }
  return toSubmissionSummary(row);
}

/** GET /api/submissions: NORMAL submissions only (R7), newest first. */
export async function listSubmissions(
  prisma: PrismaClient,
  query: ListSubmissionsQuery,
  viewer: Viewer | undefined,
): Promise<SubmissionPage> {
  if (query.mine && !viewer) throw unauthorized('Sign in to list your own submissions');
  const pagination = paginate(query);
  const and: Prisma.SubmissionWhereInput[] = [{ kind: 'NORMAL' }];
  if (query.mine && viewer) and.push({ userId: viewer.id });
  if (query.username) and.push({ user: { usernameLower: query.username.toLowerCase() } });
  if (query.problemSlug) and.push({ problem: { slug: query.problemSlug } });
  if (query.verdict) and.push({ verdict: query.verdict });
  if (query.language) and.push({ language: query.language });
  if (!isAdmin(viewer)) and.push(visibleTo(viewer, clock.now()));
  const where: Prisma.SubmissionWhereInput = { AND: and };

  const [total, rows] = await Promise.all([
    prisma.submission.count({ where }),
    prisma.submission.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: pagination.skip,
      take: pagination.take,
      select: submissionSummarySelect,
    }),
  ]);
  return toPage(rows.map(toSubmissionSummary), total, pagination);
}

const detailInclude = {
  ...submissionDetailInclude,
  contest: { select: { slug: true, endsAt: true } },
} satisfies Prisma.SubmissionInclude;

/**
 * GET /api/submissions/:id. REFERENCE submissions: owner or admin only (R7). Others' contest
 * submissions are hidden while the contest runs. Source, compile output and the failed sample are
 * for the owner or an admin; 404 (not 403) whenever the viewer may not see the submission.
 */
export async function getSubmissionDetail(
  prisma: PrismaClient,
  id: string,
  viewer: Viewer | undefined,
): Promise<SubmissionDetail> {
  const row = await prisma.submission.findUnique({ where: { id }, include: detailInclude });
  if (!row) throw notFound('Submission not found');
  const owner = viewer !== undefined && viewer.id === row.userId;
  const admin = isAdmin(viewer);
  if (!owner && !admin) {
    const now = clock.now();
    const hidden =
      row.kind !== 'NORMAL' ||
      (row.contest !== null && row.contest.endsAt.getTime() > now.getTime()) ||
      (await prisma.problem.count({ where: { id: row.problemId, ...visibleProblem(now) } })) === 0;
    if (hidden) throw notFound('Submission not found');
  }
  return toSubmissionDetail(row, { canSeeSource: owner || admin, isAdmin: admin });
}
