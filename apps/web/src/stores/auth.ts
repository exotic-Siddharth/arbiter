import { AuthResponseSchema, type AuthResponse, type Me, type RegisterBody } from '@arbiter/shared';
import { toast } from 'sonner';
import { create } from 'zustand';
import { isApiError, parseResponse, send } from '@/lib/http';
import { readStorage, removeStorage, writeStorage } from '@/lib/storage';

export type AuthStatus = 'unknown' | 'authenticated' | 'guest';

export interface AuthState {
  user: Me | null;
  /** JWT access token, kept in memory only (spec section 10). */
  accessToken: string | null;
  /** 'unknown' until the boot refresh has settled. */
  status: AuthStatus;

  /** POST /auth/login. Rejects with ApiError (401 generic, 429 rate limited, 400 validation). */
  login(identifier: string, password: string): Promise<Me>;
  /** POST /auth/register. Rejects with ApiError (409 duplicate, 400 validation, 429). */
  register(body: RegisterBody): Promise<Me>;
  /** POST /auth/demo (R4): logs in as the demo user. */
  loginDemo(): Promise<Me>;
  /**
   * POST /auth/logout; the local session is cleared immediately, even if the request fails.
   * Resolves true when the server confirmed the logout (the refresh cookie was revoked).
   */
  logout(): Promise<boolean>;
  /**
   * POST /auth/refresh, single-flight: concurrent callers (boot, every 401, the socket) share
   * one request, serialised across tabs with navigator.locks. Resolves true when the session
   * was renewed. A rejected refresh token (401/403) logs out; a network failure, a 5xx or a
   * transient 4xx such as 429 (the cookie is still valid) keeps the session.
   */
  refresh(): Promise<boolean>;
  /** Silent refresh on app boot (idempotent; main.tsx calls it once). */
  bootstrap(): Promise<void>;
  /** Resolves once status is no longer 'unknown' (starts bootstrap if needed). */
  ready(): Promise<void>;
  /** Replace the signed-in user, e.g. after PATCH /users/me. */
  setUser(user: Me): void;
}

/**
 * Set while a refresh-token cookie is believed to exist. Without it the boot refresh is skipped,
 * so guests make no request (and see no 401) before the first page renders.
 */
const SESSION_HINT_KEY = 'arbiter:session';
const REFRESH_LOCK = 'arb-refresh';

/** Bumped by login/register/logout so a refresh that started earlier cannot overwrite them. */
let sessionEpoch = 0;
let refreshInFlight: Promise<boolean> | null = null;
let bootPromise: Promise<void> | null = null;

async function withRefreshLock<T>(task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  // Serialises refreshes across tabs: the second tab sends the cookie rotated by the first,
  // so refresh-token reuse detection never fires.
  if (locks && typeof locks.request === 'function') return await locks.request(REFRESH_LOCK, task);
  return task();
}

async function postAuth(path: string, body?: unknown): Promise<AuthResponse> {
  const response = await send({ method: 'POST', path, body });
  return parseResponse(response, AuthResponseSchema);
}

const initialState = {
  user: null,
  accessToken: null,
  status: 'unknown' as AuthStatus,
};

export const useAuth = create<AuthState>()((set, get) => {
  const applySession = (session: AuthResponse): Me => {
    writeStorage(SESSION_HINT_KEY, '1');
    set({ user: session.user, accessToken: session.accessToken, status: 'authenticated' });
    return session.user;
  };

  const clearSession = () => {
    removeStorage(SESSION_HINT_KEY);
    set({ user: null, accessToken: null, status: 'guest' });
  };

  const authenticate = async (path: string, body?: unknown): Promise<Me> => {
    sessionEpoch += 1;
    const epoch = sessionEpoch;
    const session = await postAuth(path, body);
    if (epoch !== sessionEpoch) return session.user; // superseded by a later login/logout
    return applySession(session);
  };

  return {
    ...initialState,

    login: (identifier, password) => authenticate('/auth/login', { identifier, password }),
    register: (body) => authenticate('/auth/register', body),
    loginDemo: () => authenticate('/auth/demo'),

    async logout() {
      sessionEpoch += 1;
      clearSession();
      try {
        const response = await send({ method: 'POST', path: '/auth/logout' });
        return response.ok;
      } catch {
        // The local session is gone either way; the caller tells the user the server was not told.
        return false;
      }
    },

    refresh() {
      if (refreshInFlight) return refreshInFlight;
      const epoch = sessionEpoch;
      refreshInFlight = withRefreshLock(() => postAuth('/auth/refresh'))
        .then((session) => {
          if (epoch !== sessionEpoch) return get().status === 'authenticated';
          applySession(session);
          return true;
        })
        .catch((error: unknown) => {
          if (epoch !== sessionEpoch) return false;
          if (isApiError(error) && (error.status === 401 || error.status === 403)) {
            const wasSignedIn = get().status === 'authenticated';
            clearSession();
            if (wasSignedIn) toast.info('Your session has expired. Please log in again.');
          } else if (get().status === 'unknown') {
            // Server unreachable at boot: continue as a guest; a reload retries the refresh.
            set({ status: 'guest' });
          }
          return false;
        })
        .finally(() => {
          refreshInFlight = null;
        });
      return refreshInFlight;
    },

    bootstrap() {
      if (!bootPromise) {
        bootPromise = (async () => {
          if (get().status !== 'unknown') return;
          if (readStorage(SESSION_HINT_KEY) === null) {
            set({ status: 'guest' });
            return;
          }
          await get().refresh();
        })();
      }
      return bootPromise;
    },

    ready() {
      return get().status === 'unknown' ? get().bootstrap() : Promise.resolve();
    },

    setUser(user) {
      set({ user });
    },
  };
});

/** The signed-in user, or null. */
export function useCurrentUser(): Me | null {
  return useAuth((state) => state.user);
}

/** True when the signed-in user is an admin. */
export function useIsAdmin(): boolean {
  return useAuth((state) => state.user?.role === 'ADMIN');
}

/** Test helper: back to the initial 'unknown' state with no refresh or boot in flight. */
export function resetAuthForTests(): void {
  sessionEpoch = 0;
  refreshInFlight = null;
  bootPromise = null;
  useAuth.setState({ ...initialState });
}
