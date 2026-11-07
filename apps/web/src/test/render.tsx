import type { Me } from '@arbiter/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { useAuth } from '@/stores/auth';

export interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  /** URL to render at (default '/'). */
  route?: string;
  /** Route pattern for useParams, e.g. '/problems/:slug' (default: matches any path). */
  path?: string;
  /** A QueryClient to inspect; default: a fresh one without retries. */
  queryClient?: QueryClient;
  /** Signed-in user (status 'authenticated', token 'test-token'); null = guest. */
  user?: Me | null;
}

export interface RenderWithProvidersResult extends RenderResult {
  queryClient: QueryClient;
  router: ReturnType<typeof createMemoryRouter>;
}

/** A QueryClient for tests: no retries, no refetch on focus, no garbage-collection timers. */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
}

/**
 * Renders `ui` inside QueryClientProvider and a memory router, with the auth store set to the
 * given user (or guest):
 *
 *   const { router } = renderWithProviders(<ProblemsPage />, { route: '/problems?page=2', user: demo });
 *   expect(router.state.location.search).toBe('?page=2');
 */
export function renderWithProviders(
  ui: ReactElement,
  { route = '/', path = '*', queryClient, user = null, ...options }: RenderWithProvidersOptions = {},
): RenderWithProvidersResult {
  const client = queryClient ?? createTestQueryClient();
  useAuth.setState(
    user
      ? { status: 'authenticated', user, accessToken: 'test-token' }
      : { status: 'guest', user: null, accessToken: null },
  );
  const router = createMemoryRouter([{ path, element: ui }], { initialEntries: [route] });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const result = render(<RouterProvider router={router} />, { wrapper, ...options });
  return { ...result, queryClient: client, router };
}
