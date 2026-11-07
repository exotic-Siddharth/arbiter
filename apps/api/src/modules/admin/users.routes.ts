import {
  AdminUserListQuery,
  AdminUserPageSchema,
  AdminUserResponseSchema,
  IdParams,
  PatchUserRoleBody,
} from '@arbiter/shared';
import { createRouter, notImplemented } from '../../lib/router';

// Owner: lane A1. Scaffold stub: replace `notImplemented` with the real handlers (keep the defs).
const { router, route } = createRouter('/api/admin/users');
export { router };

route(
  {
    method: 'get',
    path: '/',
    summary: 'Users (search by username or email)',
    tags: ['Admin: users'],
    auth: 'admin',
    request: { query: AdminUserListQuery },
    responses: { 200: AdminUserPageSchema },
  },
  notImplemented,
);

route(
  {
    method: 'patch',
    path: '/:id',
    summary: "Change a user's role",
    tags: ['Admin: users'],
    auth: 'admin',
    request: { params: IdParams, body: PatchUserRoleBody },
    responses: { 200: AdminUserResponseSchema, 404: 'User not found' },
  },
  notImplemented,
);
