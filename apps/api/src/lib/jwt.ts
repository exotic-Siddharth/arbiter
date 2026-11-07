import { AccessTokenClaimsSchema, type AccessTokenClaims, type Role } from '@arbiter/shared';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { unauthorized } from './errors';

export interface AccessTokenSubject {
  id: string;
  username: string;
  role: Role;
}

/** HS256 access token with claims {sub, role, username}, valid ACCESS_TOKEN_TTL_SEC (900 s). */
export function signAccessToken(user: AccessTokenSubject): string {
  return jwt.sign({ role: user.role, username: user.username }, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    subject: user.id,
    expiresIn: env.ACCESS_TOKEN_TTL_SEC,
  });
}

/** Verifies signature, algorithm and expiry; throws AppError 401 UNAUTHORIZED otherwise. */
export function verifyAccessToken(token: string): AccessTokenClaims {
  let payload: unknown;
  try {
    payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
  } catch (error) {
    throw unauthorized(
      error instanceof jwt.TokenExpiredError ? 'Access token expired' : 'Invalid access token',
    );
  }
  const claims = AccessTokenClaimsSchema.safeParse(payload);
  if (!claims.success) throw unauthorized('Invalid access token');
  return claims.data;
}
