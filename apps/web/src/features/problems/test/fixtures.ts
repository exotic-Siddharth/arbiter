// Test fixtures for the problems feature (shared by the page, workspace and component tests).
import type {
  ContestDetail,
  Me,
  ProblemDetail,
  ProblemPage,
  ProblemSummary,
  TagCount,
} from '@arbiter/shared';

export const demoUser: Me = {
  id: 'u_demo',
  username: 'demo',
  email: 'demo@arbiter.dev',
  role: 'USER',
  rating: 1432,
  bio: null,
  createdAt: '2026-10-01T09:00:00.000Z',
};

export const adminUser: Me = {
  ...demoUser,
  id: 'u_admin',
  username: 'admin',
  email: 'admin@arbiter.dev',
  role: 'ADMIN',
  rating: 2210,
};

export function problemSummary(overrides: Partial<ProblemSummary> = {}): ProblemSummary {
  return {
    slug: 'lantern-relay',
    title: 'Lantern Relay',
    difficulty: 'EASY',
    tags: ['prefix-sums'],
    acceptanceRate: 0.62,
    submissionCount: 812,
    acceptedCount: 503,
    userStatus: null,
    ...overrides,
  };
}

export const problemSummaries: ProblemSummary[] = [
  problemSummary({ userStatus: 'SOLVED' }),
  problemSummary({
    slug: 'orchard-partition',
    title: 'Orchard Partition',
    difficulty: 'MEDIUM',
    tags: ['dp', 'binary-search'],
    acceptanceRate: 0.43,
    submissionCount: 377,
    acceptedCount: 162,
    userStatus: 'ATTEMPTED',
  }),
  problemSummary({
    slug: 'signal-towers',
    title: 'Signal Towers',
    difficulty: 'HARD',
    tags: ['graphs', 'dijkstra', 'greedy', 'heap'],
    acceptanceRate: 0.189,
    submissionCount: 129,
    acceptedCount: 24,
  }),
];

export function problemPage(
  items: ProblemSummary[] = problemSummaries,
  { page = 1, pageSize = 20, total = items.length }: Partial<Omit<ProblemPage, 'items'>> = {},
): ProblemPage {
  return { items, page, pageSize, total };
}

export const tagCounts: TagCount[] = [
  { name: 'binary-search', count: 2 },
  { name: 'dp', count: 4 },
  { name: 'graphs', count: 3 },
  { name: 'prefix-sums', count: 1 },
];

export function problemDetail(overrides: Partial<ProblemDetail> = {}): ProblemDetail {
  return {
    ...problemSummary(),
    statementMd:
      'A relay of $n$ lanterns runs along the harbour wall.\n\n## Input\n\nThe first line holds $n$.\n\n## Output\n\nPrint the total brightness.',
    timeLimitMs: 1000,
    memoryLimitMb: 256,
    checker: 'TOKENS',
    samples: [
      {
        ordinal: 1,
        input: '5\n3 1 4 1 5\n',
        expectedOutput: '14\n',
        explanation: 'Every lantern is lit, so the brightness is $3+1+4+1+5$.',
      },
      { ordinal: 2, input: '1\n7\n', expectedOutput: '7\n', explanation: null },
    ],
    ...overrides,
  };
}

export function contestDetail(overrides: Partial<ContestDetail> = {}): ContestDetail {
  const now = Date.now();
  return {
    slug: 'weekly-practice-arena',
    title: 'Weekly Practice Arena',
    startsAt: new Date(now - 60 * 60_000).toISOString(),
    endsAt: new Date(now + 2 * 60 * 60_000).toISOString(),
    status: 'RUNNING',
    problemCount: 3,
    participantCount: 11,
    isRegistered: true,
    rated: false,
    descriptionMd: 'Four fresh problems, two weeks, no pressure.',
    penaltyMinutes: 20,
    serverTime: new Date(now).toISOString(),
    problems: [
      {
        label: 'A',
        title: 'Lantern Relay',
        slug: 'lantern-relay',
        solvedCount: 8,
        attemptedCount: 10,
        userStatus: 'SOLVED',
      },
      {
        label: 'B',
        title: 'Orchard Partition',
        slug: 'orchard-partition',
        solvedCount: 3,
        attemptedCount: 7,
        userStatus: 'ATTEMPTED',
      },
      {
        label: 'C',
        title: 'Signal Towers',
        slug: 'signal-towers',
        solvedCount: 0,
        attemptedCount: 2,
        userStatus: null,
      },
    ],
    ...overrides,
  };
}
