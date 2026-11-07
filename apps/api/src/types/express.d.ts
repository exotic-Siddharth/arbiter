import type { AuthUser } from '../middleware/auth';

declare global {
  namespace Express {
    interface Request {
      /** Set by optionalAuth / requireAuth: { id, username, role }. */
      user?: AuthUser;
      /** Query parsed by validate({ query }) (Express 5 req.query is read-only). */
      validatedQuery?: unknown;
    }
  }
}

export {};
