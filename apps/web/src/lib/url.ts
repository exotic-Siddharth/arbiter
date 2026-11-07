/**
 * Only same-site relative paths are allowed as post-login redirects ("/problems?page=2"),
 * never "//evil.example" or "https://...".
 */
export function safeRedirectPath(raw: string | null | undefined, fallback = '/'): string {
  if (!raw) return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
  return raw;
}

/** "/login?next=%2Fproblems%2Fa-plus-b" (no next for "/" or the auth pages themselves). */
export function loginHref(next?: string): string {
  if (!next || next === '/' || next.startsWith('/login') || next.startsWith('/register')) {
    return '/login';
  }
  return `/login?next=${encodeURIComponent(next)}`;
}

/** Same, for the registration page. */
export function registerHref(next?: string): string {
  if (!next || next === '/' || next.startsWith('/login') || next.startsWith('/register')) {
    return '/register';
  }
  return `/register?next=${encodeURIComponent(next)}`;
}
