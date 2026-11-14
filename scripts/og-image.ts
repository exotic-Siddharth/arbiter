// npm run og-image: renders apps/web/public/og-image.png, the 1200x630 link-preview image named by
// og:image and twitter:image in apps/web/index.html (served as /og-image.png).
//
// A small HTML card (the Arbiter mark and name, a tagline, docs/screenshots/hero.png) rendered with
// Playwright's Chromium (`npm run e2e:install -w @arbiter/web` once). Fonts and images are inlined
// as data URLs, so the output depends on the repository only. Rerun after `npm run screenshots`.
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { REPO_ROOT } from './lib/api-env';

const OUT = join(REPO_ROOT, 'apps', 'web', 'public', 'og-image.png');
const SIZE = { width: 1200, height: 630 };
/** Link previews are fetched by crawlers; keep the image small. */
const MAX_BYTES = 300 * 1024;

const dataUrl = (path: string, type: string) =>
  `data:${type};base64,${readFileSync(join(REPO_ROOT, path)).toString('base64')}`;

const hero = dataUrl('docs/screenshots/hero.png', 'image/png');
const mark = dataUrl('apps/web/public/favicon.svg', 'image/svg+xml');
const inter = dataUrl(
  'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
  'font/woff2',
);

const html = `<!doctype html>
<html>
<head>
<style>
  @font-face { font-family: 'Inter'; src: url(${inter}) format('woff2'); font-weight: 100 900; }
  * { box-sizing: border-box; margin: 0; }
  body {
    width: ${SIZE.width}px; height: ${SIZE.height}px; overflow: hidden; position: relative;
    font-family: 'Inter', sans-serif; color: #e8eaf0;
    background: #0f1018;
  }
  .text { position: absolute; left: 64px; top: 0; bottom: 0; width: 440px;
          display: flex; flex-direction: column; justify-content: center; }
  .brand { display: flex; align-items: center; gap: 18px; }
  .brand img { width: 72px; height: 72px; }
  h1 { font-size: 76px; font-weight: 800; letter-spacing: -0.03em; }
  p { margin-top: 26px; font-size: 32px; line-height: 1.25; font-weight: 600; color: #f4f5f8; }
  ul { list-style: none; padding: 0; margin-top: 30px; display: grid; gap: 10px; }
  li { font-size: 21px; color: #a9afc2; }
  li::before { content: ''; display: inline-block; width: 8px; height: 8px; border-radius: 50%;
               background: #22d3ee; margin-right: 12px; vertical-align: middle; }
  .shot { position: absolute; left: 540px; top: 92px; width: 800px; border-radius: 14px;
          border: 1px solid #2c3142; box-shadow: 0 0 0 6px #1d1a3a; }
</style>
</head>
<body>
  <div class="text">
    <div class="brand"><img src="${mark}" alt="" /><h1>Arbiter</h1></div>
    <p>Online judge and live programming contests</p>
    <ul>
      <li>Judged in a locked-down Docker sandbox</li>
      <li>ICPC-style contests, live scoreboard</li>
      <li>C++, Python, Java, JavaScript</li>
    </ul>
  </div>
  <img class="shot" src="${hero}" alt="" />
</body>
</html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: SIZE, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  // A string: this script is type-checked without the DOM library.
  await page.evaluate('document.fonts.ready.then(() => true)');
  await page.screenshot({ path: OUT, type: 'png' });
} finally {
  await browser.close();
}

const bytes = statSync(OUT).size;
console.log(`wrote ${OUT} (${Math.round(bytes / 1024)} KB)`);
if (bytes > MAX_BYTES) {
  console.error(`og-image.png is over ${MAX_BYTES / 1024} KB: simplify the card`);
  process.exit(1);
}
