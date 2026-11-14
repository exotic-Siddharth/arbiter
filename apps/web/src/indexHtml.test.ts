import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * apps/web/index.html: what crawlers and link previews (LinkedIn, WhatsApp, X) read without
 * running JavaScript. %VITE_PUBLIC_ORIGIN% is replaced by Vite at build time; /__ARBITER_PATH__ by
 * nginx per request (deploy/nginx.conf) and by the dev server (vite.config.ts).
 */
const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
const doc = new DOMParser().parseFromString(html, 'text/html');

const meta = (selector: string) =>
  doc.head.querySelector(`meta[${selector}]`)?.getAttribute('content');
const og = (property: string) => meta(`property="og:${property}"`);
const twitter = (name: string) => meta(`name="twitter:${name}"`);

describe('index.html', () => {
  it('describes the site in one plain sentence', () => {
    const description = meta('name="description"') ?? '';
    expect(description).toMatch(/^Arbiter is [^.]+\.$/);
    expect(og('description')).toBe(description);
    expect(twitter('description')).toBe(description);
  });

  it('has the Open Graph tags, with absolute URLs from the public origin', () => {
    expect(og('type')).toBe('website');
    expect(og('site_name')).toBe('Arbiter');
    expect(og('title')).toMatch(/^Arbiter/);
    expect(og('url')).toBe('%VITE_PUBLIC_ORIGIN%/__ARBITER_PATH__');
    expect(og('image')).toBe('%VITE_PUBLIC_ORIGIN%/og-image.png');
    expect(og('image:width')).toBe('1200');
    expect(og('image:height')).toBe('630');
    expect(og('image:alt')).toBeTruthy();
  });

  it('has a large-image Twitter card', () => {
    expect(twitter('card')).toBe('summary_large_image');
    expect(twitter('title')).toBe(og('title'));
    expect(twitter('image')).toBe(og('image'));
    expect(twitter('image:alt')).toBe(og('image:alt'));
  });

  it('names the page asked for as canonical (never a fixed "/": index.html serves every route)', () => {
    const canonical = doc.head.querySelectorAll('link[rel="canonical"]');
    expect(canonical).toHaveLength(1);
    expect(canonical[0].getAttribute('href')).toBe('%VITE_PUBLIC_ORIGIN%/__ARBITER_PATH__');
  });

  it('describes the site in <noscript> for crawlers that do not run JavaScript', () => {
    const noscript = doc.body.querySelector('noscript');
    expect(noscript?.textContent).toMatch(/Arbiter/);
    expect(noscript?.textContent?.length).toBeGreaterThan(80);
  });

  it('has no inline scripts (the production CSP is script-src self)', () => {
    for (const script of doc.querySelectorAll('script')) {
      expect(script.getAttribute('src'), script.outerHTML).toBeTruthy();
      expect(script.textContent?.trim()).toBe('');
    }
  });

  it('ships the 1200x630 preview image under 300 KB', () => {
    const image = resolve(process.cwd(), 'public/og-image.png');
    expect(existsSync(image)).toBe(true);
    const png = readFileSync(image);
    expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
    expect(png.length).toBeLessThan(300 * 1024);
  });
});
