import Fastify, { type FastifyError } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { registerAuth } from './modules/auth/routes.js';
import { errorSchema } from './modules/auth/schemas.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

export async function buildApp(
  databaseUrl = process.env.DATABASE_URL,
  logger = true,
) {
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 2000,
      query_timeout: 2000,
    }),
  });
  const app = Fastify({
    bodyLimit: 16 * 1024,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
    trustProxy:
      process.env.TRUST_PROXY === 'true' ? (_address, hop) => hop === 0 : false,
    logger: logger
      ? {
          redact: [
            'req.headers.authorization',
            'req.headers.cookie',
            'res.headers["set-cookie"]',
          ],
        }
      : false,
  });

  const statusSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['status'],
    properties: { status: { type: 'string', enum: ['ok'] } },
  } as const;
  if (process.env.APP_ENV !== 'production') {
    await app.register(swagger, {
      openapi: { info: { title: 'Cartmates API', version: '0.1.0' } },
    });
    await app.register(swaggerUi, { routePrefix: '/api/docs' });
  }

  app.get(
    '/api/health/live',
    {
      schema: {
        summary: 'Check that the API process is running',
        response: { 200: statusSchema },
      },
    },
    async () => ({ status: 'ok' }),
  );

  app.get(
    '/api/health/ready',
    {
      schema: {
        summary: 'Check database connectivity and the initialization migration',
        response: { 200: statusSchema, 503: errorSchema },
      },
    },
    async (request, reply) => {
      try {
        await prisma.appMetadata.findUniqueOrThrow({
          where: { key: 'initialized' },
        });
        return { status: 'ok' };
      } catch {
        request.log.warn('Database readiness check failed');
        return reply.code(503).send({
          error: {
            code: 'NOT_READY',
            message: 'Service is not ready',
            requestId: request.id,
          },
        });
      }
    },
  );

  await registerAuth(app, prisma);

  app.setErrorHandler<FastifyError>((error, request, reply) => {
    const status = error.validation ? 400 : (error.statusCode ?? 500);
    const code =
      status === 400
        ? 'VALIDATION_ERROR'
        : status === 413
          ? 'PAYLOAD_TOO_LARGE'
          : status === 415
            ? 'UNSUPPORTED_MEDIA_TYPE'
            : status === 429
              ? 'RATE_LIMITED'
              : 'INTERNAL_ERROR';
    const fields: Record<string, string> = {};
    for (const issue of error.validation ?? []) {
      const field =
        issue.instancePath.slice(1) ||
        String(
          issue.params.missingProperty ??
            issue.params.additionalProperty ??
            'body',
        );
      fields[field] = 'Check this field';
    }
    if (status >= 500) request.log.error({ code }, 'Request failed');
    return reply.code(status).send({
      error: {
        code,
        message:
          status >= 500
            ? 'Service unavailable. Try again later.'
            : 'Check the request',
        requestId: request.id,
        ...(Object.keys(fields).length ? { fields } : {}),
      },
    });
  });

  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send({
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found',
        requestId: request.id,
      },
    }),
  );
  app.addHook('onClose', async () => prisma.$disconnect());
  return app;
}
