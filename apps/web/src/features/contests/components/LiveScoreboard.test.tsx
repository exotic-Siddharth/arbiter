import { act, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { setSocketForTesting } from '@/lib/socket';
import { createFakeSocket } from '@/test/fakeSocket';
import { jsonResponse, mockFetch } from '@/test/fetchMock';
import { renderWithProviders } from '@/test/render';
import { scoreRow, scoreboard } from '../test/fixtures';
import { LiveScoreboard } from './LiveScoreboard';

const usernames = () =>
  within(screen.getByRole('table'))
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('link')[0]?.textContent);

describe('LiveScoreboard', () => {
  it('joins the contest room and re-ranks rows from scoreboard:row events', async () => {
    const fake = createFakeSocket();
    setSocketForTesting(fake.socket);
    const api = mockFetch({
      'GET /api/contests/autumn-sprint/scoreboard': () =>
        jsonResponse(200, scoreboard([scoreRow('alice', 2, 100, 1), scoreRow('bob', 1, 30, 2)])),
    });
    renderWithProviders(<LiveScoreboard slug="autumn-sprint" page={1} onPageChange={() => {}} />);

    expect(await screen.findByRole('link', { name: 'alice' })).toBeInTheDocument();
    expect(usernames()).toEqual(['alice', 'bob']);
    expect(fake.emitted).toContainEqual({
      event: 'contest:subscribe',
      args: [{ slug: 'autumn-sprint' }],
    });
    expect(api.requests[0]?.query.get('pageSize')).toBe('50');

    act(() =>
      fake.serverEmit('scoreboard:row', {
        contestSlug: 'autumn-sprint',
        row: scoreRow('bob', 2, 60, 1),
      }),
    );

    expect(usernames()).toEqual(['bob', 'alice']);
    const bobRow = screen.getByRole('link', { name: 'bob' }).closest('tr');
    expect(bobRow).toHaveAttribute('data-movement', 'up');
    expect(within(bobRow as HTMLElement).getByText(/up from 2/)).toBeInTheDocument();
  });

  it('shows an empty state before anyone has submitted', async () => {
    setSocketForTesting(createFakeSocket().socket);
    mockFetch({
      'GET /api/contests/autumn-sprint/scoreboard': () => jsonResponse(200, scoreboard([])),
    });
    renderWithProviders(<LiveScoreboard slug="autumn-sprint" page={1} onPageChange={() => {}} />);
    expect(await screen.findByText('No submissions yet')).toBeInTheDocument();
  });
});
