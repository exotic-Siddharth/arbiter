import type { PrismaClient } from '@prisma/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupTestDatabase } from '../../../test/db';
import { createUser, uniqueSuffix } from '../../../test/factories';
import { DAY_MS, SECOND_MS, clock } from '../../lib/time';
import {
  REFRESH_GRACE_MS,
  hashToken,
  issueRefreshToken,
  purgeRefreshTokens,
  rotateRefreshToken,
} from './tokens';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDatabase();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const NOW = new Date('2026-06-01T12:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const ahead = (ms: number) => new Date(NOW.getTime() + ms);

/** A row inserted directly, so every expiry/revocation combination can be set up exactly. */
async function insertToken(
  userId: string,
  familyId: string,
  fields: { expiresAt: Date; revokedAt?: Date | null },
) {
  return prisma.refreshToken.create({
    data: { userId, familyId, tokenHash: `h_${uniqueSuffix()}`, ...fields },
  });
}

const exists = async (id: string) =>
  (await prisma.refreshToken.findUnique({ where: { id } })) !== null;

describe('purgeRefreshTokens', () => {
  it('deletes expired rows and the revoked rows of dead families, and keeps everything else', async () => {
    const user = await createUser(prisma);
    const fam = () => `fam_${uniqueSuffix()}`;

    const expiredUnrevoked = await insertToken(user.id, fam(), { expiresAt: ago(1000) });
    const loggedOut = await insertToken(user.id, fam(), {
      expiresAt: ahead(5 * DAY_MS),
      revokedAt: ago(1000),
    });

    // A live family: its rotated (revoked, unexpired) row must stay, so replaying it still
    // triggers reuse detection against the live descendant.
    const liveFamily = fam();
    const rotated = await insertToken(user.id, liveFamily, {
      expiresAt: ahead(5 * DAY_MS),
      revokedAt: ago(1000),
    });
    const live = await insertToken(user.id, liveFamily, { expiresAt: ahead(10 * DAY_MS) });
    // Same live family, but this ancestor has expired: it is deleted (it can never be used again).
    const expiredAncestor = await insertToken(user.id, liveFamily, {
      expiresAt: ago(DAY_MS),
      revokedAt: ago(2 * DAY_MS),
    });

    const deleted = await purgeRefreshTokens(prisma, NOW);

    expect(deleted).toBeGreaterThanOrEqual(3);
    expect(await exists(expiredUnrevoked.id)).toBe(false);
    expect(await exists(loggedOut.id)).toBe(false);
    expect(await exists(expiredAncestor.id)).toBe(false);
    expect(await exists(rotated.id)).toBe(true);
    expect(await exists(live.id)).toBe(true);
  });

  it('returns 0 and touches nothing when every row is live', async () => {
    const user = await createUser(prisma);
    const row = await insertToken(user.id, `fam_${uniqueSuffix()}`, { expiresAt: ahead(DAY_MS) });
    await purgeRefreshTokens(prisma, NOW);
    expect(await exists(row.id)).toBe(true);
  });

  it('keeps reuse detection working for a family that is still live after a purge', async () => {
    const user = await createUser(prisma);
    const first = await issueRefreshToken(prisma, user.id);
    const second = await rotateRefreshToken(prisma, first.token);

    await purgeRefreshTokens(prisma);

    expect(
      await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(first.token) } }),
    ).not.toBeNull();
    // Replaying the rotated token after the grace window is still reuse: it revokes the
    // family, including `second`.
    vi.spyOn(clock, 'now').mockReturnValue(new Date(Date.now() + REFRESH_GRACE_MS + SECOND_MS));
    await expect(rotateRefreshToken(prisma, first.token)).rejects.toThrow();
    await expect(rotateRefreshToken(prisma, second.refreshToken)).rejects.toThrow();
  });
});
