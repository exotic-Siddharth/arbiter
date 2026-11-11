import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { QueryState, type QueryLike } from './QueryState';

function query(partial: Partial<QueryLike<{ items: number[] }>>): QueryLike<{ items: number[] }> {
  return {
    data: undefined,
    error: null,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
    ...partial,
  };
}

const rows = (data: { items: number[] }) => (
  <ul>
    {data.items.map((n) => (
      <li key={n}>row {n}</li>
    ))}
  </ul>
);

describe('QueryState', () => {
  it('shows the error state when the query failed and there is no data', () => {
    render(
      <QueryState query={query({ isError: true, error: new Error('boom') })}>{rows}</QueryState>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/Couldn't load this/);
  });

  it('keeps already-loaded data visible when a background refetch fails', async () => {
    const refetch = vi.fn();
    render(
      <QueryState
        query={query({ data: { items: [1, 2, 3] }, isError: true, error: new Error('x'), refetch })}
      >
        {rows}
      </QueryState>,
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('status')).toHaveTextContent(/could not refresh/i);
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
