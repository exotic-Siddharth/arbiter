import { describe, expect, it } from 'vitest';
import { ARGON2_OPTIONS, hashPassword, verifyDummyPassword, verifyPassword } from './password';

describe('password hashing', () => {
  it('hashes with Argon2id and the spec parameters (19456 KiB, t=2, p=1)', async () => {
    const hash = await hashPassword('correct-horse-battery');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(ARGON2_OPTIONS).toEqual({ memoryCost: 19456, timeCost: 2, parallelism: 1 });
  });

  it('verifies the right password and rejects the wrong one', async () => {
    const hash = await hashPassword('correct-horse-battery');
    expect(await verifyPassword(hash, 'correct-horse-battery')).toBe(true);
    expect(await verifyPassword(hash, 'wrong-horse-battery')).toBe(false);
  });

  it('salts: the same password hashes differently each time', async () => {
    expect(await hashPassword('same-password-1')).not.toBe(await hashPassword('same-password-1'));
  });

  it('a malformed stored hash verifies as false instead of throwing', async () => {
    expect(await verifyPassword('not-a-hash', 'whatever-password')).toBe(false);
  });

  it('verifyDummyPassword always resolves false', async () => {
    expect(await verifyDummyPassword('anything-at-all')).toBe(false);
  });
});
