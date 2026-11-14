/**
 * The origin in index.html's absolute URLs (%VITE_PUBLIC_ORIGIN%: canonical link, og:url, og:image),
 * read by vite.config.ts. Trailing slashes are stripped, as the api does with PUBLIC_ORIGIN. Without
 * one (the dev server, CI's `npm run build`) it names the local server; the web image refuses to
 * build without one (deploy/web.Dockerfile), so a deployed page never names localhost.
 */
export function publicOrigin(configured: string | undefined, port: number): string {
  return (configured || `http://localhost:${port}`).replace(/\/+$/, '');
}
