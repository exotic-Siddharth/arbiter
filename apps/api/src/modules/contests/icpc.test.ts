import type { ScoreRow, SubmissionStatus, Verdict } from '@arbiter/shared';
import { describe, expect, it } from 'vitest';
import {
  FIXTURE_EXPECTED,
  FIXTURE_LABELS,
  FIXTURE_PENALTY_MINUTES,
  FIXTURE_SUBMISSIONS,
  FIXTURE_USERS,
  expectedCells,
} from './icpc.fixture';
import {
  computeRow,
  computeStandings,
  firstSolveTimes,
  rankRows,
  scoreOf,
  type ScoringContest,
  type ScoringSubmission,
} from './icpc';

const T0 = new Date('2026-03-01T10:00:00.000Z');
const at = (minute: number) => new Date(T0.getTime() + Math.round(minute * 60_000));

const contest: ScoringContest = {
  startsAt: T0,
  penaltyMinutes: 20,
  problems: [
    { problemId: 'pA', label: 'A' },
    { problemId: 'pB', label: 'B' },
  ],
};

let seq = 0;
function sub(
  problemId: string,
  minute: number,
  verdict: Verdict | null,
  status: SubmissionStatus = verdict === null ? 'QUEUED' : 'DONE',
): ScoringSubmission {
  seq += 1;
  return {
    id: `s${String(seq).padStart(4, '0')}`,
    userId: 'u1',
    problemId,
    status,
    verdict,
    createdAt: at(minute),
    user: { username: 'ada', rating: 1500 },
  };
}

const cellOf = (row: ScoreRow, label: string) => row.cells.find((cell) => cell.label === label);

describe('computeRow', () => {
  it('adds penaltyMinutes per wrong try before the first AC and rounds acMinute down', () => {
    const row = computeRow(contest, [sub('pA', 3.2, 'WA'), sub('pA', 12.99, 'AC')]);
    expect(row).toMatchObject({ username: 'ada', rating: 1500, solved: 1, penalty: 12 + 20 });
    expect(row.cells).toEqual([
      { label: 'A', solved: true, attempts: 1, acMinute: 12, firstSolve: false, pending: false },
      { label: 'B', solved: false, attempts: 0, acMinute: null, firstSolve: false, pending: false },
    ]);
  });

  it('does not count CE or IE (DONE/IE or FAILED) as attempts', () => {
    const row = computeRow(contest, [
      sub('pA', 1, 'CE'),
      sub('pA', 2, 'IE'),
      sub('pA', 3, 'IE', 'FAILED'),
      sub('pA', 3.5, null, 'FAILED'),
      sub('pA', 4, 'WA'),
      sub('pA', 9, 'AC'),
    ]);
    expect(cellOf(row, 'A')).toMatchObject({ solved: true, attempts: 1, acMinute: 9 });
    expect(row.penalty).toBe(9 + 20);
  });

  it('ignores every submission after the first AC, pending ones included', () => {
    const row = computeRow(contest, [
      sub('pA', 5, 'AC'),
      sub('pA', 6, 'WA'),
      sub('pA', 7, 'AC'),
      sub('pA', 8, null, 'RUNNING'),
    ]);
    expect(cellOf(row, 'A')).toEqual({
      label: 'A',
      solved: true,
      attempts: 0,
      acMinute: 5,
      firstSolve: false,
      pending: false,
    });
    expect(row.penalty).toBe(5);
  });

  it('counts all tries of an unsolved problem, adds no penalty and shows pending', () => {
    const row = computeRow(contest, [
      sub('pB', 10, 'WA'),
      sub('pB', 11, 'TLE'),
      sub('pB', 12, 'CE'),
      sub('pB', 13, null, 'COMPILING'),
    ]);
    expect(cellOf(row, 'B')).toEqual({
      label: 'B',
      solved: false,
      attempts: 2,
      acMinute: null,
      firstSolve: false,
      pending: true,
    });
    expect(row).toMatchObject({ solved: 0, penalty: 0 });
  });

  it('keeps a solved cell pending while an earlier submission is still being judged', () => {
    const row = computeRow(contest, [sub('pA', 4, null, 'QUEUED'), sub('pA', 6, 'AC')]);
    expect(cellOf(row, 'A')).toMatchObject({ solved: true, acMinute: 6, pending: true });
  });

  it('orders submissions by time, not by array order', () => {
    const wa = sub('pA', 3, 'WA');
    const acSub = sub('pA', 12, 'AC');
    const late = sub('pA', 20, 'WA');
    const row = computeRow(contest, [late, acSub, wa]);
    expect(cellOf(row, 'A')).toMatchObject({ solved: true, attempts: 1, acMinute: 12 });
  });

  it('marks firstSolve when the AC is the earliest AC on that problem', () => {
    const first = sub('pA', 7, 'AC');
    const later = sub('pB', 30, 'AC');
    const withFirsts: ScoringContest = {
      ...contest,
      firstSolveAt: new Map([
        ['pA', at(7)],
        ['pB', at(29)],
      ]),
    };
    const row = computeRow(withFirsts, [first, later]);
    expect(cellOf(row, 'A')?.firstSolve).toBe(true);
    expect(cellOf(row, 'B')?.firstSolve).toBe(false);
  });

  it('ignores submissions on problems that are not part of the contest', () => {
    const row = computeRow(contest, [sub('elsewhere', 3, 'AC'), sub('pB', 4, 'WA')]);
    expect(row.cells.map((cell) => cell.label)).toEqual(['A', 'B']);
    expect(row.solved).toBe(0);
    expect(cellOf(row, 'B')?.attempts).toBe(1);
  });

  it('never reports a negative acMinute for an AC before startsAt', () => {
    const row = computeRow(contest, [sub('pA', -3, 'AC')]);
    expect(cellOf(row, 'A')).toMatchObject({ solved: true, acMinute: 0 });
  });

  it('rejects an empty list and a list mixing users', () => {
    expect(() => computeRow(contest, [])).toThrow(/at least one/);
    const other = { ...sub('pA', 2, 'WA'), userId: 'u2' };
    expect(() => computeRow(contest, [sub('pA', 1, 'WA'), other])).toThrow(/one participant/);
  });
});

