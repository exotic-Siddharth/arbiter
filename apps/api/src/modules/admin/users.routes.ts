import {
  AdminUserListQuery,
  AdminUserPageSchema,
  AdminUserResponseSchema,
  IdParams,
  PatchUserRoleBody,
} from '@arbiter/shared';
import { getDeps } from '../../lib/deps';
import { createRouter } from '../../lib/router';
import { listUsers, setUserRole } from './users.service';

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
  async (req, res) => {
    res.json(await listUsers(getDeps(req).prisma, req.validatedQuery));
  },
);

route(
  {
    method: 'patch',
    path: '/:id',
    summary: "Change a user's role",
    description:
      'You cannot change your own role (403). The last remaining admin cannot be demoted (409).',
    tags: ['Admin: users'],
    auth: 'admin',
    request: { params: IdParams, body: PatchUserRoleBody },
    responses: { 200: AdminUserResponseSchema, 404: 'User not found', 409: 'Last admin' },
  },
  async (req, res) => {
    const user = await setUserRole(getDeps(req).prisma, req.user!.id, req.params.id, req.body.role);
    res.json({ user });
  },
);
