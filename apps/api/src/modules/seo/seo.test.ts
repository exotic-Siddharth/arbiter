import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { resetTables, setupTestDatabase } from '../../../test/db';
import { createContest, createProblem } from '../../../test/factories';
import { createApp } from '../../app';
import { sitemapXml } from './sitemap';

const HOUR = 60 * 60 * 1000;
const ORIGIN = 'https://judge.example.org';
const app = createApp({ rateLimits: false, publicOrigin: ORIGIN });
let prisma: PrismaClient;

const hoursFromNow = (hours: number) => new Date(Date.now() + hours * HOUR);

/** The <loc> values of a sitemap, in document order. */
const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);

beforeAll(async () => {
  prisma = await setupTestDatabase();
  await resetTables(prisma);
});

describe('GET /robots.txt', () => {
  it('is text/plain, cached for an hour, and points at the sitemap on the configured origin', async () => {
    const res = await request(app).get('/robots.txt');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/plain/);
    expect(res.headers['cache-control']).toBe('public, max-age=3600');
    expect(res.text).toMatch(/^User-agent: \*$/m);
    expect(res.text).toMatch(/^Allow: \/$/m);
    expect(res.text.trimEnd().split('\n').at(-1)).toBe(`Sitemap: ${ORIGIN}/sitemap.xml`);
  });

  it('disallows only the signed-in admin area, never what the SPA needs to render public pages', async () => {
    const res = await request(app).get('/robots.txt');
    const disallowed = [...res.text.matchAll(/^Disallow:\s*(\S*)$/gm)].map((m) => m[1]);
    expect(disallowed).toEqual(['/admin']);
  });

  it('defaults to the API origin setting (WEB_ORIGIN)', async () => {
    const res = await request(createApp({ rateLimits: false })).get('/robots.txt');
    expect(res.text).toContain('Sitemap: http://localhost:5173/sitemap.xml');
  });
});

describe('GET /sitemap.xml', () => {
  it('is application/xml, cached for an hour, and a sitemaps.org urlset', async () => {
    const res = await request(app).get('/sitemap.xml');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^application\/xml/);
    expect(res.headers['cache-control']).toBe('public, max-age=3600');
    expect(res.text.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')).toBe(true);
    expect(res.text).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(res.text.trimEnd().endsWith('</urlset>')).toBe(true);
  });

  it('lists the public pages as absolute URLs on the configured origin', async () => {
    const res = await request(app).get('/sitemap.xml');
    const urls = locs(res.text);
    expect(urls.slice(0, 4)).toEqual([
      `${ORIGIN}/`,
      `${ORIGIN}/problems`,
      `${ORIGIN}/contests`,
      `${ORIGIN}/leaderboard`,
    ]);
    for (const url of urls) expect(url.startsWith(`${ORIGIN}/`), url).toBe(true);
  });

  it('includes a published problem with its updatedAt and excludes a draft', async () => {
    const published = await createProblem(prisma);
    const draft = await createProblem(prisma, { isPublished: false });
    const res = await request(app).get('/sitemap.xml');
    expect(res.text).toContain(
      `<url><loc>${ORIGIN}/problems/${published.slug}</loc><lastmod>${published.updatedAt.toISOString()}</lastmod></url>`,
    );
    expect(res.text).not.toContain(draft.slug);
  });

  it('lists an upcoming contest but not its problems, and never a hidden contest', async () => {
    const secret = await createProblem(prisma, { isPublished: false });
    const upcoming = await createContest(prisma, {
      startsAt: hoursFromNow(2),
      endsAt: hoursFromNow(4),
      problems: [{ problemId: secret.id, label: 'A' }],
    });
    const hiddenProblem = await createProblem(prisma, { isPublished: false });
    const hidden = await createContest(prisma, {
      isPublished: false,
      problems: [{ problemId: hiddenProblem.id, label: 'A' }],
    });
    const res = await request(app).get('/sitemap.xml');
    const urls = locs(res.text);
    expect(urls).toContain(`${ORIGIN}/contests/${upcoming.slug}`);
    expect(res.text).toContain(
      `<url><loc>${ORIGIN}/contests/${upcoming.slug}</loc><lastmod>${upcoming.updatedAt.toISOString()}</lastmod></url>`,
    );
    expect(urls.filter((url) => url.includes(upcoming.slug))).toEqual([
      `${ORIGIN}/contests/${upcoming.slug}`,
    ]);
    expect(res.text).not.toContain(secret.slug);
    expect(res.text).not.toContain(hidden.slug);
    expect(res.text).not.toContain(hiddenProblem.slug);
  });

  it('lists the problem pages of a started contest, which a signed-out visitor can open', async () => {
    const contestOnly = await createProblem(prisma, { isPublished: false });
    const running = await createContest(prisma, {
      problems: [{ problemId: contestOnly.id, label: 'A' }],
    });
    const res = await request(app).get('/sitemap.xml');
    const urls = locs(res.text);
    expect(urls).toContain(`${ORIGIN}/contests/${running.slug}`);
    expect(urls).toContain(`${ORIGIN}/contests/${running.slug}/problems/A`);
    // The problem itself is a draft: only its contest page is public.
    expect(urls).not.toContain(`${ORIGIN}/problems/${contestOnly.slug}`);

    // What the sitemap lists, a signed-out visitor can open.
    const guest = await request(app).get(`/api/contests/${running.slug}/problems/A`);
    expect(guest.status).toBe(200);
    const draftPage = await request(app).get(`/api/problems/${contestOnly.slug}`);
    expect(draftPage.status).toBe(404);
  });

  it('lists no user-specific pages', async () => {
    const res = await request(app).get('/sitemap.xml');
    for (const url of locs(res.text)) {
      expect(url, url).not.toMatch(/\/(admin|submissions|u|login|register)(\/|$)/);
    }
  });
});

describe('sitemapXml', () => {
  it('XML-escapes every value', () => {
    const xml = sitemapXml([{ loc: `${ORIGIN}/a?x=1&y=<2>"'`, lastmod: new Date(0) }]);
    expect(xml).toContain(
      `<loc>${ORIGIN}/a?x=1&amp;y=&lt;2&gt;&quot;&apos;</loc><lastmod>1970-01-01T00:00:00.000Z</lastmod>`,
    );
  });

  it('omits <lastmod> when there is no date', () => {
    expect(sitemapXml([{ loc: `${ORIGIN}/` }])).toContain(`<url><loc>${ORIGIN}/</loc></url>`);
  });
});
