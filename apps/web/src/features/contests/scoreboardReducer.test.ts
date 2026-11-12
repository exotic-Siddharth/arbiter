import type { Scoreboard, ScoreRow } from '@arbiter/shared';
import { describe, expect, it } from 'vitest';
import {
  initialScoreboardState,
  scoreboardReducer,
  type ScoreboardState,
} from './scoreboardReducer';

function row(username: string, solved: number, penalty: number, rank: number): ScoreRow {
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
        acMinute: solved > 0 ? 10 : null,
        firstSolve: false,
        pending: false,
      },
      {
        label: 'B',
        solved: solved > 1,
        attempts: 0,
        acMinute: solved > 1 ? 20 : null,
        firstSolve: false,
        pending: false,
      },
    ],
  };
}

function board(rows: ScoreRow[], overrides: Partial<Scoreboard> = {}): Scoreboard {
  return {
    contestSlug: 'weekly',
    problems: [{ label: 'A' }, { label: 'B' }],
    rows,
    total: rows.length,
    page: 1,
    pageSize: 50,
    updatedAt: '2026-11-08T10:00:00.000Z',
    ...overrides,
  };
}

function load(snapshot: Scoreboard): ScoreboardState {
  return scoreboardReducer(initialScoreboardState, { type: 'snapshot', board: snapshot, at: 1000 });
}

const ranks = (state: ScoreboardState) => state.rows.map((r) => [r.username, r.rank]);

