import { expect, test } from '@playwright/test';
import {
  pickLanguage,
  registerViaUi,
  seedSolution,
  setEditorCode,
  trackForeignRequests,
  trackSocketEvents,
} from './support/helpers';

const SLUG = 'rainfall-ledger';

test.describe('solving a problem', () => {
  test('register, open a problem, submit the C++ reference, watch it be judged and see Accepted', async ({
    page,
    baseURL,
  }) => {
    // The workspace mounts Monaco and renders a statement with math (KaTeX): nothing may
    // come from another origin (R18, no CDN).
    const foreign = trackForeignRequests(page, new URL(baseURL!).origin);
    // The UI also polls every 8 s, so only the socket frames prove live streaming.
    const socketEvents = trackSocketEvents(page);
    await registerViaUi(page);
    await page.goto('/problems');
    await page.getByRole('link', { name: 'Rainfall Ledger' }).click();
    await expect(page).toHaveURL(new RegExp(`/problems/${SLUG}$`));
    await expect(page.getByRole('heading', { name: 'Rainfall Ledger', level: 1 })).toBeVisible();

    await setEditorCode(page, seedSolution(SLUG, 'ref.cpp'));
    await page.getByRole('button', { name: /^Submit/ }).click();

    // Live progress: the stepper and the progress bar appear before the verdict does.
    const result = page.getByRole('tabpanel', { name: /result/i });
    await expect(result.getByLabel('Judging progress')).toBeVisible();
    // Final verdict banner with time and memory.
    await expect(result.getByRole('heading', { name: 'Accepted' })).toBeVisible({
      timeout: 60_000,
    });
    await expect(result.getByText(/\d+ \/ \d+ tests passed/)).toBeVisible();
    await expect(result.getByText('Time')).toBeVisible();
    await expect(result.getByText('Memory')).toBeVisible();
    await expect
      .poll(() => socketEvents, { message: 'live events received over the socket' })
      .toEqual(expect.arrayContaining(['submission:test', 'submission:done']));

    // The submission shows up in "My submissions" and on its own page.
    await result.getByRole('link', { name: /view submission details/i }).click();
    await expect(page).toHaveURL(/\/submissions\/[a-z0-9]+$/);
    await expect(page.getByText('Accepted').first()).toBeVisible();
    await expect(page.getByRole('table', { name: /test results/i })).toBeVisible();
    expect(foreign, 'requests to other origins').toEqual([]);
  });

  test('a wrong answer shows Wrong Answer and the failed-sample diff', async ({ page }) => {
    await registerViaUi(page);
    await page.goto(`/problems/${SLUG}`);
    await pickLanguage(page, 'Python 3.11');
    // Reads everything and prints a constant: wrong on sample 1.
    await setEditorCode(page, 'import sys\nsys.stdin.read()\nprint("0 0")\n');
    await page.getByRole('button', { name: /^Submit/ }).click();

    const result = page.getByRole('tabpanel', { name: /result/i });
    await expect(result.getByRole('heading', { name: 'Wrong Answer' })).toBeVisible({
      timeout: 60_000,
    });
    const diff = result.getByRole('region', { name: /failed sample 1/i });
    await expect(diff).toBeVisible();
    await expect(diff.getByTestId('diff-expected')).toContainText('54 3');
    await expect(diff.getByTestId('diff-actual')).toContainText('0 0');
  });

  test('Run with custom input shows stdout', async ({ page }) => {
    await registerViaUi(page);
    await page.goto(`/problems/${SLUG}`);
    await pickLanguage(page, 'Python 3.11');
    await setEditorCode(page, 'a, b = map(int, input().split())\nprint(a + b)\n');
    await page.getByRole('tab', { name: 'Testcase' }).click();
    await page.getByLabel('Custom input').fill('20 22\n');
    await page.getByRole('button', { name: /^Run/ }).click();
    const result = page.getByRole('tabpanel', { name: /result/i });
    await expect(result.getByText('42', { exact: true })).toBeVisible({ timeout: 60_000 });
  });

  test('a compile error shows the compiler output', async ({ page }) => {
    await registerViaUi(page);
    await page.goto(`/problems/${SLUG}`);
    await setEditorCode(page, 'int main() { return missing_symbol; }\n');
    await page.getByRole('button', { name: /^Submit/ }).click();
    const result = page.getByRole('tabpanel', { name: /result/i });
    await expect(result.getByRole('heading', { name: 'Compilation Error' })).toBeVisible({
      timeout: 60_000,
    });
    await expect(result.getByText(/missing_symbol/).first()).toBeVisible();
  });
});
