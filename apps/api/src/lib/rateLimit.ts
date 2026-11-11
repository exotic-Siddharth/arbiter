import type { Application, Request, RequestHandler } from 'express';
import { rateLimit as expressRateLimit } from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { env } from '../config/env';
import { getDeps } from './deps';
import { tooMany } from './errors';
import { getRedis } from './redis';

/** Every limiter in the app (spec section 12). */
export type LimiterName = 'api' | 'login' | 'register' | 'submissions' | 'runs';

/** createApp({ rateLimits }) / env RATE_LIMITS_ENABLED: all on/off, or per limiter (R2). */
export type RateLimitsConfig = boolean | Partial<Record<LimiterName, boolean>>;

/** Spec values. Use as `rateLimit({ name: 'login', ...RATE_LIMITS.login, key })`. */
export const RATE_LIMITS: Record<LimiterName, { windowMs: number; limit: number }> = {
  /** General API limit: 300/min/IP (mounted on /api by createApp). */
  api: { windowMs: 60_000, limit: 300 },
  /** Login (and demo login): 10 per 15 min per IP+identifier. */
  login: { windowMs: 15 * 60_000, limit: 10 },
  /** Registration: 5 per hour per IP. */
  register: { windowMs: 60 * 60_000, limit: 5 },
  /** POST /api/submissions: 6/min/user. */
  submissions: { windowMs: 60_000, limit: 6 },
  /** POST /api/runs: 12/min/user. */
  runs: { windowMs: 60_000, limit: 12 },
};

/**
 * Rate-limit bucket id of a client address. IPv4 is unchanged and IPv4-mapped IPv6 is unwrapped.
 * Every other IPv6 address is reduced to its /64 prefix: one client typically owns a whole /64, so
 * keying on the full address would hand it a fresh bucket per address.
 */
export function clientIpKey(ip: string | undefined): string {
  if (!ip) return 'unknown';
  const address = ip.split('%')[0].toLowerCase();
  if (!address.includes(':')) return address;
  const tail = /^(.*:)(\d+\.\d+\.\d+\.\d+)$/.exec(address);
  let text = address;
  if (tail) {
    const octets = tail[2].split('.').map(Number);
    if (tail[1] === '::ffff:') return tail[2];
    text = `${tail[1]}${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }
  const [head, rest] = text.split('::');
  const headGroups = head ? head.split(':') : [];
  const restGroups = rest === undefined ? [] : rest ? rest.split(':') : [];
  const groups =
    rest === undefined
      ? headGroups
      : [
          ...headGroups,
          ...Array<string>(8 - headGroups.length - restGroups.length).fill('0'),
          ...restGroups,
        ];
  const hex = groups.map((group) => parseInt(group || '0', 16));
  if (hex.length !== 8 || hex.some(Number.isNaN)) return address;
  if (hex.slice(0, 5).every((g) => g === 0) && hex[5] === 0xffff) {
    return `${hex[6] >> 8}.${hex[6] & 255}.${hex[7] >> 8}.${hex[7] & 255}`;
  }
  return `${hex
    .slice(0, 4)
    .map((g) => g.toString(16))
    .join(':')}::/64`;
}

export interface RateLimitOptions {
  name: LimiterName;
  windowMs: number;
  limit: number;
  /** Bucket key, e.g. (req) => req.user!.id or (req) => `${req.ip}|${identifier}`. */
  key: (req: Request) => string;
}

export function isLimiterEnabled(config: RateLimitsConfig, name: LimiterName): boolean {
  if (typeof config === 'boolean') return config;
  return config[name] ?? env.RATE_LIMITS_ENABLED;
}

/**
 * Redis-backed rate limiter middleware. Over the limit it answers 429 RATE_LIMITED with a
 * Retry-After header (seconds) and `details: { retryAfterSec }`.
 *
 * Each limiter has its own RedisStore with prefix `${RATE_LIMIT_PREFIX}:${name}:` (R2). The store
 * is created per app on the first request, so createApp({ redis, rateLimits }) in tests is
 * honoured even though routes are declared at import time.
 */
export function rateLimit(options: RateLimitOptions): RequestHandler {
  const perApp = new WeakMap<Application, RequestHandler>();

  const build = (req: Request): RequestHandler => {
    const redis = getDeps(req).redis ?? getRedis();
    const store = new RedisStore({
      sendCommand: (command: string, ...args: string[]) =>
        redis.call(command, ...args) as Promise<RedisReply>,
      prefix: `${env.RATE_LIMIT_PREFIX}:${options.name}:`,
    });
    // RedisStore starts both SCRIPT LOADs in its constructor but awaits getScriptSha only in
    // get(). With Redis down that promise would reject unhandled and crash the process
    // (Node 22). Mark both as handled; the store still awaits them and reloads on failure.
    store.incrementScriptSha.catch(() => undefined);
    store.getScriptSha.catch(() => undefined);
    return expressRateLimit({
      windowMs: options.windowMs,
      limit: options.limit,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      keyGenerator: options.key,
      // Built lazily per app (see above), never per request.
      validate: { creationStack: false },
      store,
      handler: (request, _response, next) => {
        const resetTime = (request as Request & { rateLimit?: { resetTime?: Date } }).rateLimit
          ?.resetTime;
        const retryAfterSec = Math.max(
          1,
          Math.ceil(((resetTime?.getTime() ?? Date.now() + options.windowMs) - Date.now()) / 1000),
        );
        next(tooMany(`Too many requests. Try again in ${retryAfterSec} s.`, retryAfterSec));
      },
    });
  };

  return (req, res, next) => {
    const config = getDeps(req).rateLimits ?? env.RATE_LIMITS_ENABLED;
    if (!isLimiterEnabled(config, options.name)) {
      next();
      return;
    }
    let handler = perApp.get(req.app);
    if (!handler) {
      handler = build(req);
      perApp.set(req.app, handler);
    }
    return handler(req, res, next);
  };
}
