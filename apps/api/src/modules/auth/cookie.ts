import { REFRESH_COOKIE_NAME } from '@arbiter/shared';
import type { CookieOptions, Request, Response } from 'express';
import { env } from '../../config/env';
import { DAY_MS } from '../../lib/time';

const COOKIE_PATH = '/api/auth';

/** httpOnly, SameSite=Strict, Path=/api/auth, Secure in production (or COOKIE_SECURE=true). */
const baseOptions = (): CookieOptions => ({
  httpOnly: true,
  sameSite: 'strict',
  secure: env.COOKIE_SECURE || env.isProduction,
  path: COOKIE_PATH,
});

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    ...baseOptions(),
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * DAY_MS,
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, baseOptions());
}

/** The raw arb_rt cookie value, if the request carries a string one. */
export function readRefreshCookie(req: Request): string | undefined {
  const value: unknown = req.cookies?.[REFRESH_COOKIE_NAME];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
