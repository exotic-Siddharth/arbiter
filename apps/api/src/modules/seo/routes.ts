import { getDeps } from '../../lib/deps';
import { createRouter } from '../../lib/router';
import { clock } from '../../lib/time';
import { robotsTxt, sitemapEntries, sitemapXml } from './sitemap';

// Root-level files for search engines, proxied by nginx like /healthz (docs/DEPLOYMENT.md,
// "Search engines and link previews").
const { router, route } = createRouter('');
export { router };

const CACHE_CONTROL = 'public, max-age=3600';

route(
  {
    method: 'get',
    path: '/robots.txt',
    summary: 'robots.txt: crawl everything but the admin area; names the sitemap',
    tags: ['SEO'],
    responses: { 200: { description: 'text/plain robots.txt' } },
  },
  (req, res) => {
    res.set('Cache-Control', CACHE_CONTROL);
    res.type('text/plain').send(robotsTxt(getDeps(req).publicOrigin));
  },
);

route(
  {
    method: 'get',
    path: '/sitemap.xml',
    summary: 'Sitemap of the pages a signed-out visitor can open',
    tags: ['SEO'],
    responses: { 200: { description: 'application/xml sitemaps.org urlset' } },
  },
  async (req, res) => {
    const { prisma, publicOrigin } = getDeps(req);
    const entries = await sitemapEntries(prisma, publicOrigin, clock.now());
    res.set('Cache-Control', CACHE_CONTROL);
    res.type('application/xml').send(sitemapXml(entries));
  },
);
