import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';

test('sign up, restore after refresh, log out, and log in at mobile width', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const email = `ui-${randomUUID()}@example.test`;
  const password = 'Fictional passphrase 123';
  await page.goto('/account');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole('link', { name: 'Create an account' }).click();
  await page.getByLabel('Display name').fill('Łucja Example');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password').fill('Different passphrase');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Passwords must match')).toBeVisible();
  await expect(page.getByLabel('Confirm password')).toBeFocused();
  await page.getByLabel('Confirm password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByText('Welcome, Łucja Example.')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Welcome, Łucja Example.')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(await page.evaluate(() => document.cookie)).not.toContain(
    'cartmates_session',
  );
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await page.getByRole('button', { name: 'Log out', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole('heading', { name: 'Log in', exact: true }),
  ).not.toHaveAttribute('tabindex');
  await expect(page.getByLabel('Email', { exact: true })).toBeFocused();
  await page.goto('/account');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('Welcome, Łucja Example.')).toHaveCount(0);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Welcome, Łucja Example.')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Your account', exact: true }),
  ).not.toHaveAttribute('tabindex');
  await expect(
    page.getByRole('button', { name: 'Log out', exact: true }),
  ).toBeFocused();
});

for (const path of ['register', 'login']) {
  test(`${path} shows persistent required errors and blocks invalid submission`, async ({
    page,
  }, testInfo) => {
    let submissions = 0;
    page.on('request', (request) => {
      if (
        request.method() === 'POST' &&
        request.url().endsWith(`/auth/${path}`)
      )
        submissions++;
    });
    await page.goto(`/${path}`);
    const email = page.getByLabel('Email', { exact: true });
    const password = page.getByLabel('Password', { exact: true });
    await page
      .getByRole('button', {
        name: path === 'register' ? 'Create account' : 'Log in',
        exact: true,
      })
      .click();
    const summary = page.getByRole('alert');
    await expect(summary).toHaveText('Check the form fields and try again');
    await expect(
      page.getByRole('heading', {
        name: path === 'register' ? 'Sign up' : 'Log in',
        exact: true,
      }),
    ).not.toHaveAttribute('tabindex');
    const buttonBox = await page
      .getByRole('button', {
        name: path === 'register' ? 'Create account' : 'Log in',
        exact: true,
      })
      .boundingBox();
    const summaryBox = await summary.boundingBox();
    expect(summaryBox!.x).toBeGreaterThan(buttonBox!.x + buttonBox!.width);
    expect(summaryBox!.y).toBeLessThan(buttonBox!.y + buttonBox!.height);
    await page.screenshot({
      path: testInfo.outputPath('validation-summary-desktop.png'),
      fullPage: true,
    });
    await expect(email).toHaveAccessibleDescription('Email is required');
    await expect(password).toHaveAccessibleDescription('Password is required');
    await expect(email).toHaveAttribute('aria-invalid', 'true');
    await expect(
      path === 'register' ? page.getByLabel('Display name') : email,
    ).toBeFocused();
    if (path === 'register') {
      await expect(page.getByLabel('Display name')).toHaveAccessibleDescription(
        'Display name is required',
      );
      await expect(
        page.getByLabel('Confirm password'),
      ).toHaveAccessibleDescription('Confirm your password');
    }
    await email.fill('not-an-email');
    await page.keyboard.press('Tab');
    await expect(email).toHaveAccessibleDescription(
      'Enter a valid email address',
    );
    await expect(password).toBeFocused();
    await password.fill('short');
    await page.keyboard.press('Tab');
    await expect(password).toHaveAccessibleDescription('Use 12–128 characters');
    await email.fill('alex@example.test');
    await expect(email).toHaveAttribute('aria-invalid', 'false');
    await password.fill('Fictional passphrase 123');
    await expect(password).toHaveAttribute('aria-invalid', 'false');
    await expect(password).toBeFocused();
    expect(submissions).toBe(0);
  });
}

test('blur validation preserves keyboard position and the focus outline clears the label', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/register');
  const name = page.getByLabel('Display name');
  const email = page.getByLabel('Email', { exact: true });
  const password = page.getByLabel('Password', { exact: true });
  await name.fill('Łucja Example');
  await page.keyboard.press('Tab');
  await email.fill('invalid');
  await page.keyboard.press('Tab');
  await expect(email).toHaveAccessibleDescription(
    'Enter a valid email address',
  );
  await expect(password).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await email.fill('alex@example.test');
  await expect(email).toHaveAttribute('aria-invalid', 'false');
  await page.keyboard.press('Shift+Tab');
  await expect(name).toBeFocused();
  const geometry = await name.evaluate((input) => {
    const label = document.querySelector('label[for="displayName"]')!;
    const style = getComputedStyle(input);
    return {
      gap:
        input.getBoundingClientRect().top -
        label.getBoundingClientRect().bottom,
      extent: parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset),
      outline: style.outlineStyle,
      width: parseFloat(style.outlineWidth),
    };
  });
  expect(geometry.outline).toBe('solid');
  expect(geometry.width).toBeGreaterThan(0);
  expect(geometry.gap).toBeGreaterThan(geometry.extent);
  await page.screenshot({
    path: testInfo.outputPath('focused-input-mobile.png'),
    fullPage: true,
  });
});

test('failed registration preserves input and manual retry succeeds', async ({
  page,
}) => {
  await page.goto('/register');
  await page.getByLabel('Display name').fill('Alex Example');
  await page
    .getByLabel('Email', { exact: true })
    .fill(`ui-${randomUUID()}@example.test`);
  await page
    .getByLabel('Password', { exact: true })
    .fill('Fictional passphrase 123');
  await page.getByLabel('Confirm password').fill('Fictional passphrase 123');
  await page.route('**/api/v1/auth/register', (route) => route.abort());
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('alert')).toContainText('Unable to save');
  await expect(page.getByLabel('Display name')).toHaveValue('Alex Example');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue(
    'Fictional passphrase 123',
  );
  await page.unroute('**/api/v1/auth/register');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Welcome, Alex Example.')).toBeVisible();
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'UNAUTHENTICATED' } }),
    }),
  );
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('Welcome, Alex Example.')).toHaveCount(0);
});
