import { expect, test } from '@playwright/test';

/**
 * What search engines and link previews read, through the web server (the dev server proxies
 * /robots.txt and /sitemap.xml to the api, as nginx does in production). VITE_PUBLIC_ORIGIN is not
 * set here, so the tags name this server.
 */
test.describe('search engines and link previews', () => {
  test('the page head carries the preview tags, and the preview image is served', async ({
    page,
    request,
    baseURL,
  }) => {
    const origin = new URL(baseURL!).origin;
    await page.goto('/problems');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${origin}/`);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', `${origin}/`);
    const image = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(image).toBe(`${origin}/og-image.png`);
    // Route components still set their own titles.
    await expect(page).toHaveTitle('Problems · Arbiter');

    const png = await request.get(image!);
    expect(png.status()).toBe(200);
    expect(png.headers()['content-type']).toBe('image/png');
  });

  test('robots.txt names the sitemap, and the sitemap lists a seeded public problem', async ({
    request,
    baseURL,
  }) => {
    const robots = await request.get('/robots.txt');
    expect(robots.status()).toBe(200);
    expect(robots.headers()['content-type']).toMatch(/^text\/plain/);
    expect(await robots.text()).toContain(`Sitemap: ${new URL(baseURL!).origin}/sitemap.xml`);

    const sitemap = await request.get('/sitemap.xml');
    expect(sitemap.status()).toBe(200);
    expect(sitemap.headers()['content-type']).toMatch(/^application\/xml/);
    expect(await sitemap.text()).toContain(`<loc>${baseURL}/problems/rainfall-ledger</loc>`);
  });
});
