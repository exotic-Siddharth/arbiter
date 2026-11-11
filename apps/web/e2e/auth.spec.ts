import { expect, test } from '@playwright/test';
import {
  PASSWORD,
  loginViaUi,
  registerViaUi,
  trackForeignRequests,
  uniqueUsername,
} from './support/helpers';

test.describe('auth', () => {
  test('register, stay signed in across a reload, log out and log back in', async ({
    page,
    baseURL,
  }) => {
    const foreign = trackForeignRequests(page, new URL(baseURL!).origin);
    const username = await registerViaUi(page);

    // The refresh cookie restores the session after a full reload.
    await page.reload();
    await expect(page.getByRole('button', { name: `Account menu for ${username}` })).toBeVisible();

    await page.getByRole('button', { name: `Account menu for ${username}` }).click();
    await page.getByRole('menuitem', { name: /log out/i }).click();
    await expect(page.getByRole('link', { name: 'Log in' }).first()).toBeVisible();

    await loginViaUi(page, username, PASSWORD);
    await expect(page.getByRole('button', { name: `Account menu for ${username}` })).toBeVisible();
    expect(foreign, 'requests to other origins').toEqual([]);
  });

  test('a wrong password shows an error and a taken username is refused at registration', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByLabel('Email or username').fill('demo');
    await page.getByLabel('Password', { exact: true }).fill('definitely-wrong');
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page.getByText(/invalid|incorrect|wrong/i).first()).toBeVisible();

    await page.goto('/register');
    await page
      .getByLabel('Email', { exact: true })
      .fill(`${uniqueUsername('dup')}@e2e.arbiter.test`);
    await page.getByLabel('Username', { exact: true }).fill('demo');
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText(/username is taken/i).first()).toBeVisible();
  });

  test('"Try the demo" signs in as the demo user', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /try the demo/i }).click();
    await expect(page.getByRole('button', { name: 'Account menu for demo' })).toBeVisible();
  });

  test('admin pages are closed to normal users and guests', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin/);
    await loginViaUi(page, 'demo', 'demo12345');
    await page.goto('/admin');
    await expect(page.getByText(/admins only/i)).toBeVisible();
  });
});
