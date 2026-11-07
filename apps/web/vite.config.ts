import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type ProxyOptions } from 'vite';

const WEB_DIR = fileURLToPath(new URL('.', import.meta.url));
const SRC_DIR = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig(({ mode }) => {
  // apps/web/.env (R16). Real environment variables win, so e2e can point the proxy at 4001.
  const fileEnv = loadEnv(mode, WEB_DIR, '');
  const apiTarget =
    process.env.API_PROXY_TARGET ?? fileEnv.API_PROXY_TARGET ?? 'http://localhost:4000';
  const port = Number(process.env.WEB_PORT ?? fileEnv.WEB_PORT ?? 5173);

  // Same-origin in the browser: REST and the Socket.IO websocket both go through this proxy.
  const proxy: Record<string, ProxyOptions> = {
    '/api': { target: apiTarget },
    '/socket.io': { target: apiTarget, ws: true },
  };

  return {
    root: WEB_DIR,
    envDir: WEB_DIR,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: [{ find: /^@\//, replacement: `${SRC_DIR}/` }],
    },
    server: { port, strictPort: true, proxy },
    preview: { port, strictPort: true, proxy },
    // Monaco's editor and TypeScript workers are bundled locally as ES module workers (no CDN).
    worker: { format: 'es' },
    build: {
      target: 'es2022',
      // Only the lazily loaded Monaco chunk and its workers exceed the default 500 kB.
      chunkSizeWarningLimit: 4500,
      rollupOptions: {
        output: {
          // Long-lived vendor chunks: app deploys don't invalidate React/Router/Query/zod.
          manualChunks(id) {
            if (!id.includes('/node_modules/')) return undefined;
            if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'vendor-react';
            if (id.includes('/node_modules/react-router/')) return 'vendor-router';
            if (id.includes('/node_modules/@tanstack/')) return 'vendor-query';
            if (id.includes('/node_modules/zod/')) return 'vendor-zod';
            return undefined;
          },
        },
      },
    },
  };
});
