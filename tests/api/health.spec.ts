import { test, expect } from '@playwright/test';

for (const endpoint of ['live', 'ready']) {
  test(`${endpoint} reports a healthy service through the web proxy`, async ({
    request,
  }) => {
    const response = await request.get(`/api/health/${endpoint}`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');
    expect(await response.json()).toEqual({ status: 'ok' });
  });
}

test('unknown API routes return JSON rather than the SPA page', async ({
  request,
}) => {
  const response = await request.get('/api/does-not-exist');
  expect(response.status()).toBe(404);
  expect(await response.json()).toEqual({
    error: {
      code: 'NOT_FOUND',
      message: expect.any(String),
      requestId: expect.any(String),
    },
  });
});

test('OpenAPI describes health responses', async ({ request }) => {
  const response = await request.get('/api/docs/json');
  expect(response.status()).toBe(200);
  const document = await response.json();
  expect(document.paths['/api/health/ready'].get.responses).toHaveProperty(
    '503',
  );
});
