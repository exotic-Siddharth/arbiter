import { MeResponseSchema, PatchMeBody, ProfileSchema, UsernameParams } from '@arbiter/shared';
import { createRouter, notImplemented } from '../../lib/router';

// Owner: lane A1. Scaffold stub: replace `notImplemented` with the real handlers (keep the defs).
const { router, route } = createRouter('/api/users');
export { router };

route(
  {
    method: 'patch',
    path: '/me',
    summary: 'Update my profile (bio)',
    tags: ['Users'],
    auth: 'user',
    request: { body: PatchMeBody },
    responses: { 200: MeResponseSchema },
  },
  notImplemented,
);

route(
  {
    method: 'get',
    path: '/:username',
    summary: 'Public profile: stats, heatmap, rating history, recent accepted',
    tags: ['Users'],
    request: { params: UsernameParams },
    responses: { 200: ProfileSchema, 404: 'User not found' },
  },
  notImplemented,
);
