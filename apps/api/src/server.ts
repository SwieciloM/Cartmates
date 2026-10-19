import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 2000,
    query_timeout: 2000,
  }),
});
const app = Fastify({
  bodyLimit: 16 * 1024,
  logger: {
    redact: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
    ],
  },
});

const statusSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['status'],
  properties: { status: { type: 'string', enum: ['ok'] } },
} as const;
const errorSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      additionalProperties: false,
      required: ['code', 'message', 'requestId'],
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
        requestId: { type: 'string' },
      },
    },
  },
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
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close();
  });
}
await app.listen({ host: '0.0.0.0', port: Number(process.env.PORT ?? 3000) });
