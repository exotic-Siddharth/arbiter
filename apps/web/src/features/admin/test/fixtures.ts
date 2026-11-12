import type {
  AdminContest,
  AdminProblem,
  AdminUser,
  JudgeStatus,
  Me,
  PlagiarismReportDetail,
} from '@arbiter/shared';

export const adminUser: Me = {
  id: 'u_admin',
  username: 'root',
  email: 'root@arbiter.dev',
  role: 'ADMIN',
  rating: 1800,
  bio: null,
  createdAt: '2026-01-02T09:00:00.000Z',
};

export function adminUserRow(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: 'u_1',
    username: 'priya_k',
    email: 'priya.k@example.com',
    role: 'USER',
    rating: 1534,
    submissionCount: 87,
    createdAt: '2026-03-14T10:00:00.000Z',
    ...overrides,
  };
}

export function judgeStatus(now: number, overrides: Partial<JudgeStatus> = {}): JudgeStatus {
  const minute = 60_000;
  const start = Math.floor(now / minute) * minute - 29 * minute;
  const counts = [
    0, 1, 0, 2, 3, 5, 4, 0, 0, 7, 12, 9, 6, 3, 2, 1, 0, 0, 4, 8, 15, 11, 6, 3, 2, 5, 9, 4, 2, 1,
  ];
  return {
    queues: {
      judge: { waiting: 3, active: 2, completed: 1480, failed: 1, delayed: 0 },
      run: { waiting: 0, active: 1, completed: 5120, failed: 0, delayed: 0 },
      plagiarism: { waiting: 0, active: 0, completed: 4, failed: 0, delayed: 0 },
    },
    workers: [
      {
        id: 'worker-7f3a@arbiter-host',
        startedAt: new Date(now - 3 * 3_600_000).toISOString(),
        lastSeen: new Date(now - 2000).toISOString(),
        concurrency: 4,
        processed: 1503,
      },
    ],
    latency: { p50Ms: 840, p95Ms: 3120, sample: 200 },
    throughputPerMin: counts.map((count, index) => ({
      minute: new Date(start + index * minute).toISOString(),
      count,
    })),
    ...overrides,
  };
}

export function adminContest(overrides: Partial<AdminContest> = {}): AdminContest {
  return {
    id: 'c_1',
    slug: 'autumn-sprint',
    title: 'Autumn Sprint #4',
    descriptionMd: 'Three problems.',
    startsAt: '2026-10-01T10:00:00.000Z',
    endsAt: '2026-10-01T12:00:00.000Z',
    isPublished: true,
    penaltyMinutes: 20,
    ratedAt: null,
    status: 'ENDED',
    participantCount: 48,
    pendingSubmissions: 0,
    problems: [
      { problemId: 'p1', label: 'A', ordinal: 0, slug: 'lantern-rows', title: 'Lantern Rows' },
      { problemId: 'p2', label: 'B', ordinal: 1, slug: 'ferry-schedule', title: 'Ferry Schedule' },
    ],
    createdAt: '2026-09-20T10:00:00.000Z',
    updatedAt: '2026-09-25T10:00:00.000Z',
    ...overrides,
  };
}

export function adminProblem(overrides: Partial<AdminProblem> = {}): AdminProblem {
  return {
    id: 'p_1',
    slug: 'lantern-rows',
    title: 'Lantern Rows',
    statementMd: 'Count the lanterns.',
    difficulty: 'EASY',
    timeLimitMs: 1000,
    memoryLimitMb: 256,
    checker: 'TOKENS',
    floatTolerance: null,
    isPublished: false,
    tags: ['math'],
    referenceLanguage: 'PYTHON',
    referenceSolution: 'print(1)\n',
    testCount: 2,
    sampleCount: 1,
    submissionCount: 0,
    acceptedCount: 0,
    createdAt: '2026-09-20T10:00:00.000Z',
    updatedAt: '2026-09-25T10:00:00.000Z',
    ...overrides,
  };
}

export function plagiarismReport(
  overrides: Partial<PlagiarismReportDetail> = {},
): PlagiarismReportDetail {
  const code = [
    '#include <bits/stdc++.h>',
    'using namespace std;',
    'int main() {',
    '  int n; cin >> n;',
    '  cout << n * 2;',
    '}',
  ];
  return {
    id: 'r_1',
    contestId: 'c_1',
    contestSlug: 'autumn-sprint',
    contestTitle: 'Autumn Sprint #4',
    problemId: null,
    threshold: 0.6,
    status: 'DONE',
    error: null,
    pairCount: 2,
    createdAt: '2026-10-02T10:00:00.000Z',
    finishedAt: '2026-10-02T10:00:05.000Z',
    pairs: [
      {
        id: 'pair_hi',
        problemId: 'p1',
        problemSlug: 'lantern-rows',
        problemTitle: 'Lantern Rows',
        similarity: 0.94,
        a: {
          submissionId: 's1',
          username: 'mira',
          language: 'CPP',
          sourceCode: code.join('\n') + '\n',
          matchedLines: [3, 4, 5],
        },
        b: {
          submissionId: 's2',
          username: 'jonas',
          language: 'CPP',
          sourceCode: code.join('\n'),
          matchedLines: [3, 4, 5],
        },
      },
      {
        id: 'pair_lo',
        problemId: 'p2',
        problemSlug: 'ferry-schedule',
        problemTitle: 'Ferry Schedule',
        similarity: 0.71,
        a: {
          submissionId: 's3',
          username: 'ana',
          language: 'PYTHON',
          sourceCode: 'print(1)\n',
          matchedLines: [1],
        },
        b: {
          submissionId: 's4',
          username: 'li',
          language: 'PYTHON',
          sourceCode: 'print(1)\n',
          matchedLines: [1],
        },
      },
    ],
    ...overrides,
  };
}
