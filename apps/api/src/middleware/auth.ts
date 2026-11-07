import type { Role } from '@arbiter/shared';
import type { Request, RequestHandler } from 'express';
import { unauthorized } from '../lib/errors';
import { verifyAccessToken } from '../lib/jwt';

/** req.user */
export interface AuthUser {
  id: string;
  username: string;
  role: Role;
}

/** The bearer token, undefined when there is no Authorization header; throws 401 if malformed. */
function bearerToken(req: Request): string | undefined {
  const header = req.get('authorization');
  if (!header) return undefined;
  const [scheme, token, ...rest] = header.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== 'bearer' || !token || rest.length > 0) {
    throw unauthorized('Malformed Authorization header');
  }
  return token;
}

function authenticate(req: Request, token: string): void {
  const claims = verifyAccessToken(token);
  req.user = { id: claims.sub, username: claims.username, role: claims.role };
}

/**
 * Sets req.user when a valid bearer token is present. No token = guest. An invalid or expired
 * token is a 401 (so the SPA refreshes) rather than a silent downgrade to guest.
 */
export const optionalAuth: RequestHandler = (req, _res, next) => {
  if (!req.user) {
    const token = bearerToken(req);
    if (token) authenticate(req, token);
  }
  next();
};

/** 401 unless a valid bearer token is present; sets req.user. */
export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.user) {
    const token = bearerToken(req);
    if (!token) throw unauthorized();
    authenticate(req, token);
  }
  next();
};
