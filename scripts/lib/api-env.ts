import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/**
 * Value of `name` from the real environment, else from apps/api/.env, else `fallback`.
 * Lets root scripts find e.g. DOCKER_BIN without loading the API's config module.
 */
export function apiEnvValue(name: string, fallback: string): string {
  const fromEnv = process.env[name];
  if (fromEnv) return fromEnv;
  const file = new URL('../../apps/api/.env', import.meta.url);
  if (existsSync(file)) {
    const value = parseEnv(readFileSync(file, 'utf8'))[name];
    if (value) return value;
  }
  return fallback;
}
