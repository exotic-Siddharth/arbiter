// npm run test:sandbox: builds the sandbox image if it is missing, then runs the real-Docker
// sandbox tests and the judge processor tests (apps/api/vitest.sandbox.config.ts, R20).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { REPO_ROOT, apiEnvValue } from './lib/api-env';

const require = createRequire(import.meta.url);
const docker = apiEnvValue('DOCKER_BIN', 'docker');
const image = apiEnvValue('SANDBOX_IMAGE', 'arbiter-sandbox:latest');

function imageExists(): boolean {
  const result = spawnSync(docker, ['image', 'inspect', image], { stdio: 'ignore' });
  if (result.error) {
    console.error(`Cannot run the Docker CLI (${docker}): ${result.error.message}`);
    process.exit(1);
  }
  return result.status === 0;
}

if (!imageExists()) {
  const dockerfile = join(REPO_ROOT, 'sandbox', 'Dockerfile');
  if (existsSync(dockerfile)) {
    console.log(`Building ${image} from sandbox/ ...`);
    execFileSync(docker, ['build', '-t', image, join(REPO_ROOT, 'sandbox')], { stdio: 'inherit' });
  } else {
    console.warn(
      `sandbox/Dockerfile does not exist yet (lane A2 writes it); skipping the image build.`,
    );
  }
}

const vitest = require.resolve('vitest/vitest.mjs');
const result = spawnSync(
  process.execPath,
  [vitest, 'run', '--config', 'vitest.sandbox.config.ts', ...process.argv.slice(2)],
  { cwd: join(REPO_ROOT, 'apps', 'api'), stdio: 'inherit' },
);
process.exit(result.status ?? 1);
