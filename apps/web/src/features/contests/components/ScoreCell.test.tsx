import type { ScoreCell as ScoreCellData } from '@arbiter/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ScoreCell } from './ScoreCell';

const MINUS = String.fromCharCode(0x2212);

function cell(overrides: Partial<ScoreCellData> = {}): ScoreCellData {
  return {
    label: 'A',
    solved: false,
    attempts: 0,
    acMinute: null,
    firstSolve: false,
    pending: false,
    ...overrides,
  };
}

describe('ScoreCell', () => {
  it('renders +, +2 with minute, −3, pending, firstSolve', () => {
    // Solved on the first try at minute 17.
    const { container, rerender } = render(
      <ScoreCell cell={cell({ solved: true, acMinute: 17 })} />,
    );
    let root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute('data-state', 'solved');
    expect(screen.getByText('+')).toBeInTheDocument();
    expect(screen.getByText('0:17')).toBeInTheDocument();
    expect(root).toHaveTextContent(/solved at 0:17 on the first try/i);

    // Two rejected tries before the AC at minute 105 (1:45).
    rerender(<ScoreCell cell={cell({ solved: true, attempts: 2, acMinute: 105 })} />);
    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.getByText('1:45')).toBeInTheDocument();
    expect(root).toHaveTextContent(/after 2 rejected attempts/i);

    // Three rejected tries, unsolved: a real minus sign, no minute.
    rerender(<ScoreCell cell={cell({ attempts: 3 })} />);
    root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute('data-state', 'failed');
    expect(screen.getByText(`${MINUS}3`)).toBeInTheDocument();
    expect(screen.queryByText(/\d:\d\d/)).not.toBeInTheDocument();
    expect(root).toHaveTextContent(/3 rejected attempts/i);

    // A submission is being judged (after one rejected try).
    rerender(<ScoreCell cell={cell({ attempts: 1, pending: true })} />);
    root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute('data-state', 'pending');
    expect(screen.getByText('?')).toBeInTheDocument();
    expect(screen.getByText(`${MINUS}1`)).toBeInTheDocument();
    expect(root).toHaveTextContent(/being judged/i);

    // First solve of the problem: marked with a star and announced.
    rerender(
      <ScoreCell cell={cell({ solved: true, attempts: 1, acMinute: 9, firstSolve: true })} />,
    );
    root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute('data-state', 'solved');
    expect(root).toHaveAttribute('data-first-solve', 'true');
    expect(screen.getByText('★')).toBeInTheDocument();
    expect(screen.getByText('+1')).toBeInTheDocument();
    expect(root).toHaveTextContent(/first to solve/i);
  });

  it('shows an empty cell for an untouched problem and ignores pending after an AC', () => {
    const { container, rerender } = render(<ScoreCell cell={undefined} />);
    let root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute('data-state', 'empty');
    expect(root).toHaveTextContent(/not attempted/i);

    // Submissions after the first AC are ignored by the scoreboard (spec 9).
    rerender(<ScoreCell cell={cell({ solved: true, acMinute: 30, pending: true })} />);
    root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute('data-state', 'solved');
    expect(screen.queryByText('?')).not.toBeInTheDocument();
  });
});
