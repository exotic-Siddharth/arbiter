import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { env } from '../config/env';
import { AppError } from './errors';
import { signAccessToken, verifyAccessToken } from './jwt';

const user = { id: 'user-42', username: 'ada', role: 'USER' as const };

function expectUnauthorized(fn: () => unknown, message: string) {
  try {
    fn();
    expect.unreachable('should have thrown');
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ status: 401, code: 'UNAUTHORIZED', message });
  }
}

describe('access tokens', () => {
  it('round-trips {sub, role, username} with a 15 minute expiry', () => {
    const token = signAccessToken(user);
    expect(verifyAccessToken(token)).toMatchObject({
      sub: 'user-42',
      role: 'USER',
      username: 'ada',
    });
    const decoded = jwt.decode(token) as { iat: number; exp: number };
    expect(decoded.exp - decoded.iat).toBe(env.ACCESS_TOKEN_TTL_SEC);
  });

  it('rejects a token signed with another secret', () => {
    const forged = jwt.sign({ role: 'ADMIN', username: 'ada' }, 'x'.repeat(40), {
      subject: 'user-42',
    });
    expectUnauthorized(() => verifyAccessToken(forged), 'Invalid access token');
  });

  it('rejects an expired token', () => {
    const expired = jwt.sign({ role: 'USER', username: 'ada' }, env.JWT_ACCESS_SECRET, {
      subject: 'user-42',
      expiresIn: -10,
    });
    expectUnauthorized(() => verifyAccessToken(expired), 'Access token expired');
  });

  it('rejects the "none" algorithm and malformed claims', () => {
    const unsigned = jwt.sign({ role: 'ADMIN', username: 'ada', sub: 'x' }, '', {
      algorithm: 'none',
    });
    expectUnauthorized(() => verifyAccessToken(unsigned), 'Invalid access token');
    const badRole = jwt.sign({ role: 'ROOT', username: 'ada' }, env.JWT_ACCESS_SECRET, {
      subject: 'x',
    });
    expectUnauthorized(() => verifyAccessToken(badRole), 'Invalid access token');
  });
});
