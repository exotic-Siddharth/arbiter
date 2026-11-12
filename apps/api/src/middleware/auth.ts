import type { Role } from '@arbiter/shared';
import type { Request, RequestHandler } from 'express';
import { getDeps } from '../lib/deps';
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

/**
 * Verifies the token and sets req.user. An ADMIN claim is only trusted after a PK lookup of the
 * caller's current role: a demoted admin is downgraded to the DB role and a deleted user is a 401,
 * so every admin privilege (requireRole and the services' isAdmin checks) sees the current role
 * instead of the one frozen in the 15-minute token. Non-admin tokens cost no lookup; a promotion
 * applies at the next token refresh.
 */
async function authenticate(req: Request, token: string): Promise<void> {
  const claims = verifyAccessToken(token);
  let role = claims.role;
  if (role === 'ADMIN') {
    const current = await getDeps(req).prisma.user.findUnique({
      where: { id: claims.sub },
      select: { role: true },
    });
    if (!current) throw unauthorized();
    role = current.role;
  }
  req.user = { id: claims.sub, username: claims.username, role };
}

/**
 * Sets req.user when a valid bearer token is present. No token = guest. An invalid or expired
 * token is a 401 (so the SPA refreshes) rather than a silent downgrade to guest.
 */
export const optionalAuth: RequestHandler = async (req, _res, next) => {
  if (!req.user) {
    const token = bearerToken(req);
    if (token) await authenticate(req, token);
  }
  next();
};

/** 401 unless a valid bearer token is present; sets req.user. */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  if (!req.user) {
    const token = bearerToken(req);
    if (!token) throw unauthorized();
    await authenticate(req, token);
  }
  next();
};
