// Test fixtures for submissions (summaries, details and paged lists).
import type { SubmissionDetail, SubmissionPage, SubmissionSummary } from '@arbiter/shared';

export function submissionSummary(overrides: Partial<SubmissionSummary> = {}): SubmissionSummary {
  return {
    id: 'sub_lantern_1',
    problem: { slug: 'lantern-relay', title: 'Lantern Relay' },
    user: { username: 'demo' },
    language: 'PYTHON',
    status: 'DONE',
    verdict: 'AC',
    timeMs: 48,
    memoryKb: 9216,
    testsPassed: 12,
    testsTotal: 12,
    contestSlug: null,
    createdAt: '2026-11-08T09:15:00.000Z',
    judgedAt: '2026-11-08T09:15:04.000Z',
    ...overrides,
  };
}

export function submissionDetail(overrides: Partial<SubmissionDetail> = {}): SubmissionDetail {
  return {
    ...submissionSummary(),
    sourceCode: 'import sys\n\nprint(sum(map(int, sys.stdin.read().split()[1:])))\n',
    compileOutput: null,
    results: [],
    failedSample: null,
    ...overrides,
  };
}

export function submissionPage(
  items: SubmissionSummary[],
  { page = 1, pageSize = 20, total = items.length }: Partial<Omit<SubmissionPage, 'items'>> = {},
): SubmissionPage {
  return { items, page, pageSize, total };
}