describe('scoreboardReducer', () => {
  it('row update re-sorts and marks rank change', () => {
    const state = load(
      board([row('alice', 2, 100, 1), row('bob', 1, 30, 2), row('carol', 1, 50, 3)]),
    );
    expect(state.rows.every((r) => r.movement === null)).toBe(true);

    // carol solves B: 2 solved, penalty 90 beats alice's 100.
    const next = scoreboardReducer(state, {
      type: 'row',
      contestSlug: 'weekly',
      row: row('carol', 2, 90, 1),
      at: 2000,
    });

    expect(ranks(next)).toEqual([
      ['carol', 1],
      ['alice', 2],
      ['bob', 3],
    ]);
    expect(next.rows[0]).toMatchObject({
      solved: 2,
      penalty: 90,
      movement: 'up',
      previousRank: 3,
      movedAt: 2000,
    });
    expect(next.rows[1]).toMatchObject({ movement: 'down', previousRank: 1 });
    expect(next.rows[2]).toMatchObject({ movement: 'down', previousRank: 2 });
    // The page held every row involved, so nothing needs a refetch.
    expect(next.stale).toBe(false);
  });

  it('marks the page stale when its last row worsens while later pages exist', () => {
    const state = load(
      board([row('p1', 1, 10, 1), row('p2', 1, 30, 2)], { total: 3, pageSize: 2 }),
    );
    // p2 gains penalty (50) and may now sit behind p3 (40) on the next page.
    const worse = scoreboardReducer(state, {
      type: 'row',
      contestSlug: 'weekly',
      row: row('p2', 1, 50, 2),
      at: 2000,
    });
    expect(worse.stale).toBe(true);
    // An improvement of the last row keeps the page exact.
    const better = scoreboardReducer(state, {
      type: 'row',
      contestSlug: 'weekly',
      row: row('p2', 1, 20, 2),
      at: 2000,
    });
    expect(better.stale).toBe(false);
    // Nothing follows this page: a worse last row is still exact.
    const only = load(board([row('p1', 1, 10, 1), row('p2', 1, 30, 2)], { pageSize: 2 }));
    const alone = scoreboardReducer(only, {
      type: 'row',
      contestSlug: 'weekly',
      row: row('p2', 1, 50, 2),
      at: 2000,
    });
    expect(alone.stale).toBe(false);
  });

  it('marks the page stale when a mid-page row worsens into the last slot (A-R2-12)', () => {
    const state = load(
      board([row('p1', 1, 10, 1), row('p2', 1, 30, 2), row('p3', 1, 40, 3)], {
        total: 4,
        pageSize: 3,
      }),
    );
    // p2 (1, 50) now sorts last and may rank behind p4 (1, 45) on page 2.
    const worse = scoreboardReducer(state, {
      type: 'row',
      contestSlug: 'weekly',
      row: row('p2', 1, 50, 2),
      at: 2000,
    });
    expect(worse.rows.map((r) => r.username)).toEqual(['p1', 'p3', 'p2']);
    expect(worse.stale).toBe(true);
    // Worsening but staying above the last row keeps the page exact.
    const mild = scoreboardReducer(state, {
      type: 'row',
      contestSlug: 'weekly',
      row: row('p1', 1, 35, 1),
      at: 2000,
    });
    expect(mild.rows.map((r) => r.username)).toEqual(['p2', 'p1', 'p3']);
    expect(mild.stale).toBe(false);
  });

  it('gives equal (solved, penalty) the same rank and skips the next ones', () => {
    const state = load(
      board([row('alice', 2, 100, 1), row('bob', 1, 30, 2), row('carol', 1, 50, 3)]),
    );
    // bob solves B with the same penalty as alice: they tie for first.
    const next = scoreboardReducer(state, {
      type: 'row',
      contestSlug: 'weekly',
      row: row('bob', 2, 100, 1),
      at: 2000,
    });
    expect(ranks(next)).toEqual([
      ['alice', 1],
      ['bob', 1],
      ['carol', 3],
    ]);
    expect(next.rows[0]?.movement).toBeNull();
    expect(next.rows[1]).toMatchObject({ movement: 'up', previousRank: 2 });
  });

  it('updates cells without marking a move when the rank stays the same', () => {
    const state = load(board([row('alice', 2, 100, 1), row('bob', 1, 30, 2)]));
    const pendingBob: ScoreRow = {
      ...row('bob', 1, 30, 2),
      cells: [
        { label: 'A', solved: true, attempts: 0, acMinute: 10, firstSolve: false, pending: false },
        {
          label: 'B',
          solved: false,
          attempts: 0,
          acMinute: null,
          firstSolve: false,
          pending: true,
        },
      ],
    };
    const next = scoreboardReducer(state, {
      type: 'row',
      contestSlug: 'weekly',
      row: pendingBob,
      at: 2000,
    });
    expect(ranks(next)).toEqual([
      ['alice', 1],
      ['bob', 2],
    ]);
    expect(next.rows[1]?.cells[1]?.pending).toBe(true);
    expect(next.rows[1]?.movement).toBeNull();
  });

  it('ignores rows of other contests', () => {
    const state = load(board([row('alice', 2, 100, 1)]));
    const next = scoreboardReducer(state, {
      type: 'row',
      contestSlug: 'another-round',
      row: row('zed', 9, 1, 1),
      at: 2000,
    });
    expect(next).toBe(state);
  });

  it('inserts a newcomer on the first page, trims the overflow and asks for a refetch', () => {
    const state = load(
      board([row('alice', 2, 100, 1), row('bob', 1, 30, 2)], { pageSize: 2, total: 3 }),
    );
    const next = scoreboardReducer(state, {
      type: 'row',
      contestSlug: 'weekly',
      row: row('dave', 1, 10, 2),
      at: 2000,
    });
    expect(ranks(next)).toEqual([
      ['alice', 1],
      ['dave', 2],
    ]);
    expect(next.rows[1]).toMatchObject({ movement: 'new' });
    expect(next.stale).toBe(true);
  });

  it('keeps ranks relative to earlier pages when a tie straddles the page boundary', () => {
    // Page 2 of 2-row pages: the first row ties with rows on page 1 (rank 1).
    const state = load(
      board([row('carol', 1, 50, 1), row('dave', 0, 0, 4)], { page: 2, pageSize: 2, total: 4 }),
    );
    const next = scoreboardReducer(state, {
      type: 'row',
      contestSlug: 'weekly',
      row: {
        ...row('dave', 0, 0, 4),
        cells: row('dave', 0, 0, 4).cells.map((c) => ({ ...c, attempts: 1 })),
      },
      at: 2000,
    });
    expect(ranks(next)).toEqual([
      ['carol', 1],
      ['dave', 4],
    ]);
  });

  it('snapshot replaces the rows, marks moves against the previous page and clears stale', () => {
    const state = load(board([row('alice', 2, 100, 1), row('bob', 1, 30, 2)]));
    const staleState = { ...state, stale: true };
    const next = scoreboardReducer(staleState, {
      type: 'snapshot',
      board: board([row('bob', 2, 60, 1), row('alice', 2, 100, 2), row('erin', 1, 5, 3)]),
      at: 3000,
    });
    expect(ranks(next)).toEqual([
      ['bob', 1],
      ['alice', 2],
      ['erin', 3],
    ]);
    expect(next.rows[0]).toMatchObject({ movement: 'up', previousRank: 2 });
    expect(next.rows[1]).toMatchObject({ movement: 'down', previousRank: 1 });
    expect(next.rows[2]).toMatchObject({ movement: 'new' });
    expect(next.stale).toBe(false);
  });

  it('settle clears the movement markers of earlier updates', () => {
    const state = load(board([row('alice', 2, 100, 1), row('bob', 1, 30, 2)]));
    const moved = scoreboardReducer(state, {
      type: 'row',
      contestSlug: 'weekly',
      row: row('bob', 2, 60, 1),
      at: 2000,
    });
    const settled = scoreboardReducer(moved, { type: 'settle', before: 2000 });
    expect(settled.rows.map((r) => r.movement)).toEqual([null, null]);
    expect(ranks(settled)).toEqual([
      ['bob', 1],
      ['alice', 2],
    ]);
  });
});
