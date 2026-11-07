import { QueryClient } from '@tanstack/react-query';
import { useAuth, type AuthState } from '@/stores/auth';
import { isApiError } from './http';

/** Most retries for a failed query (5xx and network errors only). */
export const MAX_QUERY_RETRIES = 2;

/**
 * TanStack Query retry policy (R18): never retry 4xx (and never a response that failed schema
 * validation); retry 5xx and network errors at most twice.
 */
export function retryPolicy(failureCount: number, error: unknown): boolean {
  if (isApiError(error)) {
    if (error.status >= 400 && error.status < 500) return false;
    if (error.code === 'INVALID_RESPONSE') return false;
  }
  return failureCount < MAX_QUERY_RETRIES;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: retryPolicy,
        staleTime: 15_000,
        refetchOnWindowFocus: true,
      },
      mutations: { retry: false },
    },
  });
}

/** The app's QueryClient (App.tsx provides it). */
export const queryClient = createQueryClient();

const identityOf = (state: Pick<AuthState, 'user'>) =>
  state.user ? `${state.user.id}:${state.user.role}` : 'guest';

/**
 * Refetch everything when the signed-in identity changes (login, logout, session expiry):
 * user-specific fields such as userStatus, isRegistered and "mine" lists depend on it.
 * The boot transition from 'unknown' is skipped (requests wait for it). Returns the unsubscribe.
 */
export function bindQueryClientToAuth(client: QueryClient = queryClient): () => void {
  return useAuth.subscribe((state, previous) => {
    if (previous.status === 'unknown') return;
    if (identityOf(state) !== identityOf(previous)) void client.resetQueries();
  });
}
