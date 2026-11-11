import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const WEB_DIR = fileURLToPath(new URL('.', import.meta.url));
const SRC_DIR = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  root: WEB_DIR,
  plugins: [react()],
  resolve: {
    alias: [{ find: /^@\//, replacement: `${SRC_DIR}/` }],
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    passWithNoTests: true,
    restoreMocks: true,
    unstubGlobals: true,
    // CSS imports (Tailwind, KaTeX) are irrelevant in jsdom.
    css: false,
    // Router tests import every lazy page cold (Monaco, recharts); allow for a loaded laptop.
    testTimeout: 20_000,
  },
});
