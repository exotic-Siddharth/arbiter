import type { Scoreboard, ScoreRow } from '@arbiter/shared';

/**
 * Live scoreboard state for one page (R3): REST snapshots replace the rows, and each
 * `scoreboard:row` event (one row) is merged in and the page is re-ranked locally. When an
 * event cannot be applied exactly (someone entered or left the page, or totals changed), the
 * state is marked `stale` so the caller refetches the page: events are hints, REST is the truth.
 */

/** How the latest update moved a row: drives the arrow and the highlight. */
export type RowMovement = 'up' | 'down' | 'new';

export interface LiveScoreRow extends ScoreRow {
  /** Rank before the latest move (null when the row has not moved). */
  previousRank: number | null;
  movement: RowMovement | null;
  /** Client time (ms) of the latest move; settle clears old ones. */
  movedAt: number | null;
}

/** Score of the first row of a page > 1: ranks on this page count the rows before it. */
interface PageAnchor {
  solved: number;
  penalty: number;
  rank: number;
}

export interface ScoreboardState {
  contestSlug: string | null;
  problems: Scoreboard['problems'];
  rows: LiveScoreRow[];
  total: number;
  page: number;
  pageSize: number;
  updatedAt: string | null;
  /** The snapshot the rows were last loaded from (null before the first one). */
  source: Scoreboard | null;
  anchor: PageAnchor | null;
  /** An event could not be applied exactly: refetch the page. */
  stale: boolean;
}

export const initialScoreboardState: ScoreboardState = {
  contestSlug: null,
  problems: [],
  rows: [],
  total: 0,
  page: 1,
  pageSize: 50,
  updatedAt: null,
  source: null,
  anchor: null,
  stale: false,
};

export type ScoreboardAction =
  | { type: 'snapshot'; board: Scoreboard; at: number }
  | { type: 'row'; contestSlug: string; row: ScoreRow; at: number }
  | { type: 'settle'; before: number };

type Score = Pick<ScoreRow, 'solved' | 'penalty'>;

/** ICPC order: negative when `a` ranks above `b` (more solved, then less penalty). */
export function compareScore(a: Score, b: Score): number {
  if (a.solved !== b.solved) return b.solved - a.solved;
  return a.penalty - b.penalty;
}

const userKey = (username: string) => username.toLowerCase();

/** Ranks of a sorted page: 1 + rows strictly better (earlier pages included); ties share. */
function assignRanks(rows: LiveScoreRow[], state: ScoreboardState): LiveScoreRow[] {
  const earlierRows = (state.page - 1) * state.pageSize;
  let groupStart = 0;
  return rows.map((row, index) => {
    const previous = rows[index - 1];
    if (previous && compareScore(previous, row) !== 0) groupStart = index;
    const { anchor } = state;
    // Rows strictly worse than the page's first row are beaten by every earlier row; rows
    // tied with it share its rank, so only the rows ranked above it count.
    const before = !anchor || compareScore(row, anchor) > 0 ? earlierRows : anchor.rank - 1;
    return row.rank === 1 + before + groupStart ? row : { ...row, rank: 1 + before + groupStart };
  });
}

function fromSnapshot(state: ScoreboardState, board: Scoreboard, at: number): ScoreboardState {
  const samePage =
    state.source !== null && state.contestSlug === board.contestSlug && state.page === board.page;
  const previous = new Map(state.rows.map((row) => [userKey(row.username), row]));
  const rows = board.rows.map((row): LiveScoreRow => {
    const before = samePage ? previous.get(userKey(row.username)) : undefined;
    if (!samePage) return { ...row, previousRank: null, movement: null, movedAt: null };
    if (!before) return { ...row, previousRank: null, movement: 'new', movedAt: at };
    if (before.rank !== row.rank) {
      return {
        ...row,
        previousRank: before.rank,
        movement: row.rank < before.rank ? 'up' : 'down',
        movedAt: at,
      };
    }
    return {
      ...row,
      previousRank: before.previousRank,
      movement: before.movement,
      movedAt: before.movedAt,
    };
  });
  const first = board.rows[0];
  return {
    contestSlug: board.contestSlug,
    problems: board.problems,
    rows,
    total: board.total,
    page: board.page,
    pageSize: board.pageSize,
    updatedAt: board.updatedAt,
    source: board,
    anchor:
      board.page > 1 && first
        ? { solved: first.solved, penalty: first.penalty, rank: first.rank }
        : null,
    stale: false,
  };
}

function applyRow(state: ScoreboardState, row: ScoreRow, at: number): ScoreboardState {
  const index = state.rows.findIndex((r) => userKey(r.username) === userKey(row.username));
  let stale = state.stale;
  let working: LiveScoreRow[];
  let worsened = false;

  if (index >= 0) {
    working = state.rows.slice();
    const current = state.rows[index] as LiveScoreRow;
    worsened = compareScore(row, current) > 0;
    // Keep the current markers; the rank comparison below sets new ones if the row moves.
    working[index] = {
      ...row,
      previousRank: current.previousRank,
      movement: current.movement,
      movedAt: current.movedAt,
    };
  } else {
    // A row from another page (or a new participant): it belongs here only if it sorts
    // strictly inside this page. Either way the page membership or total has changed.
    const last = state.rows[state.rows.length - 1];
    const fitsBelow =
      state.rows.length < state.pageSize || (last !== undefined && compareScore(row, last) < 0);
    const fitsAbove = !state.anchor || compareScore(row, state.anchor) > 0;
    if (!fitsBelow || !fitsAbove) return state.stale ? state : { ...state, stale: true };
    working = [...state.rows, { ...row, previousRank: null, movement: 'new', movedAt: at }];
    stale = true;
  }

  working.sort(compareScore); // stable: ties keep their order
  // A row that worsened and ends up last on a full page (wherever it started) may now rank
  // behind the next page's first row, which is not loaded here.
  if (
    worsened &&
    working.length >= state.pageSize &&
    state.total > state.page * state.pageSize &&
    userKey(working[working.length - 1]?.username ?? '') === userKey(row.username)
  ) {
    stale = true;
  }
  if (working.length > state.pageSize) {
    working = working.slice(0, state.pageSize);
    stale = true;
  }
  // On a later page, a row that overtook the page's first row may belong to an earlier page.
  if (state.anchor && compareScore(row, state.anchor) < 0) stale = true;

  const oldRanks = new Map(state.rows.map((r) => [userKey(r.username), r.rank]));
  const rows = assignRanks(working, state).map((r): LiveScoreRow => {
    const before = oldRanks.get(userKey(r.username));
    if (before === undefined || before === r.rank) return r;
    return { ...r, previousRank: before, movement: r.rank < before ? 'up' : 'down', movedAt: at };
  });

  return { ...state, rows, stale, updatedAt: new Date(at).toISOString() };
}

export function scoreboardReducer(
  state: ScoreboardState,
  action: ScoreboardAction,
): ScoreboardState {
  switch (action.type) {
    case 'snapshot':
      return fromSnapshot(state, action.board, action.at);
    case 'row':
      if (state.source === null || state.contestSlug !== action.contestSlug) return state;
      return applyRow(state, action.row, action.at);
    case 'settle': {
      let changed = false;
      const rows = state.rows.map((row) => {
        if (row.movedAt === null || row.movedAt > action.before) return row;
        changed = true;
        return { ...row, previousRank: null, movement: null, movedAt: null };
      });
      return changed ? { ...state, rows } : state;
    }
    default:
      return state;
  }
}
