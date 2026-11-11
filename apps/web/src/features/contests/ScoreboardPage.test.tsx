import { screen } from '@testing-library/react';
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
});
