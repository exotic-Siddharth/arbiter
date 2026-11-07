import type { ResponseConfig, RouteConfig } from '@asteasolutions/zod-to-openapi';
import express, {
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
  type Router,
} from 'express';
import { z, type AnyZodObject, type ZodTypeAny } from 'zod';
import { optionalAuth, requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { validate } from '../middleware/validate';
import { ErrorBodyRef, bearerAuth, cookieAuth, registry } from '../openapi/registry';
import { notImplementedError } from './errors';

/**
 * Route + OpenAPI helper (resolution R12). Every lane registers routes ONLY through
 * createRouter(basePath).route(def, ...handlers), which
 *   1. registers the Express route: [auth middleware] -> validate(def.request) -> ...handlers
 *   2. registers the OpenAPI operation (full path, ":param" -> "{param}")
 *   3. appends { method, fullPath, auth } to routeManifest.
 */

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

/**
 * - none:     public
 * - optional: token optional; req.user is set when a valid token is sent (invalid token = 401)
 * - user:     signed-in user required (requireAuth)
 * - admin:    requireAuth + requireRole('ADMIN')
 * - cookie:   authenticated by the arb_rt refresh cookie, which the handler reads itself
 */
export type RouteAuth = 'none' | 'optional' | 'user' | 'admin' | 'cookie';

/**
 * A response entry of RouteDef.responses:
 * - a zod schema: JSON body with that schema
 * - null: no body (e.g. 204)
 * - a string: description only; for status >= 400 the body is the standard ErrorBody
 * - { description, schema?, headers? }
 */
export type RouteResponse =
  | ZodTypeAny
  | null
  | string
  | { description: string; schema?: ZodTypeAny; headers?: ResponseConfig['headers'] };

export interface RouteRequest<
  B extends ZodTypeAny | undefined,
  Q extends AnyZodObject | undefined,
  P extends AnyZodObject | undefined,
> {
  body?: B;
  /** Must be a plain z.object(); parsed value lands in req.validatedQuery. */
  query?: Q;
  /** Must be a plain z.object() whose keys equal the ":params" of `path`. */
  params?: P;
}

export interface RouteDef<
  B extends ZodTypeAny | undefined = undefined,
  Q extends AnyZodObject | undefined = undefined,
  P extends AnyZodObject | undefined = undefined,
> {
  method: HttpMethod;
  /** Express path relative to the router's basePath, e.g. '/' or '/:slug/problems/:label'. */
  path: string;
  summary: string;
  description?: string;
  tags: string[];
  auth?: RouteAuth;
  request?: RouteRequest<B, Q, P>;
  /** e.g. { 200: ProblemDetailSchema, 404: 'Problem not found' }. 400/401/403 are added automatically. */
  responses: Record<number, RouteResponse>;
}

type Parsed<T> = T extends ZodTypeAny ? z.output<T> : undefined;

/** The request type a route handler sees: params/body/validatedQuery typed from def.request. */
export type TypedRequest<B, Q, P> = Request<
  P extends AnyZodObject ? z.output<P> : Record<string, string>,
  unknown,
  Parsed<B>
> & { validatedQuery: Parsed<Q> };

export type RouteHandler<B = undefined, Q = undefined, P = undefined> = (
  req: TypedRequest<B, Q, P>,
  res: Response,
  next: NextFunction,
) => unknown;

export interface RouteManifestEntry {
  method: HttpMethod;
  /** Full Express path, e.g. '/api/contests/:slug/scoreboard'. */
  fullPath: string;
  auth: RouteAuth;
}

/** Every route registered through route(), in registration order. */
export const routeManifest: RouteManifestEntry[] = [];

const PARAM_PATTERN = /:([A-Za-z_][A-Za-z0-9_]*)/g;

export const toOpenApiPath = (fullPath: string): string => fullPath.replace(PARAM_PATTERN, '{$1}');

const paramNames = (path: string): string[] => [...path.matchAll(PARAM_PATTERN)].map((m) => m[1]);

function assertExpressPath(path: string): void {
  if (!path.startsWith('/') || /[*?+(){}]/.test(path)) {
    throw new Error(
      `route path "${path}" must start with "/" and use only literal segments and :params ` +
        '(no wildcards or optional segments)',
    );
  }
}

const STATUS_TEXT: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  204: 'No content',
  400: 'Validation error',
  401: 'Missing, invalid or expired credentials',
  403: 'Forbidden',
  404: 'Not found',
  409: 'Conflict',
  413: 'Payload too large',
  429: 'Rate limited (see the Retry-After header)',
  500: 'Internal error',
  501: 'Not implemented',
  503: 'Service unavailable',
};

const json = (schema: ZodTypeAny) => ({ 'application/json': { schema } });

const errorResponse = (description: string): ResponseConfig => ({
  description,
  content: json(ErrorBodyRef),
});

