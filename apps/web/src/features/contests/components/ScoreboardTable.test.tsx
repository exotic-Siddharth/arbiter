import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { scoreRow } from '../test/fixtures';
import { ScoreboardTable } from './ScoreboardTable';

const rows = [scoreRow('alice', 2, 100, 1), scoreRow('bob', 1, 30, 2)].map((row) => ({
  ...row,
  previousRank: null,
  movement: null,
  movedAt: null,
}));

describe('ScoreboardTable', () => {
  it('keeps the sticky cells of the own row opaque', () => {
    render(
      <MemoryRouter>
        <ScoreboardTable
          problems={[{ label: 'A' }, { label: 'B' }]}
          rows={rows}
          currentUsername="bob"
        />
      </MemoryRouter>,
    );
    const mine = screen.getByRole('link', { name: 'bob' }).closest('tr')!;
    const other = screen.getByRole('link', { name: 'alice' }).closest('tr')!;
    // The row tint is translucent; sticky rank/user cells must override it with an opaque mix.
    expect(mine.className).toContain('[&>td.sticky]:bg-[color-mix(');
    expect(mine.className).toContain('var(--color-surface)');
    expect(other.className).not.toContain('color-mix');
  });
});
