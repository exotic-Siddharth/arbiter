import type { FailedSample, SubmissionDetail, SubmissionSummary } from '@arbiter/shared';
import type { Prisma, Submission, SubmissionTestResult, TestCase } from '@prisma/client';
import { toIso, toIsoOrNull } from '../../lib/time';

/**
 * Pure mappers from Prisma rows to the shared submission schemas (spec section 10).
 * Lane A3b uses toSubmissionSummary for GET /api/contests/:slug/submissions.
 */

/**
 * Prisma `select` that loads exactly what toSubmissionSummary reads (no sourceCode or
 * compileOutput: lists must not materialise them).
 */
export const submissionSummarySelect = {
  id: true,
  language: true,
  status: true,
  verdict: true,
  timeMs: true,
  memoryKb: true,
  testsPassed: true,
  testsTotal: true,
  createdAt: true,
  judgedAt: true,
  problem: { select: { slug: true, title: true } },
  user: { select: { username: true } },
  contest: { select: { slug: true } },
} satisfies Prisma.SubmissionSelect;

/** Prisma `include` that loads what toSubmissionDetail needs. */
export const submissionDetailInclude = {
  problem: {
    select: {
      slug: true,
      title: true,
      testCases: {
        where: { isSample: true },
        select: { ordinal: true, input: true, expectedOutput: true },
      },
    },
  },
  user: { select: { username: true } },
  contest: { select: { slug: true } },
  results: { orderBy: { ordinal: 'asc' } },
} satisfies Prisma.SubmissionInclude;

/** The fields toSubmissionSummary reads. Any row loaded with submissionSummarySelect fits. */
export type SubmissionSummaryRow = Pick<
  Submission,
  | 'id'
  | 'language'
  | 'status'
  | 'verdict'
  | 'timeMs'
  | 'memoryKb'
  | 'testsPassed'
  | 'testsTotal'
  | 'createdAt'
  | 'judgedAt'
> & {
  problem: { slug: string; title: string };
  user: { username: string };
  contest: { slug: string } | null;
};

/** The fields toSubmissionDetail reads. Any row loaded with submissionDetailInclude fits. */
export type SubmissionDetailRow = SubmissionSummaryRow &
  Pick<Submission, 'sourceCode' | 'compileOutput' | 'errorMessage'> & {
    problem: {
      slug: string;
      title: string;
      /** The problem's sample tests (used for failedSample). */
      testCases: Pick<TestCase, 'ordinal' | 'input' | 'expectedOutput'>[];
    };
    results: Pick<
      SubmissionTestResult,
      'ordinal' | 'verdict' | 'timeMs' | 'memoryKb' | 'isSample' | 'outputPreview' | 'stderrPreview'
    >[];
  };

export interface SubmissionViewer {
  /** Owner or admin: may see sourceCode, compileOutput and failedSample. */
  canSeeSource: boolean;
  /** Admins also get errorMessage. */
  isAdmin: boolean;
}

export function toSubmissionSummary(row: SubmissionSummaryRow): SubmissionSummary {
  return {
    id: row.id,
    problem: { slug: row.problem.slug, title: row.problem.title },
    user: { username: row.user.username },
    language: row.language,
    status: row.status,
    verdict: row.verdict,
    timeMs: row.timeMs,
    memoryKb: row.memoryKb,
    testsPassed: row.testsPassed,
    testsTotal: row.testsTotal,
    contestSlug: row.contest?.slug ?? null,
    createdAt: toIso(row.createdAt),
    judgedAt: toIsoOrNull(row.judgedAt),
  };
}

/** The first failing sample test (by ordinal) with its data, or null. */
function failedSampleOf(row: SubmissionDetailRow): FailedSample | null {
  const failed = [...row.results]
    .sort((a, b) => a.ordinal - b.ordinal)
    .find((result) => result.isSample && result.verdict !== 'AC');
  if (!failed) return null;
  const test = row.problem.testCases.find((t) => t.ordinal === failed.ordinal);
  if (!test) return null;
  return {
    ordinal: failed.ordinal,
    input: test.input,
    expectedOutput: test.expectedOutput,
    actualOutput: failed.outputPreview ?? '',
    stderr: failed.stderrPreview ?? '',
  };
}

/**
 * SubmissionDetail. sourceCode, compileOutput and failedSample are null unless the viewer is the
 * owner or an admin; errorMessage is present for admins only (omitted otherwise).
 */
export function toSubmissionDetail(
  row: SubmissionDetailRow,
  viewer: SubmissionViewer,
): SubmissionDetail {
  return {
    ...toSubmissionSummary(row),
    sourceCode: viewer.canSeeSource ? row.sourceCode : null,
    compileOutput: viewer.canSeeSource ? row.compileOutput : null,
    results: [...row.results]
      .sort((a, b) => a.ordinal - b.ordinal)
      .map((result) => ({
        ordinal: result.ordinal,
        verdict: result.verdict,
        timeMs: result.timeMs,
        memoryKb: result.memoryKb,
        isSample: result.isSample,
      })),
    failedSample: viewer.canSeeSource ? failedSampleOf(row) : null,
    ...(viewer.isAdmin ? { errorMessage: row.errorMessage } : {}),
  };
}
