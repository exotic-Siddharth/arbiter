import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Heatmap, type HeatmapDay } from './Heatmap';
import { levelFor } from './heatmapScale';

function lastYear(counts: (index: number) => number): HeatmapDay[] {
  const end = Date.UTC(2026, 10, 8);
  return Array.from({ length: 365 }, (_, i) => {
    const date = new Date(end - (364 - i) * 86_400_000).toISOString().slice(0, 10);
    return { date, count: counts(i) };
  });
}

describe('Heatmap', () => {
  it('renders 365 cells and the max-count legend', () => {
    const days = lastYear((i) => (i === 100 ? 12 : i % 9 === 0 ? 3 : 0));
    render(<Heatmap days={days} />);
    expect(screen.getAllByTestId('heatmap-cell')).toHaveLength(365);
    expect(screen.getByTestId('heatmap-legend')).toHaveTextContent('12');
    expect(screen.getByTestId('heatmap-legend')).toHaveTextContent('0');
  });

  it('labels each cell and shows a tooltip on focus', () => {
    const days = lastYear((i) => (i === 364 ? 4 : 0));
    render(<Heatmap days={days} />);
    const cells = screen.getAllByTestId('heatmap-cell');
    const last = cells[364];
    expect(last).toHaveAttribute('aria-label', expect.stringContaining('4 submissions'));
    fireEvent.focus(last);
    expect(screen.getByRole('tooltip')).toHaveTextContent('4 submissions');
  });

  it('keeps a single tab stop and moves with the arrow keys', () => {
    render(<Heatmap days={lastYear(() => 1)} />);
    const cells = screen.getAllByTestId('heatmap-cell');
    expect(cells.filter((cell) => cell.getAttribute('tabindex') === '0')).toHaveLength(1);
    const start = cells.findIndex((cell) => cell.getAttribute('tabindex') === '0');
    fireEvent.keyDown(cells[start], { key: 'ArrowLeft' });
    expect(cells[start - 7]).toHaveAttribute('tabindex', '0');
  });

  it('handles an all-zero year', () => {
    render(<Heatmap days={lastYear(() => 0)} />);
    expect(screen.getAllByTestId('heatmap-cell')).toHaveLength(365);
    expect(screen.getByText(/no submissions/i)).toBeInTheDocument();
  });

  it('levels counts relative to the maximum', () => {
    expect(levelFor(0, 12)).toBe(0);
    expect(levelFor(1, 12)).toBe(1);
    expect(levelFor(12, 12)).toBe(4);
    expect(levelFor(5, 0)).toBe(0);
  });
});
