import type { Me } from '@arbiter/shared';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { createQueryClient } from '@/lib/queryClient';
import { useAuth } from '@/stores/auth';
import { routes } from './router';

const admin: Me = {
  id: 'u_admin',
  username: 'admin',
  email: 'admin@example.com',
  role: 'ADMIN',
  rating: 2210,
  bio: null,
  createdAt: '2026-11-01T00:00:00.000Z',
};

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

const PUBLIC_PAGES: [string, string | RegExp][] = [
  ['/', /write code\. get judged in a sandbox\. climb the board\./i],
  ['/problems', 'Problems'],
  ['/problems/two-sum-variant', 'two-sum-variant'],
  ['/submissions', 'Submissions'],
  ['/submissions/sub_1', 'Submission sub_1'],
  ['/contests', 'Contests'],
  ['/contests/weekly-practice-arena', 'weekly-practice-arena'],
  ['/contests/weekly-practice-arena/scoreboard', 'Scoreboard'],
  ['/contests/weekly-practice-arena/problems/B', 'Problem B'],
  ['/u/demo', 'demo'],
  ['/leaderboard', 'Leaderboard'],
  ['/no/such/page', 'Page not found'],
];

const ADMIN_PAGES: [string, string][] = [
  ['/admin', 'Judge monitor'],
  ['/admin/problems', 'Problems'],
  ['/admin/problems/new', 'New problem'],
  ['/admin/problems/p_1', 'Edit problem'],
  ['/admin/contests', 'Contests'],
  ['/admin/contests/new', 'New contest'],
  ['/admin/contests/c_1', 'Edit contest'],
  ['/admin/plagiarism', 'Plagiarism'],
  ['/admin/plagiarism/r_1', 'Plagiarism report'],
  ['/admin/users', 'Users'],
];

describe('router', () => {
  it.each(PUBLIC_PAGES)('%s renders its page title inside the shell', async (path, title) => {
    useAuth.setState({ status: 'guest' });
    renderAt(path);
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(within(screen.getByRole('banner')).getByRole('link', { name: 'Arbiter' })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it.each(ADMIN_PAGES)('%s renders inside the admin layout for admins', async (path, title) => {
    useAuth.setState({ status: 'authenticated', user: admin, accessToken: 'token' });
    renderAt(path);
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Admin' })).toBeInTheDocument();
  });

  it.each([
    ['/login', 'Log in'],
    ['/register', 'Create your account'],
  ])('%s renders for guests', async (path, title) => {
    useAuth.setState({ status: 'guest' });
    renderAt(path);
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument();
  });

  it('redirects signed-in users away from /login to ?next', async () => {
    useAuth.setState({ status: 'authenticated', user: { ...admin, role: 'USER' }, accessToken: 't' });
    const router = renderAt('/login?next=%2Fcontests');
    expect(await screen.findByRole('heading', { level: 1, name: 'Contests' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/contests');
  });

  it('sends guests from /admin to the login page with next', async () => {
    useAuth.setState({ status: 'guest' });
    const router = renderAt('/admin/users');
    expect(await screen.findByRole('heading', { level: 1, name: 'Log in' })).toBeInTheDocument();
    expect(router.state.location.search).toBe('?next=%2Fadmin%2Fusers');
  });

  it('shows a 403 state to signed-in non-admins', async () => {
    useAuth.setState({ status: 'authenticated', user: { ...admin, role: 'USER' }, accessToken: 't' });
    renderAt('/admin');
    expect(await screen.findByRole('heading', { name: 'Admins only' })).toBeInTheDocument();
  });
});
