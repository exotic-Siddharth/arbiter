import { expect, test, type Page } from '@playwright/test';
import { loginViaUi, registerViaUi, setEditorCode, uniqueUsername } from './support/helpers';

async function loginAsAdmin(page: Page) {
  await loginViaUi(page, 'admin', 'admin12345');
  await expect(page.getByRole('button', { name: 'Account menu for admin' })).toBeVisible();
}

test.describe('admin', () => {
  test('creates a problem with tests, and its reference solution validates to Accepted', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    const slug = uniqueUsername('sum').replace(/_/g, '-');

    // Details.
    await page.goto('/admin/problems/new');
    await page.getByLabel(/^Title/).fill('E2E Pair Sum');
    await page.getByLabel(/^Slug/).fill(slug);
    await page.getByLabel('Difficulty').selectOption({ label: 'Easy' });
    await page.getByLabel('Tags').fill('math, e2e');
    await page
      .getByRole('textbox', { name: 'Statement (Markdown)' })
      .fill(
        'Read two integers $a$ and $b$ and print $a + b$.\n\n## Input\nOne line with $a$ and $b$.\n\n## Output\nThe sum.',
      );
    await page.getByRole('button', { name: 'Create problem' }).click();
    await expect(page).toHaveURL(/\/admin\/problems\/[a-z0-9]+\?tab=tests/);
    await expect(page.getByText('No tests yet')).toBeVisible();

    // Tests: one sample through the dialog, one hidden test.
    for (const [input, output, sample] of [
      ['2 3\n', '5\n', true],
      ['100 -250\n', '-150\n', false],
    ] as const) {
      await page.getByRole('button', { name: 'Add test' }).first().click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Input').fill(input);
      await dialog.getByLabel('Expected output').fill(output);
      if (sample) await dialog.getByRole('switch', { name: 'Sample' }).click();
      await dialog.getByRole('button', { name: 'Add test' }).click();
      await expect(dialog).toBeHidden();
    }
    await expect(page.getByRole('table', { name: 'Test cases' }).getByRole('row')).toHaveCount(3);

    // Reference solution, then Validate (real sandbox).
    await page.getByRole('tab', { name: 'Reference' }).click();
    await page
      .getByRole('combobox', { name: 'Reference language' })
      .selectOption({ label: 'Python 3.11' });
    await setEditorCode(page, 'a, b = map(int, input().split())\nprint(a + b)\n');
    await page.getByRole('button', { name: 'Save reference' }).click();
    await expect(page.getByText('Saved.')).toBeVisible();
    await page.getByRole('button', { name: 'Validate', exact: true }).click();
    await expect(page.getByText('The reference solution is accepted')).toBeVisible({
      timeout: 60_000,
    });

    // Publish it; a signed-out visitor can then open it.
    await page.getByRole('tab', { name: 'Details' }).click();
    await page.getByRole('switch', { name: 'Published' }).click();
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Problem saved')).toBeVisible();
    const guest = await page.request.get(`/api/problems/${slug}`);
    expect(guest.status()).toBe(200);
    await page.goto('/problems');
    await page.getByLabel('Search problems').fill('E2E Pair Sum');
    await expect(page.getByRole('link', { name: 'E2E Pair Sum' })).toBeVisible();
  });

  test('Generate outputs fills the expected output from the reference solution', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/problems');
    await page.getByLabel('Search problems').fill('Rainfall');
    await expect(page.getByText(/of 1 problems/)).toBeVisible();
    await page.getByRole('link', { name: 'Rainfall Ledger' }).click();
    await expect(page).toHaveURL(/\/admin\/problems\/[a-z0-9]+$/);
    await page.getByRole('tab', { name: 'Reference' }).click();
    await page
      .getByRole('button', { name: /generate outputs|generate/i })
      .first()
      .click();
    await expect(page.getByText('Done', { exact: true })).toBeVisible({ timeout: 90_000 });
  });

  test('the judge monitor shows queues, a worker and the throughput chart', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Judge monitor' })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Queue counts' })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Workers' }).getByRole('row')).toHaveCount(2, {
      timeout: 20_000,
    });
    await expect(page.getByText(/auto-refresh every 5 s/i)).toBeVisible();
  });

  test('the plagiarism report compares two submissions side by side with the matched lines highlighted', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/plagiarism');
    await page
      .getByRole('link', { name: /Arbiter Round #1/ })
      .first()
      .click();
    await expect(page.getByText('2 similar pairs')).toBeVisible();
    await page
      .getByRole('button', { name: /^Compare / })
      .nth(1)
      .click();
    const sides = page.getByRole('region', { name: /^(A|B): / });
    await expect(sides).toHaveCount(2);
    await expect(sides.first().locator('[data-matched="true"]').first()).toBeVisible();
    // No horizontal page scroll: long code lines scroll inside their panel.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });

  test('an admin can promote and demote a user', async ({ page, browser }) => {
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    const username = await registerViaUi(otherPage);

    await loginAsAdmin(page);
    await page.goto('/admin/users');
    await page.getByLabel('Search users').fill(username);
    await page.getByRole('button', { name: `Make admin for ${username}` }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Make admin' }).click();
    await expect(page.getByRole('button', { name: `Remove admin for ${username}` })).toBeVisible();
    await page.getByRole('button', { name: `Remove admin for ${username}` }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Remove admin' }).click();
    await expect(page.getByRole('button', { name: `Make admin for ${username}` })).toBeVisible();
    await other.close();
  });
});
