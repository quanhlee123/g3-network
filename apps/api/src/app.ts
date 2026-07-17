// Khung khởi tạo (Prompt 01, chưa gắn F-xx) — Fastify app factory.
// OpenAPI tự sinh từ schema TypeBox của từng route (quy tắc 11, CLAUDE.md).
import Fastify, { type FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { healthRoutes } from './routes/health';

export interface BuildAppOptions {
  logger?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? true }).withTypeProvider<TypeBoxTypeProvider>();

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'G3 Network API',
        description: 'API nền tảng vận hành xe tải điện — Phase 1 (simulator, dữ liệu giả 100%).',
        version: '0.1.0',
      },
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  await app.register(healthRoutes);

  return app;
}
