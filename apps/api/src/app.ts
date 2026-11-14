import type { PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express, type RequestHandler } from 'express';
import helmet from 'helmet';
import type { Redis } from 'ioredis';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import { prisma as defaultPrisma } from './db/prisma';
import type { AppDeps } from './lib/deps';
import { httpLogger } from './lib/logger';
import { httpMetrics } from './lib/metrics';
import { RATE_LIMITS, clientIpKey, rateLimit, type RateLimitsConfig } from './lib/rateLimit';
import { getRedis } from './lib/redis';
import { errorHandler } from './middleware/error';
import { notFoundHandler } from './middleware/notFound';
import { requestId } from './middleware/requestId';
import { router as adminRouter } from './modules/admin/routes';
import { router as authRouter } from './modules/auth/routes';
import { router as contestsRouter } from './modules/contests/routes';
import { router as healthRouter } from './modules/health/routes';
import { router as problemsRouter } from './modules/problems/routes';
import { router as tagsRouter } from './modules/problems/tags.routes';
import { router as runsRouter } from './modules/runs/routes';
import { router as seoRouter } from './modules/seo/routes';
import { router as statsRouter } from './modules/stats/routes';
import { router as submissionsRouter } from './modules/submissions/routes';
import { router as leaderboardRouter } from './modules/users/leaderboard.routes';
import { router as usersRouter } from './modules/users/routes';
import { getOpenApiDocument } from './openapi/document';

export interface CreateAppOptions {
  /** Defaults to the shared client from db/prisma.ts. */
  prisma?: PrismaClient;
  /** Defaults to getRedis(). Used by the rate limiters and /readyz. */
  redis?: Redis;
  /** Defaults to env RATE_LIMITS_ENABLED (R2). e.g. false, or { submissions: false }. */
  rateLimits?: RateLimitsConfig;
  /** Defaults to env WEB_ORIGIN. The absolute URLs of /robots.txt and /sitemap.xml start with it. */
  publicOrigin?: string;
}

/** R5: the test-case routes get their own 20 MB parser (modules/admin/problems.routes.ts). */
const ADMIN_TESTS_PATH = /^\/api\/admin\/problems\/[^/]+\/tests(\/|$)/;

const jsonParser = express.json({ limit: '1mb' });
const jsonBody: RequestHandler = (req, res, next) => {
  if (ADMIN_TESTS_PATH.test(req.path)) {
    next();
    return;
  }
  jsonParser(req, res, next);
};

const strictHelmet = helmet();
// Swagger UI needs inline styles/scripts and data: images: loosen the CSP on /api/docs only.
const docsHelmet = helmet({
  contentSecurityPolicy: {
    directives: {
      'script-src': ["'self'", "'unsafe-inline'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:', 'https:'],
    },
  },
});
const securityHeaders: RequestHandler = (req, res, next) => {
  const handler =
    req.path === '/api/docs' || req.path.startsWith('/api/docs/') ? docsHelmet : strictHelmet;
  handler(req, res, next);
};

const apiRateLimit = rateLimit({
  name: 'api',
  ...RATE_LIMITS.api,
  key: (req) => clientIpKey(req.ip),
});

/** The Express app (no listen): used by src/index.ts and by Supertest. */
export function createApp(options: CreateAppOptions = {}): Express {
  const app = express();
  const deps: AppDeps = {
    prisma: options.prisma ?? defaultPrisma,
    redis: options.redis ?? getRedis(),
    rateLimits: options.rateLimits ?? env.RATE_LIMITS_ENABLED,
    publicOrigin: (options.publicOrigin ?? env.WEB_ORIGIN).replace(/\/+$/, ''),
  };
  Object.assign(app.locals, deps);

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(requestId);
  app.use(httpLogger);
  app.use(httpMetrics);
  app.use(securityHeaders);
  app.use(
    '/api',
    cors({
      origin: env.WEB_ORIGIN,
      credentials: true,
      exposedHeaders: ['Retry-After', 'X-Request-Id', 'RateLimit', 'RateLimit-Policy'],
    }),
  );
  app.use(jsonBody);
  app.use(cookieParser());

  // /healthz, /readyz, /metrics
  app.use(healthRouter);
  // /robots.txt, /sitemap.xml. The sitemap queries the database, so it shares the api's limit.
  app.use('/sitemap.xml', apiRateLimit);
  app.use(seoRouter);

  app.use('/api', apiRateLimit);
  app.get('/api/openapi.json', (_req, res) => {
    res.locals.routeLabel = '/api/openapi.json';
    res.json(getOpenApiDocument());
  });
  const labelDocs: RequestHandler = (_req, res, next) => {
    res.locals.routeLabel = '/api/docs';
    next();
  };
  app.use(
    '/api/docs',
    labelDocs,
    swaggerUi.serve,
    swaggerUi.setup(undefined, {
      customSiteTitle: 'Arbiter API docs',
      swaggerOptions: { url: '/api/openapi.json', validatorUrl: null },
    }),
  );

  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/leaderboard', leaderboardRouter);
  app.use('/api/stats', statsRouter);
  app.use('/api/problems', problemsRouter);
  app.use('/api/tags', tagsRouter);
  app.use('/api/submissions', submissionsRouter);
  app.use('/api/contests', contestsRouter);
  app.use('/api/runs', runsRouter);
  app.use('/api/admin', adminRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
