import { AuthResponseSchema, LoginBody, MeResponseSchema, RegisterBody } from '@arbiter/shared';
import { RATE_LIMITS, rateLimit } from '../../lib/rateLimit';
import { createRouter, notImplemented } from '../../lib/router';

// Owner: lane A1. Scaffold stub: replace `notImplemented` with the real handlers (keep the defs).
const { router, route } = createRouter('/api/auth');
export { router };

const registerLimiter = rateLimit({
  name: 'register',
  ...RATE_LIMITS.register,
  key: (req) => req.ip ?? 'unknown',
});

const loginLimiter = rateLimit({
  name: 'login',
  ...RATE_LIMITS.login,
  key: (req) => {
    const identifier = (req.body as { identifier?: unknown } | undefined)?.identifier;
    return `${req.ip ?? 'unknown'}|${typeof identifier === 'string' ? identifier.toLowerCase() : ''}`;
  },
});

const demoLimiter = rateLimit({
  name: 'login',
  ...RATE_LIMITS.login,
  key: (req) => `${req.ip ?? 'unknown'}|demo`,
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
  notImplemented,
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
  notImplemented,
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
  notImplemented,
);

route(
  {
    method: 'post',
    path: '/refresh',
    summary: 'Rotate the refresh token and issue a new access token',
    description:
      'Reads the arb_rt cookie. Presenting a revoked or already-rotated token revokes the whole family.',
    tags: ['Auth'],
    auth: 'cookie',
    responses: {
      200: { description: 'New access token; rotated arb_rt cookie', schema: AuthResponseSchema },
      401: 'Missing, expired, revoked or reused refresh token',
    },
  },
  notImplemented,
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
  notImplemented,
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
  notImplemented,
);
