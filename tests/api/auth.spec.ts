import { randomUUID, createHash } from 'node:crypto';
import { test as base, expect } from '@playwright/test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../apps/api/src/generated/prisma/client.js';
import { buildApp } from '../../apps/api/src/app.js';

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  'postgresql://cartmates_test:cartmates_test_only@127.0.0.1:5433/cartmates_test';
const parsed = new URL(databaseUrl);
if (
  parsed.pathname !== '/cartmates_test' ||
  !['127.0.0.1', 'localhost'].includes(parsed.hostname)
) {
  throw new Error(
    'Authentication tests require the isolated local cartmates_test database',
  );
}
const test = base.extend<{ app: Awaited<ReturnType<typeof buildApp>> }>({
  // Playwright requires destructuring even when this fixture has no dependencies.
  // eslint-disable-next-line no-empty-pattern
  app: async ({}, use) => {
    const app = await buildApp(databaseUrl, false);
    try {
      await use(app);
    } finally {
      await app.close();
    }
  },
});
const headers = { origin: 'http://localhost:8080' };
const account = () => ({
  displayName: '  Łucja Example  ',
  email: `qa-${randomUUID()}@example.test`,
  password: ' Fictional passphrase 123 ',
});
const cookieOf = (response: { headers: Record<string, unknown> }) =>
  String(response.headers['set-cookie']).split(';')[0]!;

test('registration normalizes identity, preserves Unicode, and rejects case-insensitive duplicates', async ({
  app,
}) => {
  const data = account();
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    headers,
    payload: { ...data, email: ` ${data.email.toUpperCase()} ` },
  });
  expect(response.statusCode).toBe(201);
  expect(response.json()).toEqual({
    user: {
      id: expect.any(String),
      displayName: 'Łucja Example',
      email: data.email,
      createdAt: expect.any(String),
    },
    householdId: null,
  });
  expect(response.headers['set-cookie']).toMatch(/HttpOnly/);
  expect(response.headers['set-cookie']).toMatch(/SameSite=Lax/);
  expect(response.headers['set-cookie']).toMatch(/Max-Age=604800/);
  expect(response.headers['set-cookie']).toMatch(/Path=\//);
  expect(response.headers['set-cookie']).not.toMatch(/Domain=/);
  expect(response.headers['cache-control']).toBe('no-store');
  const me = await app.inject({
    url: '/api/v1/auth/me',
    headers: { cookie: cookieOf(response) },
  });
  expect(me.statusCode).toBe(200);
  expect(me.json()).toEqual(response.json());
  const duplicate = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    headers,
    payload: data,
  });
  expect(duplicate.statusCode).toBe(409);
  expect(duplicate.json().error.code).toBe('EMAIL_TAKEN');
});

test('login rejects wrong credentials; logout revokes only its session and old cookie cannot be reused', async ({
  app,
}) => {
  const data = account();
  const registered = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    headers,
    payload: data,
  });
  expect(registered.statusCode).toBe(201);
  for (const payload of [
    { email: data.email, password: data.password.trim() },
    { email: `missing-${randomUUID()}@example.test`, password: data.password },
  ]) {
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers,
      payload,
    });
    expect(invalid.statusCode).toBe(401);
    expect(invalid.json().error.code).toBe('INVALID_CREDENTIALS');
    expect(invalid.headers['set-cookie']).toBeUndefined();
  }
  const login = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers,
    payload: { email: data.email.toUpperCase(), password: data.password },
  });
  expect(login.statusCode).toBe(200);
  expect(login.json()).toEqual(registered.json());
  expect(cookieOf(login)).not.toBe(cookieOf(registered));
  const logout = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/logout',
    headers: { ...headers, cookie: cookieOf(login) },
  });
  expect(logout.statusCode).toBe(204);
  expect(logout.body).toBe('');
  expect(logout.headers['set-cookie']).toContain('Expires=Thu, 01 Jan 1970');
  expect(
    (
      await app.inject({
        url: '/api/v1/auth/me',
        headers: { cookie: cookieOf(login) },
      })
    ).statusCode,
  ).toBe(401);
  expect(
    (
      await app.inject({
        url: '/api/v1/auth/me',
        headers: { cookie: cookieOf(registered) },
      })
    ).statusCode,
  ).toBe(200);
  expect(
    (await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers }))
      .statusCode,
  ).toBe(204);
});

