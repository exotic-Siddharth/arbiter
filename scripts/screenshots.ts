// npm run screenshots: regenerates docs/screenshots/*.png (spec section 15) against a running,
// SEEDED stack (npm run dev, or the same ports with any seeded database).
//
//   npm run screenshots -- [--base=http://localhost:5173]
//
// The script signs in as the seeded demo user and the seeded admin (passwords from apps/api/.env,
// SEED_DEMO_PASSWORD / SEED_ADMIN_PASSWORD), so it needs the API, the worker (it submits the
// Rainfall Ledger reference solutions and waits for the real verdicts) and the web app.
// The demo user gains three submissions, so run it on a throwaway copy of the seed data.
//
// Output: landing and workspace (Accepted) in light and dark, the workspace with a Wrong Answer
// diff, problems, scoreboard, profile, the admin judge monitor and the plagiarism side by side
// (dark), a 390 px mobile view (light), and hero.png (the dark Accepted workspace, for the README).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { REPO_ROOT, apiEnvValue } from './lib/api-env';

type Theme = 'light' | 'dark';

const args = new Map(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith('--'))
    .map((arg) => {
      const [key, ...rest] = arg.slice(2).split('=');
      return [key, rest.join('=')] as const;
    }),
);
const BASE = (args.get('base') ?? 'http://localhost:5173').replace(/\/$/, '');
const OUT = join(REPO_ROOT, 'docs', 'screenshots');
const SLUG = 'rainfall-ledger';
const DESKTOP = { width: 1440, height: 900 };
const ADMIN_PASSWORD = apiEnvValue('SEED_ADMIN_PASSWORD', 'admin12345');

type Source = { language: 'CPP' | 'PYTHON'; code: string };
const reference = readFileSync(join(REPO_ROOT, 'seed', 'problems', SLUG, 'ref.cpp'), 'utf8');
const ACCEPTED: Source = { language: 'CPP', code: reference.replace(/\r\n/g, '\n') };
/** Reads the input and prints a constant: wrong on sample 1, so the failed-sample diff shows. */
const WRONG: Source = {
  language: 'PYTHON',
  code: [
    'import sys',
    '',
    '',
    'def main():',
    '    sys.stdin.read()',
    '    print("0 0")',
    '',
    '',
    'main()',
    '',
  ].join('\n'),
};

async function newContext(
  browser: Browser,
  theme: Theme,
  viewport: { width: number; height: number } = DESKTOP,
): Promise<BrowserContext> {
  const context = await browser.newContext({
    baseURL: BASE,
    viewport,
    colorScheme: theme,
    locale: 'en-GB',
  });
  // Same key as apps/web/public/theme-init.js: the theme is applied before the first paint.
  await context.addInitScript((value) => localStorage.setItem('arbiter:theme', value), theme);
  return context;
}

async function shot(page: Page, name: string, fullPage = false): Promise<void> {
  await page.waitForTimeout(600); // let entrance animations and charts settle
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage });
  console.log(`  wrote docs/screenshots/${name}.png`);
}

async function loginDemo(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Try the demo' }).click();
  await expect(page.getByRole('button', { name: /^Account menu for / })).toBeVisible();
}

async function loginAdmin(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email or username').fill('admin');
  await page.getByLabel('Password', { exact: true }).fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Account menu for / })).toBeVisible();
}

/**
 * Puts the source into the workspace draft (localStorage, the key of useDraft) and picks the
 * language, then opens the problem and submits. Typing into Monaco would auto-indent every new
 * line, so the draft is seeded instead. Waits for the verdict banner.
 */
