import { hash, verify } from '@node-rs/argon2';

/** Argon2id with the spec section 12 parameters (the default algorithm of @node-rs/argon2). */
export const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

/** True when `password` matches the stored Argon2 hash. A malformed hash is simply false. */
export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Burns the same Argon2 work as a real verification and always resolves false. Login calls it
 * when the account does not exist so response timing does not reveal which accounts exist.
 */
export async function verifyDummyPassword(password: string): Promise<false> {
  dummyHash ??= hashPassword('arbiter-dummy-password-never-matches');
  await verifyPassword(await dummyHash, password);
  return false;
}