test('database contains hashes and expired sessions cannot authenticate', async ({
  app,
}) => {
  const data = account();
  const registered = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    headers,
    payload: data,
  });
  expect(registered.statusCode).toBe(201);
  const token = cookieOf(registered).split('=')[1]!;
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
  try {
    const user = await db.user.findUniqueOrThrow({
      where: { email: data.email },
      include: { sessions: true },
    });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain(data.password);
    expect(user.sessions).toHaveLength(1);
    expect(user.sessions[0]!.tokenHash).toBe(
      createHash('sha256').update(token).digest('hex'),
    );
    expect(
      user.sessions[0]!.expiresAt.getTime() -
        user.sessions[0]!.createdAt.getTime(),
    ).toBeGreaterThan(604790000);
    // Only this test's session is changed, after validating the test database above.
    await db.session.update({
      where: { id: user.sessions[0]!.id },
      data: { expiresAt: new Date(0) },
    });
    const expired = await app.inject({
      url: '/api/v1/auth/me',
      headers: { cookie: cookieOf(registered) },
    });
    expect(expired.statusCode).toBe(401);
    expect(expired.json().error.code).toBe('UNAUTHENTICATED');
  } finally {
    await db.$disconnect();
  }
});

for (const [field, value] of [
  ['displayName', '   '],
  ['displayName', 'a'.repeat(61)],
  ['email', 'invalid'],
  ['email', `${'a'.repeat(243)}@example.test`],
  ['password', 'a'.repeat(11)],
  ['password', 'a'.repeat(129)],
  ['password', 123456789012],
  ['unexpected', true],
] as const) {
  test(`registration rejects ${field} boundary ${String(value).length}`, async ({
    app,
  }) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers,
      payload: { ...account(), [field]: value },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatchObject({
      code: 'VALIDATION_ERROR',
      fields: { [field]: expect.any(String) },
      requestId: expect.any(String),
    });
    expect(response.headers['set-cookie']).toBeUndefined();
  });
}
test('registration accepts minimum and maximum name/password lengths', async ({
  app,
}) => {
  for (const [nameLength, passwordLength] of [
    [1, 12],
    [60, 128],
  ] as const) {
    const result = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers,
      payload: {
        ...account(),
        displayName: 'Ł'.repeat(nameLength),
        password: 'p'.repeat(passwordLength),
      },
    });
    expect(result.statusCode).toBe(201);
    expect(result.json().user.displayName).toBe('Ł'.repeat(nameLength));
  }
});
test('missing or foreign Origin, missing or malformed cookies, and oversized bodies are rejected', async ({
  app,
}) => {
  for (const path of ['register', 'login', 'logout']) {
    for (const origin of [undefined, 'http://evil.example', 'null']) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/auth/${path}`,
        headers: origin ? { origin } : {},
      });
      expect(response.statusCode).toBe(403);
    }
  }
  for (const cookie of [
    '',
    'cartmates_session=invalid',
    `cartmates_session=${'f'.repeat(64)}`,
  ]) {
    const response = await app.inject({
      url: '/api/v1/auth/me',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(401);
  }
  const large = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    headers,
    payload: { ...account(), displayName: 'x'.repeat(17000) },
  });
  expect(large.statusCode).toBe(413);
  expect(large.json().error.code).toBe('PAYLOAD_TOO_LARGE');
});
test('each authentication attempt limit rejects attempt eleven without disrupting other instances', async ({
  app,
}) => {
  for (const path of ['register', 'login']) {
    for (let attempt = 1; attempt <= 11; attempt++) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/auth/${path}`,
        headers,
        payload: {},
      });
      expect(response.statusCode).toBe(attempt <= 10 ? 400 : 429);
      if (attempt === 11) {
        expect(response.json().error.code).toBe('RATE_LIMITED');
        expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
      }
    }
  }
});
test('concurrent duplicate registrations create exactly one account', async ({
  app,
}) => {
  const data = account();
  const results = await Promise.all(
    [1, 2].map(() =>
      app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        headers,
        payload: data,
      }),
    ),
  );
  expect(results.map((response) => response.statusCode).sort()).toEqual([
    201, 409,
  ]);
});