async function submitOnWorkspace(
  page: Page,
  source: Source,
  verdict: 'Accepted' | 'Wrong Answer',
): Promise<void> {
  // Leave the workspace first: its pending draft writes would overwrite the seeded values.
  await page.goto('/problems');
  await expect(page.getByRole('link', { name: 'Rainfall Ledger' })).toBeVisible();
  await page.evaluate(
    ([key, languageKey, code, language]) => {
      localStorage.setItem(key, code);
      localStorage.setItem(languageKey, JSON.stringify(language)); // useLocalStorage is JSON
    },
    [
      `arbiter:draft:${SLUG}:${source.language}`,
      'arbiter:workspace:language',
      source.code,
      source.language,
    ],
  );
  await page.goto(`/problems/${SLUG}`);
  await expect(page.getByRole('heading', { name: 'Rainfall Ledger', level: 1 })).toBeVisible();
  await expect(page.locator('.monaco-editor').first()).toBeVisible();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /^Submit/ }).click();
  const result = page.getByRole('tabpanel', { name: /result/i });
  await expect(result.getByRole('heading', { name: verdict })).toBeVisible({ timeout: 90_000 });
}

async function main(): Promise<void> {
  const browser = await chromium.launch();
  try {
    for (const theme of ['light', 'dark'] as const) {
      console.log(`${theme} theme`);
      const context = await newContext(browser, theme);
      context.setDefaultTimeout(30_000);
      const page = await context.newPage();
      await page.goto(`${BASE}/`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.waitForTimeout(1200); // landing stats count up
      await shot(page, `landing-${theme}`);

      await loginDemo(page);
      await submitOnWorkspace(page, ACCEPTED, 'Accepted');
      await shot(page, `workspace-accepted-${theme}`);
      if (theme === 'dark') {
        await shot(page, 'hero');
        await submitOnWorkspace(page, WRONG, 'Wrong Answer');
        await expect(page.getByRole('region', { name: /failed sample 1/i })).toBeVisible();
        await shot(page, 'workspace-wrong-answer-dark');

        await page.goto('/problems');
        await expect(page.getByRole('link', { name: 'Rainfall Ledger' })).toBeVisible();
        await shot(page, 'problems-dark');

        await page.goto('/contests/arbiter-round-1/scoreboard');
        await expect(page.getByRole('table').first()).toBeVisible();
        await shot(page, 'scoreboard-dark');

        await page.goto('/u/demo');
        await expect(page.getByRole('heading', { name: 'demo', level: 1 })).toBeVisible();
        await shot(page, 'profile-dark');
      }
      await context.close();
    }

    // Admin pages (dark): after the submissions above the monitor has real jobs and a worker.
    const admin = await newContext(browser, 'dark');
    admin.setDefaultTimeout(30_000);
    const adminPage = await admin.newPage();
    await adminPage.goto(`${BASE}/`);
    await loginAdmin(adminPage);
    await adminPage.goto('/admin');
    await expect(adminPage.getByRole('table', { name: 'Queue counts' })).toBeVisible();
    await expect(adminPage.getByRole('table', { name: 'Workers' }).getByRole('row')).toHaveCount(2);
    await shot(adminPage, 'admin-judge-monitor-dark');

    await adminPage.goto('/admin/plagiarism');
    await adminPage
      .getByRole('link', { name: /Arbiter Round #1/ })
      .first()
      .click();
    await expect(adminPage.getByText('2 similar pairs')).toBeVisible();
    await adminPage
      .getByRole('button', { name: /^Compare / })
      .nth(1)
      .click();
    await expect(adminPage.getByRole('region', { name: /^(A|B): / })).toHaveCount(2);
    await shot(adminPage, 'plagiarism-side-by-side-dark');
    await admin.close();

    // One 390 px mobile view (light): the submissions list, where long titles used to truncate.
    const mobile = await newContext(browser, 'light', { width: 390, height: 844 });
    mobile.setDefaultTimeout(30_000);
    const mobilePage = await mobile.newPage();
    await mobilePage.goto(`${BASE}/`);
    await loginDemo(mobilePage);
    await mobilePage.goto('/submissions');
    await expect(mobilePage.getByRole('link', { name: /Rainfall Ledger/ }).first()).toBeVisible();
    await shot(mobilePage, 'mobile-submissions-light-390');
    await mobile.close();
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
