import { test, expect } from '@playwright/test';

test('home shows readiness and a nested route survives refresh', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Cartmates', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('status')).toHaveText(
    'API and database are ready.',
  );
  await page.getByRole('link', { name: 'Service status' }).click();
  await expect(page).toHaveURL(/\/status$/);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Service status' }),
  ).toBeVisible();
  await expect(page.getByRole('status')).toHaveText(
    'API and database are ready.',
  );
});

test('an unavailable API gives feedback and supports manual retry', async ({
  page,
}) => {
  await page.route('**/api/health/ready', (route) =>
    route.fulfill({ status: 503, body: '{}' }),
  );
  await page.goto('/status');
  await expect(page.getByRole('status')).toHaveText(
    'Service unavailable. Please try again.',
  );
  await page.unroute('**/api/health/ready');
  await page.getByRole('button', { name: 'Check again' }).click();
  await expect(page.getByRole('status')).toHaveText(
    'API and database are ready.',
  );
});
