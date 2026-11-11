import type { Me } from '@arbiter/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { useAuth } from '@/stores/auth';
import { apiError, jsonResponse, mockFetch } from '@/test/fetchMock';
import { renderWithProviders } from '@/test/render';
import { Component as ProfilePage } from './ProfilePage';

const heatmap = Array.from({ length: 365 }, (_, i) => ({
  date: new Date(Date.UTC(2026, 10, 8) - (364 - i) * 86_400_000).toISOString().slice(0, 10),
  count: i % 17 === 0 ? 5 : 0,
}));

const profile = {
  user: {
    username: 'ada_l',
    rating: 1650,
    bio: 'I like graphs.',
    createdAt: '2026-01-05T10:00:00.000Z',
  },
  stats: {
    solved: { EASY: 5, MEDIUM: 3, HARD: 1, total: 9 },
    available: { EASY: 6, MEDIUM: 6, HARD: 3 },
    submissions: 40,
    accepted: 12,
    acceptanceRate: 0.3,
    languages: [
      { language: 'PYTHON', count: 30 },
      { language: 'CPP', count: 10 },
    ],
    globalRank: 7,
  },
  heatmap,
  ratingHistory: [
    {
      contestSlug: 'weekly-1',
      contestTitle: 'Weekly Round 1',
      oldRating: 1200,
      newRating: 1450,
      rank: 3,
      date: '2026-03-01T12:00:00.000Z',
    },
    {
      contestSlug: 'weekly-2',
      contestTitle: 'Weekly Round 2',
      oldRating: 1450,
      newRating: 1650,
      rank: 2,
      date: '2026-04-01T12:00:00.000Z',
    },
  ],
  recentAccepted: [
    {
      problemSlug: 'two-sum',
      title: 'Two Sum',
      difficulty: 'EASY',
      at: '2026-11-07T10:00:00.000Z',
    },
  ],
};

const me: Me = {
  id: 'u1',
  username: 'ada_l',
  email: 'ada@example.com',
  role: 'USER',
  rating: 1650,
  bio: 'I like graphs.',
  createdAt: '2026-01-05T10:00:00.000Z',
};

const render = (user: Me | null = null) =>
  renderWithProviders(<ProfilePage />, { route: '/u/ada_l', path: '/u/:username', user });

describe('ProfilePage', () => {
  it('shows the profile sections', async () => {
    mockFetch({ 'GET /api/users/ada_l': () => jsonResponse(200, profile) });
    render();
    expect(await screen.findByRole('heading', { level: 1, name: 'ada_l' })).toBeInTheDocument();
    expect(screen.getByText('I like graphs.')).toBeInTheDocument();
    expect(screen.getByText('Global rank #7')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Easy' })).toHaveAttribute('aria-valuenow', '5');
    expect(screen.getByText('Two Sum')).toBeInTheDocument();
    expect(screen.getAllByTestId('heatmap-cell')).toHaveLength(365);
    expect(screen.getByRole('figure', { name: /rating history/i })).toHaveTextContent('peak 1650');
    expect(screen.queryByRole('button', { name: /edit bio/i })).not.toBeInTheDocument();
    expect(document.title).toBe('ada_l · Arbiter');
  });

  it('shows a not-found state for an unknown user', async () => {
    mockFetch({ 'GET /api/users/ada_l': () => apiError(404, 'NOT_FOUND', 'User not found') });
    render();
    expect(await screen.findByText('No such user')).toBeInTheDocument();
  });

  it('shows an error state with retry', async () => {
    mockFetch({ 'GET /api/users/ada_l': () => apiError(500, 'INTERNAL', 'Boom') });
    render();
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('shows empty states for a brand-new user', async () => {
    mockFetch({
      'GET /api/users/ada_l': () =>
        jsonResponse(200, {
          ...profile,
          user: { ...profile.user, bio: null, rating: 1200 },
          stats: {
            ...profile.stats,
            solved: { EASY: 0, MEDIUM: 0, HARD: 0, total: 0 },
            submissions: 0,
            accepted: 0,
            acceptanceRate: 0,
            languages: [],
            globalRank: null,
          },
          heatmap: heatmap.map((day) => ({ ...day, count: 0 })),
          ratingHistory: [],
          recentAccepted: [],
        }),
    });
    render();
    expect(await screen.findByText('No rated contests yet')).toBeInTheDocument();
    expect(screen.getByText('Nothing accepted yet')).toBeInTheDocument();
    expect(screen.getByText('Unranked')).toBeInTheDocument();
    expect(screen.getByText(/no submissions in the last year/i)).toBeInTheDocument();
  });

  it('lets the owner edit the bio', async () => {
    const api = mockFetch({
      'GET /api/users/ada_l': () => jsonResponse(200, profile),
      'PATCH /api/users/me': ({ body }) =>
        jsonResponse(200, { user: { ...me, bio: (body as { bio: string }).bio } }),
    });
    const user = userEvent.setup();
    render(me);
    await user.click(await screen.findByRole('button', { name: /edit bio/i }));
    const box = screen.getByLabelText('Bio');
    await user.clear(box);
    await user.type(box, 'Now I like DP.');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(useAuth.getState().user?.bio).toBe('Now I like DP.'));
    const patch = api.requests.find((request) => request.method === 'PATCH');
    expect(patch?.body).toEqual({ bio: 'Now I like DP.' });
  });

  it('rejects a bio over 280 characters before sending', async () => {
    const api = mockFetch({ 'GET /api/users/ada_l': () => jsonResponse(200, profile) });
    const user = userEvent.setup();
    render(me);
    await user.click(await screen.findByRole('button', { name: /edit bio/i }));
    const box = screen.getByLabelText('Bio');
    await user.clear(box);
    await user.click(box);
    await user.paste('x'.repeat(285));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/at most 280 characters/i)).toBeInTheDocument();
    expect(api.requests.some((request) => request.method === 'PATCH')).toBe(false);
  });
});
