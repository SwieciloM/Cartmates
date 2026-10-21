import { createHash, randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  Prisma,
  type PrismaClient,
  type User,
} from '../../generated/prisma/client.js';
import {
  authErrors,
  loginBody,
  registerBody,
  userResponse,
} from './schemas.js';

const cookieName = 'cartmates_session';
const sessionSeconds = 7 * 24 * 60 * 60;
const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');
const passwordOptions = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
} as const;
const publicUser = (user: User) => ({
  user: {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
  },
  householdId: null,
});
function fail(
  request: FastifyRequest,
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
) {
  return reply
    .code(status)
    .send({ error: { code, message, requestId: request.id } });
}
export async function registerAuth(app: FastifyInstance, prisma: PrismaClient) {
  const origins = (
    process.env.ALLOWED_ORIGINS ??
    'http://localhost:8080,http://127.0.0.1:8080,http://localhost:5173,http://127.0.0.1:5173'
  )
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const secure =
    process.env.COOKIE_SECURE === 'true' ||
    process.env.APP_ENV === 'production';
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure,
  };
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  // A nonexistent account still performs a password verification.
  const dummyHash = await argon2.hash(
    randomBytes(32).toString('hex'),
    passwordOptions,
  );
  app.addHook('onRequest', async (request, reply) => {
    if (request.url.startsWith('/api/v1/'))
      reply.header('Cache-Control', 'no-store');
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
      !origins.includes(request.headers.origin ?? '')
    ) {
      return fail(request, reply, 403, 'FORBIDDEN', 'Origin is not allowed');
    }
  });
  app.addHook('preValidation', async (request) => {
    if (
      request.routeOptions.url === '/api/v1/auth/register' ||
      request.routeOptions.url === '/api/v1/auth/login'
    ) {
      const body = request.body as Record<string, unknown> | null;
      if (body && typeof body === 'object') {
        if (typeof body.email === 'string')
          body.email = body.email.trim().toLowerCase();
        if (typeof body.displayName === 'string')
          body.displayName = body.displayName.trim();
      }
    }
  });
  const attemptLimit = { rateLimit: { max: 10, timeWindow: '1 minute' } };
  const sessionData = (token: string) => ({
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + sessionSeconds * 1000),
  });
  const setSessionCookie = (reply: FastifyReply, token: string) =>
    reply.setCookie(cookieName, token, {
      ...cookieOptions,
      maxAge: sessionSeconds,
    });
  const tokenFrom = (request: FastifyRequest) => {
    const token = request.cookies[cookieName];
    return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
  };
  app.post<{ Body: { displayName: string; email: string; password: string } }>(
    '/api/v1/auth/register',
    {
      config: attemptLimit,
      schema: {
        summary: 'Register and start a seven-day session',
        body: registerBody,
        response: { 201: userResponse, ...authErrors },
      },
    },
    async (request, reply) => {
      const { displayName, email, password } = request.body;
      const passwordHash = await argon2.hash(password, passwordOptions);
      const token = randomBytes(32).toString('hex');
      try {
        const user = await prisma.user.create({
          data: {
            displayName,
            email,
            passwordHash,
            sessions: { create: sessionData(token) },
          },
        });
        setSessionCookie(reply, token);
        return reply.code(201).send(publicUser(user));
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          return fail(
            request,
            reply,
            409,
            'EMAIL_TAKEN',
            'This email is already registered',
          );
        }
        throw error;
      }
    },
  );
  app.post<{ Body: { email: string; password: string } }>(
    '/api/v1/auth/login',
    {
      config: attemptLimit,
      schema: {
        summary: 'Log in and start an independent seven-day session',
        body: loginBody,
        response: { 200: userResponse, ...authErrors },
      },
    },
    async (request, reply) => {
      const user = await prisma.user.findUnique({
        where: { email: request.body.email },
      });
      const valid = await argon2.verify(
        user?.passwordHash ?? dummyHash,
        request.body.password,
      );
      if (!user || !valid)
        return fail(
          request,
          reply,
          401,
          'INVALID_CREDENTIALS',
          'Email or password is incorrect',
        );
      const token = randomBytes(32).toString('hex');
      await prisma.session.create({
        data: { userId: user.id, ...sessionData(token) },
      });
      setSessionCookie(reply, token);
      return publicUser(user);
    },
  );
  app.get(
    '/api/v1/auth/me',
    {
      schema: {
        summary: 'Restore the current session',
        response: { 200: userResponse, ...authErrors },
      },
    },
    async (request, reply) => {
      const token = tokenFrom(request);
      const session = token
        ? await prisma.session.findUnique({
            where: { tokenHash: hashToken(token) },
            include: { user: true },
          })
        : null;
      if (!session || session.expiresAt.getTime() <= Date.now()) {
        reply.clearCookie(cookieName, cookieOptions);
        return fail(
          request,
          reply,
          401,
          'UNAUTHENTICATED',
          'Log in to continue',
        );
      }
      return publicUser(session.user);
    },
  );
  app.post(
    '/api/v1/auth/logout',
    {
      schema: {
        summary: 'Invalidate only the current session; safe to repeat',
        response: { 204: { type: 'null' }, ...authErrors },
      },
    },
    async (request, reply) => {
      const token = tokenFrom(request);
      if (token)
        await prisma.session.deleteMany({
          where: { tokenHash: hashToken(token) },
        });
      reply.clearCookie(cookieName, cookieOptions);
      return reply.code(204).send();
    },
  );
}
