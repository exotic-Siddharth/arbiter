import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';

const PROBLEMS_DIR = fileURLToPath(new URL('../../../../seed/problems/', import.meta.url));

/** The committed reference solution of a seed problem (ref.cpp, ref.py, wrong.py, slow.py). */
export function seedSolution(slug: string, file: 'ref.cpp' | 'ref.py' | 'wrong.py' | 'slow.py') {
  return readFileSync(`${PROBLEMS_DIR}${slug}/${file}`, 'utf8').replace(/\r\n/g, '\n');
}

let counter = 0;
/** A username that is unique per run and per call (3-24 chars: letters, digits, underscore). */
export function uniqueUsername(prefix = 'e2e') {
  counter += 1;
  const stamp = Date.now().toString(36).slice(-6);
  return `${prefix}_${stamp}${counter}`;
}

export const PASSWORD = 'e2e-pass-12345';

export async function registerViaUi(page: Page, username = uniqueUsername()) {
  await page.goto('/register');
  await page.getByLabel('Email', { exact: true }).fill(`${username}@e2e.arbiter.test`);
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('button', { name: /^Account menu for / })).toBeVisible();
  return username;
}

export async function loginViaUi(page: Page, identifier: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email or username').fill(identifier);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** Replaces the content of the (single) Monaco editor on the page. */
export async function setEditorCode(page: Page, code: string, nth = 0) {
  const editor = page.locator('.monaco-editor').nth(nth);
  await expect(editor).toBeVisible();
  await editor.locator('.native-edit-context, textarea.inputarea').first().focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Delete');
  await page.keyboard.insertText(code);
}

export async function pickLanguage(page: Page, label: string) {
  await page.getByRole('combobox', { name: 'Language' }).selectOption({ label });
}

/** Collects requests that leave the app's origin (spec 12, R18: no CDN, no external assets). */
export function trackForeignRequests(page: Page, origin: string) {
  const foreign: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith('http') && url.origin !== origin) foreign.push(request.url());
  });
  return foreign;
}

/**
 * Names of the Socket.IO events the page has received over its WebSocket (e.g.
 * 'submission:test', 'submission:done'). Lets a test prove the live path works even though
 * the UI also polls as a fallback. The client uses the websocket transport first.
 */
export function trackSocketEvents(page: Page) {
  const names: string[] = [];
  page.on('websocket', (socket) => {
    socket.on('framereceived', ({ payload }) => {
      const match = /^42\d*\["([^"]+)"/.exec(String(payload));
      if (match?.[1]) names.push(match[1]);
    });
  });
  return names;
}
