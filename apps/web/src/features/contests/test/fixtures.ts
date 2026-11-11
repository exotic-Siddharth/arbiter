import type { ContestDetail, Me, ScoreRow, Scoreboard } from '@arbiter/shared';

export const demoUser: Me = {
  id: 'u_demo',
  username: 'demo',
  email: 'demo@arbiter.dev',
  role: 'USER',
  rating: 1420,
  bio: null,
  createdAt: '2026-01-04T09:00:00.000Z',
};

const iso = (ms: number) => new Date(ms).toISOString();

/** A contest relative to a server clock `serverNow` (ms). */
export function contestDetail(
  serverNow: number,
  overrides: Partial<ContestDetail> = {},
): ContestDetail {
  const startsAt = serverNow - 30 * 60_000;
  return {
    slug: 'autumn-sprint',
    title: 'Autumn Sprint #4',
    startsAt: iso(startsAt),
    endsAt: iso(startsAt + 2 * 3_600_000),
    status: 'RUNNING',
    problemCount: 3,
    participantCount: 48,
    isRegistered: false,
    rated: false,
    descriptionMd: 'Three problems, two hours. **Good luck!**',
    penaltyMinutes: 20,
    serverTime: iso(serverNow),
    problems: [
      {
        label: 'A',
        title: 'Lantern Rows',
        slug: 'lantern-rows',
        solvedCount: 31,
        attemptedCount: 40,
        userStatus: null,
      },
      {
        label: 'B',
        title: 'Ferry Schedule',
        slug: 'ferry-schedule',
        solvedCount: 12,
        attemptedCount: 29,
        userStatus: null,
      },
      {
        label: 'C',
        title: 'Glacier Paths',
        slug: 'glacier-paths',
        solvedCount: 2,
        attemptedCount: 15,
        userStatus: null,
      },
    ],
    ...overrides,
  };
}

export function scoreRow(
  username: string,
  solved: number,
  penalty: number,
  rank: number,
): ScoreRow {
  return {
    rank,
    username,
    rating: 1500,
    solved,
    penalty,
    cells: [
      {
        label: 'A',
        solved: solved > 0,
        attempts: 0,
        acMinute: solved > 0 ? 12 : null,
        firstSolve: false,
        pending: false,
      },
      {
        label: 'B',
        solved: solved > 1,
        attempts: 1,
        acMinute: solved > 1 ? 48 : null,
        firstSolve: false,
        pending: false,
      },
    ],
  };
}

export function scoreboard(rows: ScoreRow[], overrides: Partial<Scoreboard> = {}): Scoreboard {
  return {
    contestSlug: 'autumn-sprint',
    problems: [{ label: 'A' }, { label: 'B' }],
    rows,
    total: rows.length,
    page: 1,
    pageSize: 50,
    updatedAt: '2026-11-08T10:00:00.000Z',
    ...overrides,
  };
}
