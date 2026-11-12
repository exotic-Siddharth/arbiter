import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LIMITS } from '@arbiter/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiError, jsonResponse, mockFetch } from '@/test/fetchMock';
import { renderWithProviders } from '@/test/render';
import { RatingsCard } from './components/ContestActions';
import { ExistingContest } from './components/ContestEditor';
import { niceMax } from './lib/chartScale';
import { Component as AdminUsersPage } from './AdminUsersPage';
import { Component as JudgeMonitorPage } from './JudgeMonitorPage';
import { Component as PlagiarismReportPage } from './PlagiarismReportPage';
import {
  adminContest,
  adminUser,
  adminUserRow,
  judgeStatus,
  plagiarismReport,
} from './test/fixtures';

describe('JudgeMonitorPage', () => {
  it('shows queue counts, latency percentiles, workers and one chart column per minute', async () => {
    mockFetch({ 'GET /api/admin/judge': () => jsonResponse(200, judgeStatus(Date.now())) });
    renderWithProviders(<JudgeMonitorPage />, { route: '/admin', user: adminUser });

    expect(await screen.findByText('Latency p50')).toBeInTheDocument();
    expect(screen.getByText('840 ms')).toBeInTheDocument();
    expect(screen.getByText('Auto-refresh every 5 s')).toBeInTheDocument();

    const queues = screen.getByRole('table', { name: 'Queue counts' });
    const judgeRow = within(queues).getByText('Judge').closest('tr') as HTMLElement;
    expect(
      within(judgeRow)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual([expect.stringContaining('Judge'), '3', '2', '0', '1,480', '1']);
    expect(
      within(screen.getByRole('table', { name: 'Workers' })).getByText(/worker-7f3a/),
    ).toBeInTheDocument();

    const chart = screen.getByRole('figure', { name: 'Throughput per minute' });
    expect(within(chart).getAllByRole('button', { name: /submissions? judged/ })).toHaveLength(30);
  });

  it('polls GET /admin/judge again every 5 seconds', async () => {
    // Fake timers would also freeze the query client; a real 5 s wait is acceptable once.
    const api = mockFetch({
      'GET /api/admin/judge': () => jsonResponse(200, judgeStatus(Date.now())),
    });
    renderWithProviders(<JudgeMonitorPage />, { route: '/admin', user: adminUser });
    await screen.findByText('Latency p50');
    expect(api.requests).toHaveLength(1);
    await waitFor(() => expect(api.requests.length).toBeGreaterThanOrEqual(2), { timeout: 7000 });
  }, 12000);

  it('shows an error state with a retry when the monitor cannot load', async () => {
    mockFetch({ 'GET /api/admin/judge': () => apiError(500, 'INTERNAL', 'Redis is down') });
    renderWithProviders(<JudgeMonitorPage />, { route: '/admin', user: adminUser });
    expect(await screen.findByRole('button', { name: /try again|retry/i })).toBeInTheDocument();
  });
});

describe('niceMax', () => {
  it('rounds the axis maximum up to a clean step', () => {
    expect([0, 3, 5, 7, 15, 23, 130].map(niceMax)).toEqual([4, 4, 5, 10, 20, 40, 200]);
  });
});

describe('AdminUsersPage', () => {
  it('confirms before changing a role and sends PATCH with the new role', async () => {
    const api = mockFetch({
      'GET /api/admin/users': () =>
        jsonResponse(200, {
          items: [adminUserRow(), adminUserRow({ id: 'u_admin', username: 'root', role: 'ADMIN' })],
          total: 2,
          page: 1,
          pageSize: 25,
        }),
      'PATCH /api/admin/users/u_1': () =>
        jsonResponse(200, { user: adminUserRow({ role: 'ADMIN' }) }),
    });
    const user = userEvent.setup();
    renderWithProviders(<AdminUsersPage />, { route: '/admin/users', user: adminUser });

    await user.click(
      await screen.findByRole('button', { name: /Make admin for priya_k/ }, { timeout: 5000 }),
    );
    // Nothing is sent until the dialog is confirmed.
    expect(api.requests.some((r) => r.method === 'PATCH')).toBe(false);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Make priya_k an admin?');
    await user.click(within(dialog).getByRole('button', { name: 'Make admin' }));

    await waitFor(() => expect(api.requests.some((r) => r.method === 'PATCH')).toBe(true));
    expect(api.requests.find((r) => r.method === 'PATCH')?.body).toEqual({ role: 'ADMIN' });
    // The signed-in admin cannot demote themselves.
    expect(screen.getByRole('button', { name: /Remove admin for root/ })).toBeDisabled();
  }, 20_000);

  it('clamps ?page above the API maximum (A-R2-17)', async () => {
    const api = mockFetch({
      'GET /api/admin/users': ({ query }) =>
        Number(query.get('page')) > LIMITS.pageMax
          ? apiError(400, 'VALIDATION', 'page too large')
          : jsonResponse(200, { items: [], total: 0, page: 1, pageSize: 25 }),
    });
    renderWithProviders(<AdminUsersPage />, {
      route: '/admin/users?page=2000000',
      user: adminUser,
    });
    expect(await screen.findByText('No users match')).toBeInTheDocument();
    expect(api.requests[0]?.query.get('page')).toBe(String(LIMITS.pageMax));
  });

  it('sends the search text to the API', async () => {
    const api = mockFetch({
      'GET /api/admin/users': () =>
        jsonResponse(200, { items: [], total: 0, page: 1, pageSize: 25 }),
    });
    const user = userEvent.setup();
    renderWithProviders(<AdminUsersPage />, { route: '/admin/users', user: adminUser });
    await user.type(await screen.findByRole('textbox', { name: 'Search users' }), 'priya');
    await waitFor(() => expect(api.requests.at(-1)?.query.get('search')).toBe('priya'));
    expect(await screen.findByText('No users match')).toBeInTheDocument();
  });
});

describe('PlagiarismReportPage', () => {
  it('lists pairs by similarity and highlights matched lines of the chosen pair', async () => {
    mockFetch({ 'GET /api/admin/plagiarism/r_1': () => jsonResponse(200, plagiarismReport()) });
    const user = userEvent.setup();
    renderWithProviders(<PlagiarismReportPage />, {
      route: '/admin/plagiarism/r_1',
      path: '/admin/plagiarism/:id',
      user: adminUser,
    });

    const table = await screen.findByRole('table', { name: 'Similar pairs' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('94%');
    expect(rows[1]).toHaveTextContent('71%');

    // First pair is open by default: matched lines 3-5 are marked on both sides.
    const paneA = screen.getByRole('region', { name: 'A: mira' });
    const matched = paneA.querySelectorAll('[data-matched="true"]');
    expect(matched).toHaveLength(3);
    expect(matched[0]).toHaveTextContent('int main() {');
    expect(
      screen.getByRole('region', { name: 'B: jonas' }).querySelectorAll('[data-matched="true"]'),
    ).toHaveLength(3);

    await user.click(within(rows[1] as HTMLElement).getByRole('button', { name: /Compare/ }));
    expect(
      screen.getByRole('region', { name: 'A: ana' }).querySelectorAll('[data-matched="true"]'),
    ).toHaveLength(1);
  });

  it('shows the empty state when nothing reached the threshold', async () => {
    mockFetch({
      'GET /api/admin/plagiarism/r_1': () =>
        jsonResponse(200, plagiarismReport({ pairs: [], pairCount: 0 })),
    });
    renderWithProviders(<PlagiarismReportPage />, {
      route: '/admin/plagiarism/r_1',
      path: '/admin/plagiarism/:id',
      user: adminUser,
    });
    expect(await screen.findByText('No pair reached the threshold')).toBeInTheDocument();
  });
});

describe('RatingsCard', () => {
  it('asks for confirmation, then shows the rating changes', async () => {
    const api = mockFetch({
      'POST /api/admin/contests/c_1/rate': () =>
        jsonResponse(200, {
          changes: [
            { username: 'mira', oldRating: 1500, newRating: 1532, rank: 1 },
            { username: 'jonas', oldRating: 1500, newRating: 1468, rank: 2 },
          ],
        }),
    });
    const user = userEvent.setup();
    renderWithProviders(<RatingsCard contest={adminContest()} />, { user: adminUser });

    await user.click(screen.getByRole('button', { name: 'Apply ratings' }));
    expect(api.requests).toHaveLength(0);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Apply ratings' }));

    const table = await screen.findByRole('table', { name: 'Rating changes' });
    expect(within(table).getByText('+32')).toBeInTheDocument();
    expect(within(table).getByText('−32')).toBeInTheDocument();
  });

  it('is disabled until the contest has ended', () => {
    mockFetch({});
    renderWithProviders(<RatingsCard contest={adminContest({ status: 'RUNNING' })} />, {
      user: adminUser,
    });
    expect(screen.getByRole('button', { name: 'Apply ratings' })).toBeDisabled();
  });

  it('stays disabled and says why while counted submissions are still being judged (A-03)', () => {
    mockFetch({});
    renderWithProviders(<RatingsCard contest={adminContest({ pendingSubmissions: 3 })} />, {
      user: adminUser,
    });
    expect(screen.getByRole('button', { name: 'Apply ratings' })).toBeDisabled();
    expect(screen.getByText(/3 submissions are still being judged/)).toBeInTheDocument();
  });

  describe('in the contest editor (A-R2-14)', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('re-reads the contest while submissions are judged and enables itself afterwards', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      let pending = 3;
      const api = mockFetch({
        'GET /api/admin/contests/c_1': () =>
          jsonResponse(200, adminContest({ pendingSubmissions: pending })),
      });
      renderWithProviders(<ExistingContest id="c_1" />, { user: adminUser });
      expect(await screen.findByText(/3 submissions are still being judged/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Apply ratings' })).toBeDisabled();

      pending = 0;
      await act(() => vi.advanceTimersByTimeAsync(5_000));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Apply ratings' })).toBeEnabled(),
      );
      const reads = api.requests.length;
      expect(reads).toBeGreaterThanOrEqual(2);

      // Nothing left to judge: polling stops.
      await act(() => vi.advanceTimersByTimeAsync(15_000));
      expect(api.requests).toHaveLength(reads);
    });

    it('re-reads the contest at its end, so Apply ratings enables itself (A-R3-06)', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const startsAt = new Date(Date.now() - 60 * 60_000).toISOString();
      const endsAt = new Date(Date.now() + 10_000).toISOString();
      const api = mockFetch({
        'GET /api/admin/contests/c_1': () =>
          jsonResponse(
            200,
            adminContest({
              startsAt,
              endsAt,
              status: Date.now() < Date.parse(endsAt) ? 'RUNNING' : 'ENDED',
              pendingSubmissions: 0,
            }),
          ),
      });
      renderWithProviders(<ExistingContest id="c_1" />, { user: adminUser });
      expect(await screen.findByText(/it is running now/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Apply ratings' })).toBeDisabled();

      await act(() => vi.advanceTimersByTimeAsync(15_000));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Apply ratings' })).toBeEnabled(),
      );
      expect(screen.queryByText(/it is running now/)).not.toBeInTheDocument();
      const reads = api.requests.length;
      expect(reads).toBe(2);

      // Ended and nothing to judge: no further polling.
      await act(() => vi.advanceTimersByTimeAsync(60_000));
      expect(api.requests).toHaveLength(reads);
    });
  });

  it('explains a 409 from the server', async () => {
    mockFetch({
      'POST /api/admin/contests/c_1/rate': () =>
        apiError(409, 'CONFLICT', 'Ratings were already applied'),
      'GET /api/admin/contests/c_1': () => jsonResponse(200, adminContest()),
    });
    const user = userEvent.setup();
    renderWithProviders(<RatingsCard contest={adminContest()} />, { user: adminUser });
    await user.click(screen.getByRole('button', { name: 'Apply ratings' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Apply ratings' }),
    );
    expect(await screen.findByText('Ratings were already applied')).toBeInTheDocument();
  });
});
