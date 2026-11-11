import { createHash, randomBytes } from 'node:crypto';
import type { PrismaClient, RefreshToken, User } from '@prisma/client';
import { env } from '../../config/env';
import { unauthorized } from '../../lib/errors';
import { signAccessToken } from '../../lib/jwt';
import { DAY_MS, clock } from '../../lib/time';

/** Where a refresh token was issued from (stored for the user's records, never logged). */
export interface TokenMeta {
  userAgent?: string | null;
  ip?: string | null;
}

export interface IssuedRefreshToken {
  /** The opaque value for the arb_rt cookie. Only its hash is stored. */
  token: string;
  record: RefreshToken;
}

export interface RotatedSession {
  user: User;
  accessToken: string;
  refreshToken: string;
}

/** sha256 (hex) of the base64url token: what the database stores. */
export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

const newToken = (): string => randomBytes(32).toString('base64url');

const clip = (value: string | null | undefined, max: number): string | null =>
  value ? value.slice(0, max) : null;

const expiryFrom = (now: Date): Date =>
  new Date(now.getTime() + env.REFRESH_TOKEN_TTL_DAYS * DAY_MS);

type Db = Pick<PrismaClient, 'refreshToken'>;

async function createRecord(
  db: Db,
  userId: string,
  familyId: string,
  meta: TokenMeta,
): Promise<IssuedRefreshToken> {
  const token = newToken();
  const record = await db.refreshToken.create({
    data: {
      userId,
      familyId,
      tokenHash: hashToken(token),
      userAgent: clip(meta.userAgent, 255),
      ip: clip(meta.ip, 64),
      expiresAt: expiryFrom(clock.now()),
    },
  });
  return { token, record };
}

/** Starts a new token family (one per login). */
export function issueRefreshToken(
  prisma: PrismaClient,
  userId: string,
  meta: TokenMeta = {},
): Promise<IssuedRefreshToken> {
  return createRecord(prisma, userId, randomBytes(16).toString('hex'), meta);
}

/** Revokes every live token of the family (logout, and reuse detection). */
export async function revokeFamily(prisma: Db, familyId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: clock.now() },
  });
}

/** Logout: revokes the family of the presented token. Unknown tokens are ignored. */
export async function revokeByToken(prisma: PrismaClient, token: string): Promise<void> {
  const record = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (record) await revokeFamily(prisma, record.familyId);
}

const INVALID = 'Invalid refresh token';

/**
 * Rotates a refresh token: the presented token is revoked and a new one in the same family is
 * issued. Presenting a token that is already revoked or rotated is reuse: the whole family is
 * revoked and the call fails with 401. The claim on the old token is a conditional update inside
 * a transaction, so two concurrent rotations of one token cannot both win.
 */
export async function rotateRefreshToken(
  prisma: PrismaClient,
  token: string,
  meta: TokenMeta = {},
): Promise<RotatedSession> {
  const current = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!current) throw unauthorized(INVALID);
  if (current.revokedAt) {
    await revokeFamily(prisma, current.familyId);
    throw unauthorized(INVALID);
  }
  const now = clock.now();
  if (current.expiresAt <= now) throw unauthorized(INVALID);

  const next = await prisma.$transaction(async (tx) => {
    const claimed = await tx.refreshToken.updateMany({
      where: { id: current.id, revokedAt: null },
      data: { revokedAt: now },
    });
    if (claimed.count !== 1) return null;
    const issued = await createRecord(tx, current.userId, current.familyId, meta);
    await tx.refreshToken.update({
      where: { id: current.id },
      data: { replacedById: issued.record.id },
    });
    return issued;
  });
  if (!next) {
    // Lost a race against another rotation of the same token: treat it as reuse.
    await revokeFamily(prisma, current.familyId);
    throw unauthorized(INVALID);
  }

  const { user } = current;
  return {
    user,
    accessToken: signAccessToken({ id: user.id, username: user.username, role: user.role }),
    refreshToken: next.token,
  };
}
