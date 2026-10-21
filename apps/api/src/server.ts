import { buildApp } from './app.js';
const app = await buildApp();
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close();
  });
}
await app.listen({ host: '0.0.0.0', port: Number(process.env.PORT ?? 3000) });
