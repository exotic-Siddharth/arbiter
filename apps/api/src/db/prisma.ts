import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';
import { onShutdown } from '../lib/lifecycle';

/**
 * The process-wide Prisma client (connects lazily on the first query). In tests DATABASE_URL
 * points at arbiter_test?schema=<TEST_SCHEMA> (set by test/setup.ts).
 */
export const prisma = new PrismaClient({
  datasourceUrl: env.DATABASE_URL,
  log: env.isTest ? [] : env.isProduction ? ['error'] : ['warn', 'error'],
});

onShutdown('prisma', () => prisma.$disconnect());
