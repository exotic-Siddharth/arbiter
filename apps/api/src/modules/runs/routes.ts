import {
  CreateRunBody,
  CreateRunResponseSchema,
  RunIdParams,
  RunStatusResponseSchema,
} from '@arbiter/shared';
import { RATE_LIMITS, rateLimit } from '../../lib/rateLimit';
import { createRouter, notImplemented } from '../../lib/router';

// Owner: lane A2. Scaffold stub: replace `notImplemented` with the real handlers (keep the defs).
const { router, route } = createRouter('/api/runs');
export { router };

const runLimiter = rateLimit({
  name: 'runs',
  ...RATE_LIMITS.runs,
  key: (req) => req.user?.id ?? req.ip ?? 'unknown',
});

route(
  {
    method: 'post',
    path: '/',
    summary: 'Run code on custom input (nothing is stored in Postgres)',
    description:
      'problemSlug only selects the time and memory limits (default 1000 ms / 256 MB); it must be ' +
      'published, in a contest that has started, or the caller an admin (otherwise 404).',
    tags: ['Runs'],
    auth: 'user',
    request: { body: CreateRunBody },
    responses: {
      202: CreateRunResponseSchema,
      404: 'Problem not found',
      429: 'Too many runs (12 per minute)',
    },
  },
  runLimiter,
  notImplemented,
);

route(
  {
    method: 'get',
    path: '/:runId',
    summary: 'Result of a run (owner only)',
    tags: ['Runs'],
    auth: 'user',
    request: { params: RunIdParams },
    responses: { 200: RunStatusResponseSchema, 404: 'Run not found or expired' },
  },
  notImplemented,
);
