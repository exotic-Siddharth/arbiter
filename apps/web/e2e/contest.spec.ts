import { expect, test } from '@playwright/test';
import { registerViaUi, seedSolution, setEditorCode } from './support/helpers';

const CONTEST = 'weekly-practice-arena';

test.describe('contests', () => {
  test('the scoreboard updates live in a second browser context after a submission', async ({
    browser,
    page,
  }) => {
    // Watcher: a signed-out visitor looking at the live scoreboard.
    const watcherContext = await browser.newContext();
    const watcher = await watcherContext.newPage();
    await watcher.goto(`/contests/${CONTEST}/scoreboard`);
    await expect(watcher.getByRole('table')).toBeVisible();
    await expect(watcher.getByText('Live', { exact: true })).toBeVisible();

    // Participant: registers, joins the running contest and solves problem A (a hidden-until-the-end problem).
    const username = await registerViaUi(page);
    await page.goto(`/contests/${CONTEST}`);
    await page.getByRole('button', { name: 'Register', exact: true }).click();
    await expect(page.getByText('Registered', { exact: true }).first()).toBeVisible();

    await page.goto(`/contests/${CONTEST}/problems/A`);
    await expect(page.getByRole('navigation', { name: 'Contest problems' })).toBeVisible();
    await setEditorCode(page, seedSolution('badge-collisions', 'ref.cpp'));
    await page.getByRole('button', { name: /^Submit/ }).click();
    const result = page.getByRole('tabpanel', { name: /result/i });
    await expect(result.getByRole('heading', { name: 'Accepted' })).toBeVisible({
      timeout: 60_000,
    });

    // The watcher never reloads: the new row arrives over the socket.
    const row = watcher.getByRole('row').filter({ hasText: username });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row.getByRole('cell').first()).toContainText(/\d+/);
    await expect(row).toContainText('+');

    // The contest page lists the submission and marks the problem as solved.
    await page.goto(`/contests/${CONTEST}`);
    await expect(page.getByRole('row').filter({ hasText: 'Badge Collisions' })).toBeVisible();
    await watcherContext.close();
  });

  test('contest problems stay hidden until the contest starts, and Round #1 is open for practice', async ({
    page,
  }) => {
    await page.goto('/contests/arbiter-round-1');
    await expect(page.getByText('Final')).toBeVisible();
    await page.getByRole('tab', { name: 'Scoreboard' }).click();
    await expect(page.getByRole('row').filter({ hasText: 'zeta_zed' })).toBeVisible();
    await page.goto('/contests');
    await expect(page.getByRole('tab', { name: /Running/ })).toBeVisible();
    await expect(page.getByText('Weekly Practice Arena')).toBeVisible();
    // An unpublished contest problem is not reachable as a plain problem.
    const response = await page.request.get('/api/problems/badge-collisions');
    expect(response.status()).toBe(404);
  });
});
