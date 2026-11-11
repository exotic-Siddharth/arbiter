import type { Role } from '@arbiter/shared';
import type { RequestHandler } from 'express';
import { getDeps } from '../lib/deps';
import { forbidden, unauthorized } from '../lib/errors';

/**
 * Use after requireAuth: 401 without req.user, 403 FORBIDDEN unless req.user.role is allowed.
 * The token claim is only a first filter: for ADMIN the caller's current role is re-read from the
 * database (one PK lookup per admin request), so a demoted or deleted admin loses access at once
 * instead of when the 15-minute access token expires.
 */
export function requireRole(...roles: Role[]): RequestHandler {
  return async (req, _res, next) => {
    if (!req.user) throw unauthorized();
    if (!roles.includes(req.user.role)) {
      throw forbidden(roles.length === 1 ? `Requires the ${roles[0]} role` : undefined);
    }
    if (req.user.role === 'ADMIN') {
      const current = await getDeps(req).prisma.user.findUnique({
        where: { id: req.user.id },
        select: { role: true },
      });
      if (!current) throw unauthorized();
      if (!roles.includes(current.role)) {
        throw forbidden(roles.length === 1 ? `Requires the ${roles[0]} role` : undefined);
      }
      req.user.role = current.role;
    }
    next();
  };
}
