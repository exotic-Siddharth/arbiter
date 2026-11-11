import {
  CreateSubmissionBody,
  CreateSubmissionResponseSchema,
  IdParams,
  ListSubmissionsQuery,
  SubmissionDetailSchema,
  SubmissionPageSchema,
} from '@arbiter/shared';
import { RATE_LIMITS, rateLimit } from '../../lib/rateLimit';
import { getDeps } from '../../lib/deps';
import { unauthorized } from '../../lib/errors';
import { createRouter } from '../../lib/router';
import { createSubmission, getSubmissionDetail, listSubmissions } from './service';

// Owner: lane A3a.
const { router, route } = createRouter('/api/submissions');
export { router };

const submissionLimiter = rateLimit({
  name: 'submissions',
  ...RATE_LIMITS.submissions,
  key: (req) => req.user?.id ?? req.ip ?? 'unknown',
});

route(
  {
    method: 'post',
    path: '/',
    summary: 'Submit a solution (queued for judging)',
    description:
      'With contestSlug: running contest + registered = contest submission; ended = practice; ' +
      'not started = 403. Without it the problem must be published (or the caller an admin).',
    tags: ['Submissions'],
    auth: 'user',
    request: { body: CreateSubmissionBody },
    responses: {
      202: CreateSubmissionResponseSchema,
      403: 'Contest not started, or not registered for the running contest',
      404: 'Problem or contest not found',
      429: 'Too many submissions (6 per minute)',
    },
  },
  submissionLimiter,
  async (req, res) => {
    if (!req.user) throw unauthorized();
    const submission = await createSubmission(getDeps(req).prisma, req.body, req.user);
    res.status(202).json({ submission });
  },
);

route(
  {
    method: 'get',
    path: '/',
    summary: 'Submissions list (contest submissions of others are hidden while it runs)',
    tags: ['Submissions'],
    auth: 'optional',
    request: { query: ListSubmissionsQuery },
    responses: { 200: SubmissionPageSchema },
  },
  async (req, res) => {
    res.json(await listSubmissions(getDeps(req).prisma, req.validatedQuery, req.user));
  },
);

route(
  {
    method: 'get',
    path: '/:id',
    summary: 'Submission detail (source, compile output and previews: owner or admin only)',
    tags: ['Submissions'],
    auth: 'optional',
    request: { params: IdParams },
    responses: { 200: SubmissionDetailSchema, 404: 'Submission not found' },
  },
  async (req, res) => {
    res.json(await getSubmissionDetail(getDeps(req).prisma, req.params.id, req.user));
  },
);
