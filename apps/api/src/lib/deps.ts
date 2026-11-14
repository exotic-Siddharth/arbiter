import type { PrismaClient } from '@prisma/client';
import type { Request } from 'express';
import type { Redis } from 'ioredis';
import type { RateLimitsConfig } from './rateLimit';

/** Per-app dependencies stored on app.locals by createApp(). */
export interface AppDeps {
  prisma: PrismaClient;
  redis: Redis;
  rateLimits: RateLimitsConfig;
  /** The address people open (env WEB_ORIGIN, i.e. PUBLIC_ORIGIN in production), no trailing slash. */
  publicOrigin: string;
}

/** The dependencies of the app handling `req` (useful when a test injects its own clients). */
export function getDeps(req: Request): AppDeps {
  return req.app.locals as unknown as AppDeps;
}
