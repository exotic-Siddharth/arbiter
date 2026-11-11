import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiError, jsonResponse, mockFetch } from '@/test/fetchMock';
import { renderWithProviders } from '@/test/render';
import { Component as LeaderboardPage } from './LeaderboardPage';

const entries = [
  { rank: 1, username: 'grace', rating: 2310, solved: 14 },
  { rank: 2, username: 'linus', rating: 1650, solved: 11 },
  { rank: 2, username: 'ada_l', rating: 1650, solved: 9 },
  { rank: 4, username: 'newbie', rating: 1200, solved: 0 },
];

const page = { items: entries, total: 4, page: 1, pageSize: 25 };

describe('LeaderboardPage', () => {
  it('shares ranks for ties and marks them', async () => {
    mockFetch({ 'GET /api/leaderboard': () => jsonResponse(200, page) });
    renderWithProviders(<LeaderboardPage />, { route: '/leaderboard' });
    const rows = await screen.findAllByRole('row');
    // header + 4 entries
    expect(rows).toHaveLength(5);
    const tied = rows.filter((row) => within(row).queryByLabelText(/rank 2, tied/i));
    expect(tied).toHaveLength(2);
    expect(within(rows[1]).queryByLabelText(/tied/i)).not.toBeInTheDocument();
    expect(within(rows[4]).getByLabelText(/^rank 4$/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'grace' })).toHaveAttribute('href', '/u/grace');
  });

  it('requests the solved ordering when the Solved tab is chosen', async () => {
    const api = mockFetch({ 'GET /api/leaderboard': () => jsonResponse(200, page) });
    const user = userEvent.setup();
    renderWithProviders(<LeaderboardPage />, { route: '/leaderboard' });
    await screen.findByText('grace');
    expect(api.requests.at(-1)?.query.get('by')).toBe('rating');
    await user.click(screen.getByRole('tab', { name: /solved/i }));
    await screen.findByText('grace');
    expect(api.requests.at(-1)?.query.get('by')).toBe('solved');
  });

  it('shows an empty state', async () => {
    mockFetch({
      'GET /api/leaderboard': () =>
        jsonResponse(200, { items: [], total: 0, page: 1, pageSize: 25 }),
    });
    renderWithProviders(<LeaderboardPage />, { route: '/leaderboard' });
    expect(await screen.findByText(/no ranked players/i)).toBeInTheDocument();
  });

  it('shows an error state with retry', async () => {
    mockFetch({ 'GET /api/leaderboard': () => apiError(500, 'INTERNAL', 'Boom') });
    renderWithProviders(<LeaderboardPage />, { route: '/leaderboard' });
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('moves to the last page when ?page is past the end', async () => {
    const api = mockFetch({
      'GET /api/leaderboard': ({ query }) => {
        const requested = Number(query.get('page') ?? 1);
        return jsonResponse(200, {
          items: requested > 2 ? [] : entries,
          total: 40,
          page: requested,
          pageSize: 25,
        });
      },
    });
    const { router } = renderWithProviders(<LeaderboardPage />, { route: '/leaderboard?page=99' });
    await screen.findByText('grace');
    expect(new URLSearchParams(router.state.location.search).get('page')).toBe('2');
    expect(api.requests.at(-1)?.query.get('page')).toBe('2');
    expect(screen.queryByText(/no ranked players/i)).not.toBeInTheDocument();
  });
});
