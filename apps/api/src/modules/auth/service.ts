import type { LoginBody, Me, RegisterBody } from '@arbiter/shared';
import { Prisma, type PrismaClient, type User } from '@prisma/client';
import { conflict, unauthorized } from '../../lib/errors';
import { hashPassword, verifyDummyPassword, verifyPassword } from '../../lib/password';

/** The Me shape of the shared contract (never includes the password hash). */
export function toMe(user: User): Me {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    rating: user.rating,
    bio: user.bio,
    createdAt: user.createdAt.toISOString(),
  };
}

const DUPLICATE_MESSAGE = 'That email or username is already taken';

/** Names only the seed may create: `demo` is the target of passwordless demo login. */
const RESERVED_USERNAMES = new Set(['demo', 'admin']);

/** Creates the account. Email is stored lower-case; usernames are unique case-insensitively. */
export async function registerUser(prisma: PrismaClient, body: RegisterBody): Promise<User> {
  const email = body.email.toLowerCase();
  const usernameLower = body.username.toLowerCase();
  if (RESERVED_USERNAMES.has(usernameLower)) {
    throw conflict('That username is reserved', { field: 'username' });
  }

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { usernameLower }] },
    select: { email: true },
  });
  if (existing) {
    // details.field lets the sign-up form mark the conflicting input (lane A5).
    throw existing.email === email
      ? conflict('That email is already registered', { field: 'email' })
      : conflict('That username is taken', { field: 'username' });
  }

  const passwordHash = await hashPassword(body.password);
  try {
    return await prisma.user.create({
      data: { email, username: body.username, usernameLower, passwordHash },
    });
  } catch (error) {
    // Two registrations raced past the check above.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw conflict(DUPLICATE_MESSAGE);
    }
    throw error;
  }
}

const BAD_CREDENTIALS = 'Invalid credentials';

/**
 * Verifies identifier (email or username) + password. Every failure is the same generic 401, and
 * an unknown account still pays for an Argon2 verification so timing does not reveal it.
 */
export async function authenticate(prisma: PrismaClient, body: LoginBody): Promise<User> {
  const identifier = body.identifier.trim().toLowerCase();
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: identifier }, { usernameLower: identifier }] },
  });
  if (!user) {
    await verifyDummyPassword(body.password);
    throw unauthorized(BAD_CREDENTIALS);
  }
  if (!(await verifyPassword(user.passwordHash, body.password)))
    throw unauthorized(BAD_CREDENTIALS);
  return user;
}
