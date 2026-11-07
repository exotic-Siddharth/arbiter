import { pino } from 'pino';
import { pinoHttp } from 'pino-http';
import { env } from '../config/env';

/**
 * Never log passwords, tokens, cookies, Authorization headers or source code (spec section 12).
 * The HTTP serializers below drop headers entirely; these paths are a second line of defence for
 * objects passed to logger.info({...}).
 */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'headers.authorization',
  'headers.cookie',
  'password',
  '*.password',
  'passwordHash',
  '*.passwordHash',
  'token',
  '*.token',
  'accessToken',
  '*.accessToken',
  'refreshToken',
  '*.refreshToken',
  'sourceCode',
  '*.sourceCode',
  'source',
  '*.source',
  'referenceSolution',
  '*.referenceSolution',
];

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: { paths: REDACT_PATHS, censor: '[redacted]' },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(env.NODE_ENV === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname' },
        },
      }
    : {}),
});

const originalUrl = (req: { url?: string; originalUrl?: string }) => req.originalUrl ?? req.url;

/** Request logging; every line carries the request id set by middleware/requestId.ts. */
export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => req.id,
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  // originalUrl: Express strips the mount path from req.url inside routers (e.g. /api/docs).
  customSuccessMessage: (req, res, responseTime) =>
    `${req.method} ${originalUrl(req)} ${res.statusCode} ${Math.round(responseTime)}ms`,
  customErrorMessage: (req, res) => `${req.method} ${originalUrl(req)} ${res.statusCode}`,
  serializers: {
    req: (req: { id: unknown; method: string; url: string }) => ({
      id: req.id,
      method: req.method,
      url: req.url,
    }),
    res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
  },
  autoLogging: {
    ignore: (req) => req.url === '/healthz' || req.url === '/readyz' || req.url === '/metrics',
  },
});
