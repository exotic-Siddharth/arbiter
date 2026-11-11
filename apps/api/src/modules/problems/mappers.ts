import type {
  ProblemDetail,
  ProblemSample,
  ProblemSummary,
  UserProblemStatus,
} from '@arbiter/shared';
import type { Prisma, Problem, TestCase } from '@prisma/client';

/**
 * Pure mappers from Prisma rows to the shared problem schemas (spec section 10).
 * Lane A3b uses toProblemDetail for GET /api/contests/:slug/problems/:label.
 */

/** Prisma `include` that loads what toProblemSummary needs. */
export const problemSummaryInclude = {
  tags: { include: { tag: { select: { name: true } } } },
} satisfies Prisma.ProblemInclude;

/** Prisma `include` that loads what toProblemDetail needs (sample tests only, in ordinal order). */
export const problemDetailInclude = {
  tags: { include: { tag: { select: { name: true } } } },
  testCases: { where: { isSample: true }, orderBy: { ordinal: 'asc' } },
} satisfies Prisma.ProblemInclude;

/** The fields toProblemSummary reads. Any row loaded with problemSummaryInclude fits. */
export type ProblemSummaryRow = Pick<
  Problem,
  'slug' | 'title' | 'difficulty' | 'submissionCount' | 'acceptedCount'
> & { tags: { tag: { name: string } }[] };

/** The fields toProblemDetail reads. Any row loaded with problemDetailInclude fits. */
export type ProblemDetailRow = ProblemSummaryRow &
  Pick<Problem, 'statementMd' | 'timeLimitMs' | 'memoryLimitMb' | 'checker'> & {
    testCases: Pick<
      TestCase,
      'ordinal' | 'input' | 'expectedOutput' | 'isSample' | 'explanation'
    >[];
  };

export interface ProblemDetailOptions {
  /** The viewer's status on this problem (null for guests or when never submitted). */
  userStatus?: UserProblemStatus | null;
  /** Set when the problem is served through a contest route. */
  contest?: { slug: string; label: string };
}

/** acceptedCount / submissionCount in 0..1 (0 when there are no submissions). */
export function acceptanceRate(acceptedCount: number, submissionCount: number): number {
  if (submissionCount <= 0) return 0;
  return Math.min(1, Math.max(0, acceptedCount / submissionCount));
}

const tagNames = (row: ProblemSummaryRow): string[] =>
  row.tags.map((link) => link.tag.name).sort((a, b) => a.localeCompare(b));

export function toProblemSummary(
  row: ProblemSummaryRow,
  userStatus: UserProblemStatus | null = null,
): ProblemSummary {
  return {
    slug: row.slug,
    title: row.title,
    difficulty: row.difficulty,
    tags: tagNames(row),
    acceptanceRate: acceptanceRate(row.acceptedCount, row.submissionCount),
    submissionCount: row.submissionCount,
    acceptedCount: row.acceptedCount,
    userStatus,
  };
}

/**
 * ProblemDetail with samples only: rows with isSample=false are dropped here even if the caller
 * loaded them, so hidden tests can never leak through this mapper.
 */
export function toProblemDetail(
  row: ProblemDetailRow,
  options: ProblemDetailOptions = {},
): ProblemDetail {
  const samples: ProblemSample[] = row.testCases
    .filter((test) => test.isSample)
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((test) => ({
      ordinal: test.ordinal,
      input: test.input,
      expectedOutput: test.expectedOutput,
      explanation: test.explanation ?? null,
    }));
  return {
    ...toProblemSummary(row, options.userStatus ?? null),
    statementMd: row.statementMd,
    timeLimitMs: row.timeLimitMs,
    memoryLimitMb: row.memoryLimitMb,
    checker: row.checker,
    samples,
    ...(options.contest ? { contest: options.contest } : {}),
  };
}