function normalizeResponse(status: number, response: RouteResponse): ResponseConfig {
  const fallback = STATUS_TEXT[status] ?? `HTTP ${status}`;
  if (response === null) return { description: fallback };
  if (typeof response === 'string') {
    return status >= 400 ? errorResponse(response) : { description: response };
  }
  if (response instanceof z.ZodType) return { description: fallback, content: json(response) };
  const content = response.schema
    ? json(response.schema)
    : status >= 400
      ? json(ErrorBodyRef)
      : undefined;
  return {
    description: response.description,
    ...(content ? { content } : {}),
    ...(response.headers ? { headers: response.headers } : {}),
  };
}

function securityFor(auth: RouteAuth): RouteConfig['security'] {
  switch (auth) {
    case 'user':
    case 'admin':
      return [{ [bearerAuth.name]: [] }];
    case 'optional':
      return [{}, { [bearerAuth.name]: [] }];
    case 'cookie':
      return [{ [cookieAuth.name]: [] }];
    default:
      return undefined;
  }
}

function openApiRoute(
  def: RouteDef<ZodTypeAny | undefined, AnyZodObject | undefined, AnyZodObject | undefined>,
  fullPath: string,
  auth: RouteAuth,
  pathParams: string[],
): RouteConfig {
  const { body, query, params } = def.request ?? {};
  const request: NonNullable<RouteConfig['request']> = {};
  if (params) request.params = params;
  else if (pathParams.length > 0) {
    request.params = z.object(Object.fromEntries(pathParams.map((name) => [name, z.string()])));
  }
  if (query) request.query = query;
  if (body) request.body = { required: true, content: json(body) };

  const responses: Record<string, ResponseConfig> = {};
  for (const [status, response] of Object.entries(def.responses)) {
    responses[status] = normalizeResponse(Number(status), response);
  }
  const addError = (status: number, description: string) => {
    responses[status] ??= errorResponse(description);
  };
  if (body || query || params) addError(400, STATUS_TEXT[400]);
  if (auth !== 'none') addError(401, STATUS_TEXT[401]);
  if (auth === 'admin') addError(403, 'Admin role required');

  const security = securityFor(auth);
  return {
    method: def.method,
    path: toOpenApiPath(fullPath),
    summary: def.summary,
    ...(def.description ? { description: def.description } : {}),
    tags: def.tags,
    ...(security ? { security } : {}),
    ...(Object.keys(request).length > 0 ? { request } : {}),
    responses,
  };
}

export interface ArbiterRouter {
  router: Router;
  basePath: string;
  route: <
    B extends ZodTypeAny | undefined = undefined,
    Q extends AnyZodObject | undefined = undefined,
    P extends AnyZodObject | undefined = undefined,
  >(
    def: RouteDef<B, Q, P>,
    ...handlers: Array<RouteHandler<B, Q, P>>
  ) => void;
}

/**
 * @param basePath the full path the router is mounted at, e.g. '/api/contests' or
 *   '/api/admin/problems' ('' for root-level routes such as /healthz).
 */
export function createRouter(basePath: string): ArbiterRouter {
  if (basePath !== '' && (!basePath.startsWith('/') || basePath.endsWith('/'))) {
    throw new Error(`createRouter basePath "${basePath}" must start with "/" and not end with "/"`);
  }
  const router = express.Router();

  const route: ArbiterRouter['route'] = (def, ...handlers) => {
    if (handlers.length === 0) {
      throw new Error(`route ${def.method.toUpperCase()} ${def.path} has no handler`);
    }
    assertExpressPath(def.path);
    const fullPath = def.path === '/' ? basePath || '/' : `${basePath}${def.path}`;
    const auth = def.auth ?? 'none';
    const pathParams = paramNames(def.path);

    const paramsSchema = def.request?.params;
    if (paramsSchema) {
      const keys = Object.keys(paramsSchema.shape).sort().join(',');
      if (keys !== [...pathParams].sort().join(',')) {
        throw new Error(
          `route ${fullPath}: request.params keys [${keys}] must equal the path params [${pathParams}]`,
        );
      }
    }

    const chain: RequestHandler[] = [
      (_req, res, next) => {
        res.locals.routeLabel = fullPath;
        next();
      },
    ];
    if (auth === 'optional') chain.push(optionalAuth);
    if (auth === 'user') chain.push(requireAuth);
    if (auth === 'admin') chain.push(requireAuth, requireRole('ADMIN'));
    const { body, query, params } = def.request ?? {};
    if (body || query || params) chain.push(validate({ body, query, params }));
    chain.push(...(handlers as unknown as RequestHandler[]));

    router[def.method](def.path, ...chain);
    registry.registerPath(openApiRoute(def, fullPath, auth, pathParams));
    routeManifest.push({ method: def.method, fullPath, auth });
  };

  return { router, basePath, route };
}

/** Handler for scaffold stubs: 501 { error: { code: 'NOT_IMPLEMENTED' } }. Lanes replace it. */
export const notImplemented: RequestHandler = (req) => {
  const routePath =
    typeof req.route?.path === 'string' && req.route.path !== '/' ? req.route.path : '';
  throw notImplementedError(`${req.method} ${req.baseUrl}${routePath}`);
};
