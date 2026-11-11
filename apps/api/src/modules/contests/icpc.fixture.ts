import type { ScoreCell, SubmissionKind, SubmissionStatus, Verdict } from '@arbiter/shared';

/**
 * Hand-computed ICPC fixture shared by icpc.test.ts (pure scoring) and scoreboard.test.ts
 * (Postgres + Redis through the API). Penalty 20 minutes per counted wrong try.
 *
 * First solves: A = bob at minute 10, B = carol at minute 22, C = nobody.
 *   carol  A AC@15 (WA@16 after the AC is ignored), B AC@22, C IE@40 + QUEUED@55 -> 2 solved, 15 + 22 = 37
 *   alice  A WA@5 AC@12.5, B CE@20 AC@25                       -> 2 solved, (12 + 20) + 25 = 57
 *   dave   A AC@14, B WA@22.5 AC@23.2                          -> 2 solved, 14 + (23 + 20) = 57
 *   bob    A AC@10, B WA@30 WA@31 AC@47, C WA@50               -> 2 solved, 10 + (47 + 40) = 97
 *   eve    C CE@33 (a participant: one contest submission)     -> 0 solved, 0
 * Ranks: carol 1, alice 2, dave 2 (tie), bob 4, eve 5.
 */
export const FIXTURE_PENALTY_MINUTES = 20;
export const FIXTURE_LABELS = ['A', 'B', 'C'] as const;
export type FixtureLabel = (typeof FIXTURE_LABELS)[number];
export const FIXTURE_USERS = ['alice', 'bob', 'carol', 'dave', 'eve'] as const;
export type FixtureUser = (typeof FIXTURE_USERS)[number];

export interface FixtureSubmission {
  user: FixtureUser;
  label: FixtureLabel;
  /** Minutes after startsAt (fractions allowed: acMinute rounds down). */
  minute: number;
  status: SubmissionStatus;
  verdict: Verdict | null;
  kind?: SubmissionKind;
}

const done = (user: FixtureUser, label: FixtureLabel, minute: number, verdict: Verdict) =>
  ({ user, label, minute, status: 'DONE', verdict }) satisfies FixtureSubmission;

export const FIXTURE_SUBMISSIONS: readonly FixtureSubmission[] = [
  done('alice', 'A', 5, 'WA'),
  done('alice', 'A', 12.5, 'AC'),
  done('alice', 'B', 20, 'CE'),
  done('alice', 'B', 25, 'AC'),
  done('bob', 'A', 10, 'AC'),
  done('bob', 'B', 30, 'WA'),
  done('bob', 'B', 31, 'TLE'),
  done('bob', 'B', 47, 'AC'),
  done('bob', 'C', 50, 'WA'),
  done('carol', 'A', 15, 'AC'),
  done('carol', 'A', 16, 'WA'),
  done('carol', 'B', 22, 'AC'),
  { user: 'carol', label: 'C', minute: 40, status: 'FAILED', verdict: 'IE' },
  { user: 'carol', label: 'C', minute: 55, status: 'QUEUED', verdict: null },
  done('dave', 'A', 14, 'AC'),
  done('dave', 'B', 22.5, 'RE'),
  done('dave', 'B', 23.2, 'AC'),
  done('eve', 'C', 33, 'CE'),
];

type CellSpec = Omit<ScoreCell, 'label'>;
const unsolved: CellSpec = {
  solved: false,
  attempts: 0,
  acMinute: null,
  firstSolve: false,
  pending: false,
};
const ac = (acMinute: number, attempts = 0, firstSolve = false): CellSpec => ({
  solved: true,
  attempts,
  acMinute,
  firstSolve,
  pending: false,
});

export interface FixtureExpectedRow {
  rank: number;
  solved: number;
  penalty: number;
  cells: Record<FixtureLabel, CellSpec>;
}

/** In final standing order; alice and dave tie (any order between them is fine). */
export const FIXTURE_EXPECTED: Record<FixtureUser, FixtureExpectedRow> = {
  carol: {
    rank: 1,
    solved: 2,
    penalty: 37,
    cells: { A: ac(15), B: ac(22, 0, true), C: { ...unsolved, pending: true } },
  },
  alice: { rank: 2, solved: 2, penalty: 57, cells: { A: ac(12, 1), B: ac(25), C: unsolved } },
  dave: { rank: 2, solved: 2, penalty: 57, cells: { A: ac(14), B: ac(23, 1), C: unsolved } },
  bob: {
    rank: 4,
    solved: 2,
    penalty: 97,
    cells: { A: ac(10, 0, true), B: ac(47, 2), C: { ...unsolved, attempts: 1 } },
  },
  eve: { rank: 5, solved: 0, penalty: 0, cells: { A: unsolved, B: unsolved, C: unsolved } },
};

/** The expected row's cells as the ordered ScoreCell[] the API returns. */
export function expectedCells(user: FixtureUser): ScoreCell[] {
  return FIXTURE_LABELS.map((label) => ({ label, ...FIXTURE_EXPECTED[user].cells[label] }));
}
