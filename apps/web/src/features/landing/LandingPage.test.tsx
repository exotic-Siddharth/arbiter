import { act, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeedJudgedEvent } from '@arbiter/shared';
import { setSocketForTesting } from '@/lib/socket';
import { createFakeSocket } from '@/test/fakeSocket';
import { jsonResponse, mockFetch } from '@/test/fetchMock';
import { renderWithProviders } from '@/test/render';

const mockConfig = vi.hoisted(() => ({ demoLogin: false, appName: 'Arbiter' }));
vi.mock('@/lib/config', () => ({ config: mockConfig }));

import { Component as LandingPage } from './LandingPage';

const stats = {
  problems: 15,
  users: 1280,
  submissions: 48210,
  judgedToday: 312,
  runningContests: 1,
};

function event(overrides: Partial<FeedJudgedEvent> = {}): FeedJudgedEvent {
  return {
    username: 'grace',
    problemSlug: 'two-sum',
    problemTitle: 'Two Sum',
    language: 'PYTHON',
    verdict: 'AC',
    timeMs: 42,
    at: new Date().toISOString(),
    ...overrides,
  };
}

function routes(extra: Record<string, () => Response> = {}) {
  return mockFetch({
    'GET /api/stats': () => jsonResponse(200, stats),
    'GET /api/submissions': () => jsonResponse(200, { items: [], total: 0, page: 1, pageSize: 10 }),
    'GET /api/contests': () => jsonResponse(200, []),
    ...extra,
  });
}

describe('LandingPage', () => {
  beforeEach(() => {
    mockConfig.demoLogin = false;
  });

  it('prepends feed items from socket events', async () => {
    routes();
    const fake = createFakeSocket();
    setSocketForTesting(fake.socket);
    renderWithProviders(<LandingPage />);

    expect(await screen.findByText(/waiting for the next submission/i)).toBeInTheDocument();
    expect(fake.emitted).toContainEqual({ event: 'feed:subscribe', args: [] });

    act(() => fake.serverEmit('feed:judged', event({ username: 'grace' })));
    act(() =>
      fake.serverEmit(
        'feed:judged',
        event({ username: 'linus', verdict: 'WA', problemTitle: 'Bracket Maze' }),
      ),
    );

    const feed = await screen.findByRole('list', { name: /recently judged/i });
    const items = within(feed).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('linus');
    expect(items[0]).toHaveTextContent('Bracket Maze');
    expect(items[1]).toHaveTextContent('grace');
  });

  it('caps the feed length', async () => {
    routes();
    const fake = createFakeSocket();
    setSocketForTesting(fake.socket);
    renderWithProviders(<LandingPage />);
    await screen.findByText(/waiting for the next submission/i);
    for (let i = 0; i < 30; i += 1) {
      act(() => fake.serverEmit('feed:judged', event({ username: 'user_' + i })));
    }
    const feed = await screen.findByRole('list', { name: /recently judged/i });
    const items = within(feed).getAllByRole('listitem');
    expect(items.length).toBeLessThanOrEqual(12);
    expect(items[0]).toHaveTextContent('user_29');
  });

  it('seeds the feed from recent judged submissions and shows the stats', async () => {
    routes({
      'GET /api/submissions': () =>
        jsonResponse(200, {
          items: [
            {
              id: 's1',
              problem: { slug: 'fizz', title: 'Fizz Walk' },
              user: { username: 'ada_l' },
              language: 'CPP',
              status: 'DONE',
              verdict: 'AC',
              timeMs: 15,
              memoryKb: 2048,
              testsPassed: 10,
              testsTotal: 10,
              contestSlug: null,
              createdAt: '2026-11-08T10:00:00.000Z',
              judgedAt: '2026-11-08T10:00:01.000Z',
            },
          ],
          total: 1,
          page: 1,
          pageSize: 10,
        }),
    });
    setSocketForTesting(createFakeSocket().socket);
    renderWithProviders(<LandingPage />);
    expect(await screen.findByText('Fizz Walk')).toBeInTheDocument();
    expect(await screen.findByText('48,210')).toBeInTheDocument();
  });

  it('shows the running contest as the featured contest', async () => {
    routes({
      'GET /api/contests': () =>
        jsonResponse(200, [
          {
            slug: 'weekly-1',
            title: 'Weekly Round 1',
            startsAt: new Date(Date.now() - 3_600_000).toISOString(),
            endsAt: new Date(Date.now() + 3_600_000).toISOString(),
            status: 'RUNNING',
            problemCount: 5,
            participantCount: 42,
            isRegistered: false,
            rated: false,
          },
        ]),
    });
    setSocketForTesting(createFakeSocket().socket);
    renderWithProviders(<LandingPage />);
    const link = await screen.findByRole('link', { name: /weekly round 1/i });
    expect(link).toHaveAttribute('href', '/contests/weekly-1');
  });

  it('shows "Try the demo" to guests only when enabled', () => {
    routes();
    setSocketForTesting(createFakeSocket().socket);
    const first = renderWithProviders(<LandingPage />);
    expect(screen.queryByRole('button', { name: /try the demo/i })).not.toBeInTheDocument();
    first.unmount();

    mockConfig.demoLogin = true;
    setSocketForTesting(createFakeSocket().socket);
    renderWithProviders(<LandingPage />);
    expect(screen.getByRole('button', { name: /try the demo/i })).toBeInTheDocument();
  });

  it('describes the sandbox isolation layers', () => {
    routes();
    setSocketForTesting(createFakeSocket().socket);
    renderWithProviders(<LandingPage />);
    expect(screen.getByRole('heading', { name: /how the sandbox works/i })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /sandbox isolation/i })).toBeInTheDocument();
    expect(screen.getByText(/--network none/)).toBeInTheDocument();
  });
});
