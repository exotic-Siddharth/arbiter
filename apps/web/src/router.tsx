import { createBrowserRouter, type RouteObject } from 'react-router';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AppShell, type RouteHandle } from '@/components/layout/AppShell';
import { GuestOnly, RequireAdmin } from '@/components/layout/guards';
import { RouteError } from '@/components/layout/RouteError';
import { ShellFallback } from '@/components/layout/ShellFallback';

const workspace: RouteHandle = { layout: 'workspace' };

/**
 * Every route of spec 13.2. Feature pages are lazy modules that export `Component` (and
 * `default`), R18: lanes replace the page files but keep their paths and that export.
 */
export const routes: RouteObject[] = [
  {
    id: 'root',
    element: <AppShell />,
    HydrateFallback: ShellFallback,
    errorElement: <RouteError />,
    children: [
      {
        // Errors inside a page render within the shell (navbar stays usable).
        errorElement: <RouteError />,
        children: [
          { index: true, lazy: () => import('@/features/landing/LandingPage') },
          {
            element: <GuestOnly />,
            children: [
              { path: 'login', lazy: () => import('@/features/auth/LoginPage') },
              { path: 'register', lazy: () => import('@/features/auth/RegisterPage') },
            ],
          },
          { path: 'problems', lazy: () => import('@/features/problems/ProblemsPage') },
          {
            path: 'problems/:slug',
            handle: workspace,
            lazy: () => import('@/features/problems/ProblemWorkspacePage'),
          },
          { path: 'submissions', lazy: () => import('@/features/submissions/SubmissionsPage') },
          {
            path: 'submissions/:id',
            lazy: () => import('@/features/submissions/SubmissionDetailPage'),
          },
          { path: 'contests', lazy: () => import('@/features/contests/ContestsPage') },
          { path: 'contests/:slug', lazy: () => import('@/features/contests/ContestPage') },
          {
            path: 'contests/:slug/scoreboard',
            lazy: () => import('@/features/contests/ScoreboardPage'),
          },
          {
            path: 'contests/:slug/problems/:label',
            handle: workspace,
            lazy: () => import('@/features/problems/ProblemWorkspacePage'),
          },
          { path: 'u/:username', lazy: () => import('@/features/profile/ProfilePage') },
          { path: 'leaderboard', lazy: () => import('@/features/leaderboard/LeaderboardPage') },
          {
            path: 'admin',
            element: (
              <RequireAdmin>
                <AdminLayout />
              </RequireAdmin>
            ),
            children: [
              { index: true, lazy: () => import('@/features/admin/JudgeMonitorPage') },
              { path: 'problems', lazy: () => import('@/features/admin/AdminProblemsPage') },
              {
                path: 'problems/new',
                lazy: () => import('@/features/admin/AdminProblemEditorPage'),
              },
              {
                path: 'problems/:id',
                lazy: () => import('@/features/admin/AdminProblemEditorPage'),
              },
              { path: 'contests', lazy: () => import('@/features/admin/AdminContestsPage') },
              {
                path: 'contests/new',
                lazy: () => import('@/features/admin/AdminContestEditorPage'),
              },
              {
                path: 'contests/:id',
                lazy: () => import('@/features/admin/AdminContestEditorPage'),
              },
              { path: 'plagiarism', lazy: () => import('@/features/admin/PlagiarismPage') },
              {
                path: 'plagiarism/:id',
                lazy: () => import('@/features/admin/PlagiarismReportPage'),
              },
              { path: 'users', lazy: () => import('@/features/admin/AdminUsersPage') },
            ],
          },
          // Development-only UI kit gallery (removed from production builds).
          ...(import.meta.env.DEV
            ? [{ path: 'dev/kit', lazy: () => import('@/dev/KitPage') } satisfies RouteObject]
            : []),
          { path: '*', lazy: () => import('@/features/NotFoundPage') },
        ],
      },
    ],
  },
];

/** The app's browser router (App.tsx creates it once). */
export function createAppRouter() {
  return createBrowserRouter(routes);
}
