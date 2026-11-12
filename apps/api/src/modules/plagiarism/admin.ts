import type {
  CreatePlagiarismBody,
  PlagiarismPair,
  PlagiarismReportDetail,
  PlagiarismReportSummary,
  PlagiarismSide,
} from '@arbiter/shared';
import type { Prisma, PrismaClient } from '@prisma/client';
import { enqueuePlagiarism } from '../../judge/queue';
import { notFound } from '../../lib/errors';
import { toIso, toIsoOrNull } from '../../lib/time';

/** Admin plagiarism reports (spec section 10, /api/admin/plagiarism). Owner: lane A3b. */

const summaryInclude = {
  contest: { select: { slug: true, title: true } },
  _count: { select: { pairs: true } },
} satisfies Prisma.PlagiarismReportInclude;

type ReportRow = Prisma.PlagiarismReportGetPayload<{ include: typeof summaryInclude }>;

function toSummary(row: ReportRow): PlagiarismReportSummary {
  return {
    id: row.id,
    contestId: row.contestId,
    contestSlug: row.contest?.slug ?? null,
    contestTitle: row.contest?.title ?? null,
    problemId: row.problemId,
    threshold: row.threshold,
    status: row.status,
    error: row.error,
    pairCount: row._count.pairs,
    createdAt: toIso(row.createdAt),
    finishedAt: toIsoOrNull(row.finishedAt),
  };
}

/** POST /api/admin/plagiarism: creates a PENDING report and enqueues it. */
export async function createPlagiarismReport(
  prisma: PrismaClient,
  body: CreatePlagiarismBody,
): Promise<{ reportId: string }> {
  const contest = await prisma.contest.findUnique({
    where: { id: body.contestId },
    select: { id: true },
  });
  if (!contest) throw notFound('Contest not found');
  if (body.problemId) {
    const link = await prisma.contestProblem.findUnique({
      where: { contestId_problemId: { contestId: contest.id, problemId: body.problemId } },
    });
    if (!link) throw notFound('Problem not found in this contest');
  }
  const report = await prisma.plagiarismReport.create({
    data: { contestId: contest.id, problemId: body.problemId ?? null, threshold: body.threshold },
  });
  try {
    await enqueuePlagiarism(report.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.plagiarismReport.update({
      where: { id: report.id },
      data: { status: 'FAILED', error: `Could not enqueue the job: ${message}`.slice(0, 1000) },
    });
    throw error;
  }
  return { reportId: report.id };
}

/** GET /api/admin/plagiarism?contestId: newest first. */
export async function listPlagiarismReports(
  prisma: PrismaClient,
  contestId: string | undefined,
): Promise<PlagiarismReportSummary[]> {
  const rows = await prisma.plagiarismReport.findMany({
    where: contestId ? { contestId } : {},
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: summaryInclude,
    take: 200,
  });
  return rows.map(toSummary);
}

/** The detail response carries at most this many pairs (highest similarity first). */
export const MAX_DETAIL_PAIRS = 200;

const asLines = (value: Prisma.JsonValue): number[] =>
  Array.isArray(value)
    ? value.filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0)
    : [];

/**
 * GET /api/admin/plagiarism/:id: the top MAX_DETAIL_PAIRS pairs by similarity (highest first,
 * ties by id), with both sources; `pairCount` is the total stored.
 */
export async function getPlagiarismReport(
  prisma: PrismaClient,
  id: string,
): Promise<PlagiarismReportDetail> {
  const row = await prisma.plagiarismReport.findUnique({ where: { id }, include: summaryInclude });
  if (!row) throw notFound('Report not found');

  // Light rows, read in ordered pages of MAX_DETAIL_PAIRS: pairs whose submissions or problem were
  // deleted since the run are left out before the cap, and another page is read only while they
  // leave fewer than MAX_DETAIL_PAIRS kept. Sources and matched lines are loaded for the kept set.
  const keptIds: string[] = [];
  for (let skip = 0; keptIds.length < MAX_DETAIL_PAIRS; skip += MAX_DETAIL_PAIRS) {
    const page = await prisma.plagiarismPair.findMany({
      where: { reportId: id },
      orderBy: [{ similarity: 'desc' }, { id: 'asc' }],
      select: { id: true, problemId: true, submissionAId: true, submissionBId: true },
      skip,
      take: MAX_DETAIL_PAIRS,
    });
    const [existingSubmissions, existingProblems] = await Promise.all([
      prisma.submission.findMany({
        where: {
          id: { in: [...new Set(page.flatMap((p) => [p.submissionAId, p.submissionBId]))] },
        },
        select: { id: true },
      }),
      prisma.problem.findMany({
        where: { id: { in: [...new Set(page.map((p) => p.problemId))] } },
        select: { id: true },
      }),
    ]);
    const submissionIds = new Set(existingSubmissions.map((s) => s.id));
    const problemIds = new Set(existingProblems.map((p) => p.id));
    for (const p of page) {
      if (
        keptIds.length < MAX_DETAIL_PAIRS &&
        submissionIds.has(p.submissionAId) &&
        submissionIds.has(p.submissionBId) &&
        problemIds.has(p.problemId)
      ) {
        keptIds.push(p.id);
      }
    }
    if (page.length < MAX_DETAIL_PAIRS) break;
  }

  const rows = await prisma.plagiarismPair.findMany({
    where: { id: { in: keptIds } },
    orderBy: [{ similarity: 'desc' }, { id: 'asc' }],
  });
  const [submissions, problems] = await Promise.all([
    prisma.submission.findMany({
      where: { id: { in: [...new Set(rows.flatMap((p) => [p.submissionAId, p.submissionBId]))] } },
      select: { id: true, language: true, sourceCode: true, user: { select: { username: true } } },
    }),
    prisma.problem.findMany({
      where: { id: { in: [...new Set(rows.map((p) => p.problemId))] } },
      select: { id: true, slug: true, title: true },
    }),
  ]);
  const submissionById = new Map(submissions.map((s) => [s.id, s]));
  const problemById = new Map(problems.map((p) => [p.id, p]));

  const side = (submissionId: string, lines: Prisma.JsonValue): PlagiarismSide | null => {
    const s = submissionById.get(submissionId);
    if (!s) return null;
    return {
      submissionId,
      username: s.user.username,
      language: s.language,
      sourceCode: s.sourceCode,
      matchedLines: asLines(lines),
    };
  };

  const pairs: PlagiarismPair[] = rows.flatMap((pair) => {
    const a = side(pair.submissionAId, pair.matchedLinesA);
    const b = side(pair.submissionBId, pair.matchedLinesB);
    const problem = problemById.get(pair.problemId);
    if (!a || !b || !problem) return [];
    return [
      {
        id: pair.id,
        problemId: pair.problemId,
        problemSlug: problem.slug,
        problemTitle: problem.title,
        similarity: Math.min(1, Math.max(0, pair.similarity)),
        a,
        b,
      },
    ];
  });

  return { ...toSummary(row), pairs };
}
