import type { AdminUser, Page, Role } from '@arbiter/shared';
import { Prisma, type PrismaClient, type User } from '@prisma/client';
import { conflict, notFound } from '../../lib/errors';
import { paginate, toPage } from '../../lib/pagination';

const withCount = {
  _count: { select: { submissions: { where: { kind: 'NORMAL' as const } } } },
} satisfies Prisma.UserInclude;

type UserWithCount = User & { _count: { submissions: number } };

const toAdminUser = (user: UserWithCount): AdminUser => ({
  id: user.id,
  username: user.username,
  email: user.email,
  role: user.role,
  rating: user.rating,
  submissionCount: user._count.submissions,
  createdAt: user.createdAt.toISOString(),
});

/** Users newest first; `search` matches username or email (case-insensitive substring). */
export async function listUsers(
  prisma: PrismaClient,
  query: { search?: string; page?: number; pageSize?: number },
): Promise<Page<AdminUser>> {
  const { skip, take, page, pageSize } = paginate(query);
  const search = query.search?.trim().toLowerCase();
  // usernameLower and email are stored lower-case, so a plain contains is case-insensitive.
  const where: Prisma.UserWhereInput = search
    ? { OR: [{ usernameLower: { contains: search } }, { email: { contains: search } }] }
    : {};
  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take,
      include: withCount,
    }),
  ]);
  return toPage(users.map(toAdminUser), total, { page, pageSize });
}

/** Changes a role. The last remaining admin cannot be demoted (409), so nobody locks the site out. */
export async function setUserRole(
  prisma: PrismaClient,
  id: string,
  role: Role,
): Promise<AdminUser> {
  return prisma.$transaction(
    async (tx) => {
      const target = await tx.user.findUnique({ where: { id } });
      if (!target) throw notFound('User not found');
      if (target.role === 'ADMIN' && role !== 'ADMIN') {
        const otherAdmins = await tx.user.count({ where: { role: 'ADMIN', id: { not: id } } });
        if (otherAdmins === 0) throw conflict('Cannot demote the last remaining admin');
      }
      const updated = await tx.user.update({ where: { id }, data: { role }, include: withCount });
      return toAdminUser(updated);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
