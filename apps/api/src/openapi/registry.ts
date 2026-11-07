import { OpenAPIRegistry, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { ErrorBodySchema } from '@arbiter/shared';
import { z } from 'zod';

// Adds .openapi() to every zod schema (including the ones defined in @arbiter/shared).
extendZodWithOpenApi(z);

/**
 * The OpenAPI registry. Routes register themselves through createRouter().route() in
 * src/lib/router.ts; call registry.registerPath() directly only for something route() cannot express.
 */
export const registry = new OpenAPIRegistry();

export const bearerAuth = registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
  description: 'Access token from POST /api/auth/login, /register, /demo or /refresh (15 min).',
});

export const cookieAuth = registry.registerComponent('securitySchemes', 'cookieAuth', {
  type: 'apiKey',
  in: 'cookie',
  name: 'arb_rt',
  description: 'httpOnly refresh-token cookie (Path=/api/auth, SameSite=Strict).',
});

export const ErrorBodyRef = registry.register('ErrorBody', ErrorBodySchema);
