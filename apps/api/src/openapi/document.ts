import { OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { registry } from './registry';

type OpenApiDocument = ReturnType<OpenApiGeneratorV3['generateDocument']>;

/** Generate the document from everything registered so far. */
export function buildOpenApiDocument(): OpenApiDocument {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: '3.0.3',
    info: {
      title: 'Arbiter API',
      version: '1.0.0',
      description:
        'REST API of Arbiter, an online judge with Docker-sandboxed code execution. ' +
        'Errors use { error: { code, message, details? } }; paged lists use { items, total, page, pageSize }. ' +
        'Realtime updates use Socket.IO at /socket.io (see docs/DESIGN.md section 11).',
    },
    servers: [{ url: '/' }],
  });
}

let cached: OpenApiDocument | undefined;

/** Served at GET /api/openapi.json (built once, after every route module has been imported). */
export function getOpenApiDocument(): OpenApiDocument {
  cached ??= buildOpenApiDocument();
  return cached;
}
