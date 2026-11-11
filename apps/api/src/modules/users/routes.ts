import { MeResponseSchema, PatchMeBody, ProfileSchema, UsernameParams } from '@arbiter/shared';
import { Prisma } from '@prisma/client';
import { getDeps } from '../../lib/deps';
import { unauthorized } from '../../lib/errors';
import { createRouter } from '../../lib/router';
import { toMe } from '../auth/service';
import { getProfile } from './profile.service';

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
  async (req, res) => {
    const bio = req.body.bio === null || req.body.bio === '' ? null : req.body.bio;
    try {
      const user = await getDeps(req).prisma.user.update({
        where: { id: req.user!.id },
        data: { bio },
      });
      res.json({ user: toMe(user) });
    } catch (error) {
      // The account was deleted after the access token was issued.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw unauthorized('Account no longer exists');
      }
      throw error;
    }
  },
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
  async (req, res) => {
    res.json(await getProfile(getDeps(req).prisma, req.params.username));
  },
);
