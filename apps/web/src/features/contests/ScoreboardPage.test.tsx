import { screen, waitFor } from '@testing-library/react';
import { LIMITS } from '@arbiter/shared';
import { describe, expect, it } from 'vitest';
import { setSocketForTesting } from '@/lib/socket';
import { createFakeSocket } from '@/test/fakeSocket';
import { jsonResponse, mockFetch } from '@/test/fetchMock';
import { renderWithProviders } from '@/test/render';
import { Component as ScoreboardPage } from './ScoreboardPage';
import { contestDetail, scoreRow, scoreboard } from './test/fixtures';

describe('ScoreboardPage ?page=', () => {
  it.each(['1.5', 'Infinity', 'abc', '0', '-2'])(
    'asks the API for page 1 when ?page=%s is not a positive integer',
    async (raw) => {
      setSocketForTesting(createFakeSocket().socket);
      const api = mockFetch({
        'GET /api/contests/autumn-sprint': () => jsonResponse(200, contestDetail(Date.now())),
        'GET /api/contests/autumn-sprint/scoreboard': () =>
          jsonResponse(200, scoreboard([scoreRow('alice', 2, 100, 1)])),
      });
      renderWithProviders(<ScoreboardPage />, {
        route: `/contests/autumn-sprint/scoreboard?page=${raw}`,
        path: '/contests/:slug/scoreboard',
      });
      expect(await screen.findByRole('link', { name: 'alice' })).toBeInTheDocument();
      const board = api.requests.find((request) => request.path.endsWith('/scoreboard'));
      expect(board?.query.get('page')).toBe('1');
    },
  );

  it.each(['5000000', '1e300'])(
    'asks the API for its highest page when ?page=%s is above it (A-R2-17)',
    async (raw) => {
      setSocketForTesting(createFakeSocket().socket);
      const api = mockFetch({
        'GET /api/contests/autumn-sprint': () => jsonResponse(200, contestDetail(Date.now())),
        'GET /api/contests/autumn-sprint/scoreboard': () =>
          jsonResponse(200, scoreboard([scoreRow('alice', 2, 100, 1)])),
      });
      renderWithProviders(<ScoreboardPage />, {
        route: `/contests/autumn-sprint/scoreboard?page=${raw}`,
        path: '/contests/:slug/scoreboard',
      });
      await screen.findByRole('link', { name: 'alice' });
      const board = api.requests.find((request) => request.path.endsWith('/scoreboard'));
      expect(board?.query.get('page')).toBe(String(LIMITS.pageMax));
    },
  );

  it('keeps a valid page', async () => {
    setSocketForTesting(createFakeSocket().socket);
    const api = mockFetch({
      'GET /api/contests/autumn-sprint': () => jsonResponse(200, contestDetail(Date.now())),
      'GET /api/contests/autumn-sprint/scoreboard': () =>
        jsonResponse(200, scoreboard([scoreRow('alice', 2, 100, 1)], { page: 3 })),
    });
    renderWithProviders(<ScoreboardPage />, {
      route: '/contests/autumn-sprint/scoreboard?page=3',
      path: '/contests/:slug/scoreboard',
    });
    await screen.findByRole('link', { name: 'alice' });
    const board = api.requests.find((request) => request.path.endsWith('/scoreboard'));
    expect(board?.query.get('page')).toBe('3');
  });
  it('moves a page past the end to the last page, replacing the URL (A-R3-05)', async () => {
    setSocketForTesting(createFakeSocket().socket);
    const rows = [scoreRow('alice', 2, 100, 1), scoreRow('bob', 1, 30, 2)];
    const api = mockFetch({
      'GET /api/contests/autumn-sprint': () => jsonResponse(200, contestDetail(Date.now())),
      'GET /api/contests/autumn-sprint/scoreboard': ({ query }) => {
        const page = Number(query.get('page'));
        return jsonResponse(200, scoreboard(page === 1 ? rows : [], { page, total: 2 }));
      },
    });
    const { router } = renderWithProviders(<ScoreboardPage />, {
      route: '/contests/autumn-sprint/scoreboard?page=5000000',
      path: '/contests/:slug/scoreboard',
    });
    expect(await screen.findByRole('link', { name: 'alice' })).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.search).toBe('?page=1'));
    expect(router.state.historyAction).toBe('REPLACE');
    expect(screen.queryByText('No submissions yet')).not.toBeInTheDocument();
    const boards = api.requests.filter((request) => request.path.endsWith('/scoreboard'));
    expect(boards.at(-1)?.query.get('page')).toBe('1');
  });
});
