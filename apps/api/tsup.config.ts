import { defineConfig } from 'tsup';

/** Production build: dist/index.js (API) and dist/worker.js (worker). @arbiter/* is bundled (R15). */
export default defineConfig({
  entry: { index: 'src/index.ts', worker: 'src/worker.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: [/^@arbiter\//],
});
