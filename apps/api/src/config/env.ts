import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/**
 * zod-validated configuration (spec section 6 + resolutions R2, R4, R6, R8, R16).
 *
 * apps/api/.env is loaded with process.loadEnvFile() when it exists. Variables that are
 * already set in the real environment always win (loadEnvFile never overrides them), so
 * tests and CI can set everything explicitly.
 */

function findPackageRoot(start: string): string | undefined {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/** Absolute path of apps/api (works from src/config/*.ts and from the bundled dist/*.js). */
export const API_ROOT = findPackageRoot(dirname(fileURLToPath(import.meta.url))) ?? process.cwd();

function loadDotEnv(): void {
  const file = join(API_ROOT, '.env');
  if (!existsSync(file)) return;
  const pkg = readFileSync(join(API_ROOT, 'package.json'), 'utf8');
  if (pkg.includes('"@arbiter/api"')) process.loadEnvFile(file);
}

/**
 * Wraps a schema so that "" (e.g. `SANDBOX_RUNTIME=` in .env) counts as "not set";
 * the empty-string check runs before any .default() inside `schema`.
 */
const v = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema);

const boolFlag = (fallback?: 'true' | 'false') => {
  const flag = z.enum(['true', 'false', '1', '0'], {
    errorMap: () => ({ message: 'Expected true or false' }),
  });
  return (fallback === undefined ? flag.optional() : flag.default(fallback)).transform((value) =>
    value === undefined ? undefined : value === 'true' || value === '1',
  );
};

const EnvSchema = z
  .object({
    NODE_ENV: v(z.enum(['development', 'test', 'production']).default('development')),
    API_PORT: v(z.coerce.number().int().min(0).max(65535).default(4000)),
    WEB_ORIGIN: v(z.string().url().default('http://localhost:5173')),
    DATABASE_URL: v(
      z
        .string()
        .url()
        .default('postgresql://arbiter:arbiter@localhost:55432/arbiter?schema=public'),
    ),
    REDIS_URL: v(z.string().url().default('redis://localhost:56379/0')),
    QUEUE_PREFIX: v(
      z
        .string()
        .regex(/^[A-Za-z0-9_-]+$/, 'Use letters, digits, - and _ only')
        .default('arbiter'),
    ),
    /** Socket.IO redis adapter + emitter key; default `${QUEUE_PREFIX}-sio` (R6). */
    SOCKET_IO_KEY: v(z.string().optional()),
    RATE_LIMITS_ENABLED: v(boolFlag('true')),
    RATE_LIMIT_PREFIX: v(z.string().default('arb:rl')),
    /** Express "trust proxy" hop count (R2). */
    TRUST_PROXY: v(z.coerce.number().int().min(0).max(10).default(0)),
    JWT_ACCESS_SECRET: v(
      z
        .string({
          required_error:
            'JWT_ACCESS_SECRET is required (copy apps/api/.env.example to apps/api/.env)',
        })
        .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    ),
    ACCESS_TOKEN_TTL_SEC: v(z.coerce.number().int().min(60).max(86_400).default(900)),
    REFRESH_TOKEN_TTL_DAYS: v(z.coerce.number().int().min(1).max(365).default(14)),
    COOKIE_SECURE: v(boolFlag('false')),
    /** POST /api/auth/demo (R4). Default: true in development, false otherwise. */
    DEMO_LOGIN_ENABLED: v(boolFlag()),
    SANDBOX_IMAGE: v(z.string().default('arbiter-sandbox:latest')),
    /** e.g. "runsc" (gVisor); unset = Docker's default runtime. */
    SANDBOX_RUNTIME: v(z.string().optional()),
    DOCKER_BIN: v(z.string().default('docker')),
    JUDGE_CONCURRENCY: v(z.coerce.number().int().min(1).max(32).default(2)),
    RUN_CONCURRENCY: v(z.coerce.number().int().min(1).max(32).default(1)),
    /** The worker's own /metrics port (R8). 0 = random free port. */
    WORKER_METRICS_PORT: v(z.coerce.number().int().min(0).max(65535).default(9464)),
    SEED_ADMIN_PASSWORD: v(z.string().min(8).optional()),
    SEED_DEMO_PASSWORD: v(z.string().min(8).default('demo12345')),
    LOG_LEVEL: v(
      z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    ),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === 'production' && value.RATE_LIMITS_ENABLED === false) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['RATE_LIMITS_ENABLED'],
        message: 'RATE_LIMITS_ENABLED=false is not allowed when NODE_ENV=production',
      });
    }
    if (value.NODE_ENV === 'production') {
      // The repo's .env.example values are public: anyone can mint tokens or log in with them.
      if (/dev-only|change-me/i.test(value.JWT_ACCESS_SECRET)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_ACCESS_SECRET'],
          message: 'JWT_ACCESS_SECRET is a published development value: set a random secret',
        });
      }
      if (value.SEED_ADMIN_PASSWORD === 'admin12345') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SEED_ADMIN_PASSWORD'],
          message: 'SEED_ADMIN_PASSWORD is the published development password: choose another',
        });
      }
    }
  })
  .transform((value) => ({
    ...value,
    RATE_LIMITS_ENABLED: value.RATE_LIMITS_ENABLED ?? true,
    COOKIE_SECURE: value.COOKIE_SECURE ?? false,
    SOCKET_IO_KEY: value.SOCKET_IO_KEY ?? `${value.QUEUE_PREFIX}-sio`,
    DEMO_LOGIN_ENABLED: value.DEMO_LOGIN_ENABLED ?? value.NODE_ENV === 'development',
    // Dev-only default; seeding in production must set SEED_ADMIN_PASSWORD explicitly.
    SEED_ADMIN_PASSWORD:
      value.SEED_ADMIN_PASSWORD ?? (value.NODE_ENV === 'production' ? undefined : 'admin12345'),
    isProduction: value.NODE_ENV === 'production',
    isTest: value.NODE_ENV === 'test',
  }));

export type Env = z.infer<typeof EnvSchema>;

/** Parse an environment object; throws an Error listing every invalid variable. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map(
      (issue) => `  - ${issue.path.join('.') || '(env)'}: ${issue.message}`,
    );
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  return result.data;
}

loadDotEnv();

/**
 * Process-wide configuration, parsed once at import. Not frozen so a test can flip a
 * flag (e.g. env.DEMO_LOGIN_ENABLED = false) and restore it afterwards.
 */
export const env: Env = parseEnv(process.env);

// Tests must never touch the dev database (R13). This trips when API tests run without
// apps/api/test/setup.ts, e.g. `npx vitest run apps/api/...` from the repo root.
if (env.isTest && new URL(env.DATABASE_URL).pathname.replace(/^\//, '') === 'arbiter') {
  throw new Error(
    'NODE_ENV=test with the dev database "arbiter": run API tests from apps/api ' +
      '(cd apps/api && npx vitest run ...) so test/setup.ts points DATABASE_URL at arbiter_test.',
  );
}
