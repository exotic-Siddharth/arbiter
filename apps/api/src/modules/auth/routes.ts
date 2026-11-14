import {
  AuthResponseSchema,
  LoginBody,
  MeResponseSchema,
  RegisterBody,
  type AuthResponse,
} from '@arbiter/shared';
import type { PrismaClient, User } from '@prisma/client';
import type { Request, Response } from 'express';
import { env } from '../../config/env';
import { getDeps } from '../../lib/deps';
import { isAppError, notFound, unauthorized } from '../../lib/errors';
import { signAccessToken } from '../../lib/jwt';
import { RATE_LIMITS, clientIpKey, rateLimit } from '../../lib/rateLimit';
import { createRouter } from '../../lib/router';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from './cookie';
import { authenticate, registerUser, toMe } from './service';
import { issueRefreshToken, revokeByToken, rotateRefreshToken, type TokenMeta } from './tokens';

const { router, route } = createRouter('/api/auth');
export { router };

const tokenMeta = (req: Request): TokenMeta => ({ userAgent: req.get('user-agent'), ip: req.ip });

/** Auth responses carry credentials: never cacheable. */
function noStore(res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
}

/** Starts a session: new token family, arb_rt cookie, `{user, accessToken}` body. */
async function startSession(
  req: Request,
  res: Response,
  prisma: PrismaClient,
  user: User,
  status: number,
): Promise<void> {
  const { token } = await issueRefreshToken(prisma, user.id, tokenMeta(req));
  setRefreshCookie(res, token);
  noStore(res);
  const body: AuthResponse = {
    user: toMe(user),
    accessToken: signAccessToken({ id: user.id, username: user.username, role: user.role }),
  };
  res.status(status).json(body);
}

const registerLimiter = rateLimit({
  name: 'register',
  ...RATE_LIMITS.register,
  key: (req) => clientIpKey(req.ip),
});

const loginLimiter = rateLimit({
  name: 'login',
  ...RATE_LIMITS.login,
  key: (req) => {
    const identifier = (req.body as { identifier?: unknown } | undefined)?.identifier;
    return `${clientIpKey(req.ip)}|${typeof identifier === 'string' ? identifier.toLowerCase() : ''}`;
  },
});

const demoLimiter = rateLimit({
  name: 'login',
  ...RATE_LIMITS.login,
  key: (req) => `${clientIpKey(req.ip)}|demo`,
});

route(
  {
    method: 'post',
    path: '/register',
    summary: 'Create an account',
    tags: ['Auth'],
    request: { body: RegisterBody },
    responses: {
      201: {
        description: 'Registered; sets the arb_rt refresh cookie',
        schema: AuthResponseSchema,
      },
      409: 'Email or username already taken',
      429: 'Too many registrations from this IP (5 per hour)',
    },
  },
  registerLimiter,
  async (req, res) => {
    const { prisma } = getDeps(req);
    const user = await registerUser(prisma, req.body);
    await startSession(req, res, prisma, user, 201);
  },
);

route(
  {
    method: 'post',
    path: '/login',
    summary: 'Log in with an email or a username',
    tags: ['Auth'],
    request: { body: LoginBody },
    responses: {
      200: { description: 'Logged in; sets the arb_rt refresh cookie', schema: AuthResponseSchema },
      401: 'Invalid credentials (generic message)',
      429: 'Too many attempts (10 per 15 min per IP and identifier)',
    },
  },
  loginLimiter,
  async (req, res) => {
    const { prisma } = getDeps(req);
    const user = await authenticate(prisma, req.body);
    await startSession(req, res, prisma, user, 200);
  },
);

route(
  {
    method: 'post',
    path: '/demo',
    summary: 'Log in as the demo user',
    description:
      'No body. Same response and cookie as login; the login rate limit applies. ' +
      '404 unless DEMO_LOGIN_ENABLED (default true in development only).',
    tags: ['Auth'],
    responses: {
      200: { description: 'Logged in as demo', schema: AuthResponseSchema },
      404: 'Demo login is disabled',
      429: 'Too many attempts',
    },
  },
  demoLimiter,
  async (req, res) => {
    if (!env.DEMO_LOGIN_ENABLED) throw notFound('Demo login is disabled');
    const { prisma } = getDeps(req);
    const user = await prisma.user.findUnique({ where: { usernameLower: 'demo' } });
    // Only a plain USER account may be reached without a password.
    if (user?.role !== 'USER') throw notFound('The demo user does not exist');
    await startSession(req, res, prisma, user, 200);
  },
);

route(
  {
    method: 'post',
    path: '/refresh',
    summary: 'Rotate the refresh token and issue a new access token',
    description:
      'Reads the arb_rt cookie. Presenting a revoked or already-rotated token revokes the whole family, ' +
      'except within 30 s of its rotation while its successor is unused (a lost response): then the ' +
      'unused successor is revoked and a fresh one is issued in the same session.',
    tags: ['Auth'],
    auth: 'cookie',
    responses: {
      200: { description: 'New access token; rotated arb_rt cookie', schema: AuthResponseSchema },
      401: 'Missing, expired, revoked or reused refresh token',
    },
  },
  async (req, res) => {
    const token = readRefreshCookie(req);
    if (!token) throw unauthorized('Missing refresh token');
    const { prisma } = getDeps(req);
    try {
      const session = await rotateRefreshToken(prisma, token, tokenMeta(req));
      setRefreshCookie(res, session.refreshToken);
      noStore(res);
      const body: AuthResponse = { user: toMe(session.user), accessToken: session.accessToken };
      res.json(body);
    } catch (error) {
      // Only a rejected token ends the session; a server error keeps the (still valid) cookie.
      if (isAppError(error) && error.status === 401) clearRefreshCookie(res);
      throw error;
    }
  },
);

route(
  {
    method: 'post',
    path: '/logout',
    summary: 'Log out: revoke the token family and clear the cookie',
    tags: ['Auth'],
    auth: 'cookie',
    responses: { 204: null },
  },
  async (req, res) => {
    const token = readRefreshCookie(req);
    if (token) await revokeByToken(getDeps(req).prisma, token);
    clearRefreshCookie(res);
    noStore(res);
    res.status(204).end();
  },
);

route(
  {
    method: 'get',
    path: '/me',
    summary: 'The signed-in user',
    tags: ['Auth'],
    auth: 'user',
    responses: { 200: MeResponseSchema },
  },
  async (req, res) => {
    const user = await getDeps(req).prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw unauthorized('Account no longer exists');
    noStore(res);
    res.json({ user: toMe(user) });
  },
);
