import type { Role } from '@arbiter/shared';
import type { RequestHandler } from 'express';
import { forbidden, unauthorized } from '../lib/errors';

/**
 * Use after requireAuth: 401 without req.user, 403 FORBIDDEN unless req.user.role is allowed.
 * req.user.role is the caller's current role: requireAuth re-reads an ADMIN claim from the database
 * (one PK lookup per admin request), so a demoted or deleted admin loses access at once instead of
 * when the 15-minute access token expires.
 */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) throw unauthorized();
    if (!roles.includes(req.user.role)) {
      throw forbidden(roles.length === 1 ? `Requires the ${roles[0]} role` : undefined);
    }
    next();
  };
}
