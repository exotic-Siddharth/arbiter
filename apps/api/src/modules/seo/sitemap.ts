import type { PrismaClient } from '@prisma/client';
import { PUBLIC_CONTESTS, problemsVisible } from '../contests/service';
import { PUBLIC_PROBLEMS } from '../problems/service';

/**
 * /robots.txt and /sitemap.xml for search engines (DESIGN.md Decisions log, 2026-11-14 SEO). Every
 * URL starts with the configured public origin. The sitemap lists exactly the pages a signed-out
 * visitor can open, using the same visibility rules as the public problem and contest routes.
 */

/** SPA routes that are never public pages. /api/ and /assets/ stay open: Google renders the SPA. */
const DISALLOWED = ['/admin'];

export function robotsTxt(origin: string): string {
  return [
    'User-agent: *',
    'Allow: /',
    ...DISALLOWED.map((path) => `Disallow: ${path}`),
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');
}

export interface SitemapEntry {
  loc: string;
  lastmod?: Date;
}

const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

const xmlEscape = (value: string) => value.replace(/[&<>"']/g, (ch) => XML_ESCAPES[ch]);

export function sitemapXml(entries: readonly SitemapEntry[]): string {
  const urls = entries.map(({ loc, lastmod }) => {
    const date = lastmod ? `<lastmod>${xmlEscape(lastmod.toISOString())}</lastmod>` : '';
    return `  <url><loc>${xmlEscape(loc)}</loc>${date}</url>`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}

const STATIC_PAGES = ['/', '/problems', '/contests', '/leaderboard'];

/**
 * The public pages: the static ones, every problem /problems/:slug serves to a guest, every contest
 * /contests/:slug serves to a guest, and the problem pages of those contests once they are visible.
 */
export async function sitemapEntries(
  prisma: PrismaClient,
  origin: string,
  now: Date,
): Promise<SitemapEntry[]> {
  const [problems, contests] = await Promise.all([
    prisma.problem.findMany({
      where: PUBLIC_PROBLEMS,
      orderBy: { slug: 'asc' },
      select: { slug: true, updatedAt: true },
    }),
    prisma.contest.findMany({
      where: PUBLIC_CONTESTS,
      orderBy: [{ startsAt: 'desc' }, { id: 'asc' }],
      select: {
        slug: true,
        startsAt: true,
        updatedAt: true,
        problems: {
          orderBy: { ordinal: 'asc' },
          select: { label: true, problem: { select: { updatedAt: true } } },
        },
      },
    }),
  ]);
  const page = (path: string, lastmod?: Date): SitemapEntry => ({
    loc: `${origin}${path}`,
    ...(lastmod ? { lastmod } : {}),
  });
  const slug = encodeURIComponent;
  return [
    ...STATIC_PAGES.map((path) => page(path)),
    ...problems.map((p) => page(`/problems/${slug(p.slug)}`, p.updatedAt)),
    ...contests.flatMap((contest) => [
      page(`/contests/${slug(contest.slug)}`, contest.updatedAt),
      ...(problemsVisible(contest, undefined, now)
        ? contest.problems.map((cp) =>
            page(
              `/contests/${slug(contest.slug)}/problems/${slug(cp.label)}`,
              cp.problem.updatedAt,
            ),
          )
        : []),
    ]),
  ];
}
