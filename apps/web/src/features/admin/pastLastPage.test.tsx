import type { AdminContestSummary, AdminProblemSummary, AdminUser } from '@arbiter/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { jsonResponse, mockFetch, type MockRequest } from '@/test/fetchMock';
import { renderWithProviders } from '@/test/render';
import { Component as AdminContestsPage } from './AdminContestsPage';
import { Component as AdminProblemsPage } from './AdminProblemsPage';
import { Component as AdminUsersPage } from './AdminUsersPage';
import { adminUser, adminUserRow } from './test/fixtures';

// A-R3-05: a page past the end (an old link, or the last row of the last page deleted) moves to
// the real last page, replacing the URL, instead of showing a false empty state.

const problem = (index: number): AdminProblemSummary => ({
  id: `p_${index}`,
  slug: `problem-${index}`,
  title: `Problem ${index}`,
  difficulty: 'EASY',
  isPublished: true,
  tags: [],
  testCount: 2,
  submissionCount: 0,
  acceptedCount: 0,
  hasReference: true,
  updatedAt: '2026-10-01T10:00:00.000Z',
});

const contest = (index: number): AdminContestSummary => ({
  id: `c_${index}`,
  slug: `contest-${index}`,
  title: `Contest ${index}`,
  startsAt: '2026-10-01T10:00:00.000Z',
  endsAt: '2026-10-01T12:00:00.000Z',
  status: 'ENDED',
  isPublished: true,
  problemCount: 3,
  participantCount: 10,
  ratedAt: null,
});

const user = (index: number): AdminUser =>
  adminUserRow({ id: `u_${index}`, username: `user_${index}`, email: `u${index}@example.com` });

/** toPage on the server: a page past the end is empty with the real total. */
function pageOf<T>(items: T[], request: MockRequest) {
  const page = Number(request.query.get('page') ?? '1');
  const pageSize = Number(request.query.get('pageSize') ?? '20');
  return jsonResponse(200, {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    total: items.length,
    page,
    pageSize,
  });
}

const cases: [string, string, () => ReactElement, () => unknown[], string][] = [
  ['problems', '/api/admin/problems', () => <AdminProblemsPage />, () => [problem(1)], 'Problem 1'],
  ['contests', '/api/admin/contests', () => <AdminContestsPage />, () => [contest(1)], 'Contest 1'],
  ['users', '/api/admin/users', () => <AdminUsersPage />, () => [user(1)], 'user_1'],
];

describe('admin lists past the last page', () => {
  it.each(cases)(
    '/admin/%s?page=7 with one item moves to page 1 (replace) and shows it',
    async (name, path, page, items, text) => {
      const api = mockFetch({ [`GET ${path}`]: (request) => pageOf(items(), request) });
      const { router } = renderWithProviders(page(), {
        route: `/admin/${name}?page=7`,
        user: adminUser,
      });
      expect(await screen.findByText(text)).toBeInTheDocument();
      expect(router.state.location.search).toBe('');
      expect(router.state.historyAction).toBe('REPLACE');
      expect(api.requests.at(-1)?.query.get('page')).toBe('1');
    },
  );

  it('deleting the last row of the last page moves to the page before', async () => {
    const problems = Array.from({ length: 21 }, (_, index) => problem(index + 1));
    mockFetch({
      'GET /api/admin/problems': (request) => pageOf(problems, request),
      'DELETE /api/admin/problems/p_21': () => {
        problems.pop();
        return new Response(null, { status: 204 });
      },
    });
    const actor = userEvent.setup();
    const { router } = renderWithProviders(<AdminProblemsPage />, {
      route: '/admin/problems?page=2',
      user: adminUser,
    });
    await actor.click(await screen.findByRole('button', { name: 'Delete Problem 21' }));
    await actor.click(await screen.findByRole('button', { name: 'Delete problem' }));
    expect(await screen.findByText('Problem 20')).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(screen.queryByText('No problems yet')).not.toBeInTheDocument();
  });
});
