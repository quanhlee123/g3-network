// Khung khởi tạo (Prompt 01, chưa gắn F-xx) — route kiểm tra sức khỏe hệ thống.
import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { TELEMETRY_SCHEMA_VERSION } from '@g3/shared';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/health',
    {
      // Công khai: probe hạ tầng phải gọi được khi chưa có tài khoản (NF-14).
      config: { public: true },
      schema: {
        tags: ['he-thong'],
        summary: 'Kiểm tra sức khỏe hệ thống',
        response: {
          200: Type.Object({
            status: Type.Literal('ok'),
            uptime_s: Type.Number(),
            telemetry_schema_version: Type.Number(),
            timestamp: Type.String({ format: 'date-time' }),
          }),
        },
      },
    },
    async () => ({
      status: 'ok' as const,
      uptime_s: process.uptime(),
      telemetry_schema_version: TELEMETRY_SCHEMA_VERSION,
      timestamp: new Date().toISOString(),
    }),
  );
}