describe('rankRows', () => {
  const row = (username: string, solved: number, penalty: number): ScoreRow => ({
    rank: 99,
    username,
    rating: 1200,
    solved,
    penalty,
    cells: [],
  });

  it('ranks by solved desc then penalty asc, and ties share a rank', () => {
    const ranked = rankRows([
      row('e', 0, 0),
      row('c', 2, 60),
      row('a', 2, 50),
      row('f', 3, 400),
      row('b', 2, 50),
    ]);
    expect(ranked.map((r) => [r.username, r.rank])).toEqual([
      ['f', 1],
      ['a', 2],
      ['b', 2],
      ['c', 4],
      ['e', 5],
    ]);
  });

  it('keeps extra fields of the rows it ranks', () => {
    const ranked = rankRows([{ ...row('x', 1, 5), userId: 'ux' }]);
    expect(ranked[0]).toMatchObject({ userId: 'ux', rank: 1 });
  });
});

describe('scoreOf', () => {
  it('orders more solved first, then the lower penalty', () => {
    expect(scoreOf({ solved: 2, penalty: 37 })).toBe(2 * 10_000_000 - 37);
    expect(scoreOf({ solved: 3, penalty: 9_000 })).toBeGreaterThan(
      scoreOf({ solved: 2, penalty: 0 }),
    );
  });

  it('keeps solved first even when the penalty passes 10^7 (A-50)', () => {
    expect(scoreOf({ solved: 26, penalty: 10_900_000 })).toBeGreaterThan(
      scoreOf({ solved: 25, penalty: 0 }),
    );
    expect(scoreOf({ solved: 1, penalty: 50_000_000 })).toBeGreaterThan(
      scoreOf({ solved: 0, penalty: 0 }),
    );
  });
});

describe('fixture contest (hand-computed)', () => {
  const problemIds = Object.fromEntries(FIXTURE_LABELS.map((label) => [label, `p${label}`]));
  const fixtureContest: ScoringContest = {
    startsAt: T0,
    penaltyMinutes: FIXTURE_PENALTY_MINUTES,
    problems: FIXTURE_LABELS.map((label) => ({ problemId: problemIds[label]!, label })),
  };
  const submissions: ScoringSubmission[] = FIXTURE_SUBMISSIONS.map((s, index) => ({
    id: `f${String(index).padStart(3, '0')}`,
    userId: `id-${s.user}`,
    problemId: problemIds[s.label]!,
    status: s.status,
    verdict: s.verdict,
    createdAt: at(s.minute),
    user: { username: s.user, rating: 1500 },
  }));

  it('firstSolveTimes finds the earliest AC per problem', () => {
    expect(firstSolveTimes(submissions)).toEqual(
      new Map([
        ['pA', at(10)],
        ['pB', at(22)],
      ]),
    );
  });

  it('computeStandings matches the hand-computed ranks, penalties and first solves', () => {
    const standings = computeStandings(fixtureContest, submissions);
    expect(standings).toHaveLength(FIXTURE_USERS.length);
    for (const user of FIXTURE_USERS) {
      const row = standings.find((r) => r.username === user);
      expect(row, user).toMatchObject({
        userId: `id-${user}`,
        rank: FIXTURE_EXPECTED[user].rank,
        solved: FIXTURE_EXPECTED[user].solved,
        penalty: FIXTURE_EXPECTED[user].penalty,
        cells: expectedCells(user),
      });
    }
    expect(standings.map((r) => r.rank)).toEqual([1, 2, 2, 4, 5]);
  });
});
