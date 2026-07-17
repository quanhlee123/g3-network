import { describe, expect, it } from 'vitest';
import { buildApp } from './app';

describe('@g3/api — khung khởi tạo', () => {
  it('GET /health trả về status ok kèm schema_version', async () => {
    const app = await buildApp({ logger: false });
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.telemetry_schema_version).toBe(1);
    await app.close();
  });

  it('kịch bản xấu: route không tồn tại trả 404, không crash', async () => {
    const app = await buildApp({ logger: false });
    const res = await app.inject({ method: 'GET', url: '/khong-ton-tai' });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('đặc tả OpenAPI sinh được và chứa route /health', async () => {
    const app = await buildApp({ logger: false });
    await app.ready();
    const spec = app.swagger();

    expect(spec).toHaveProperty('openapi');
    expect(spec.paths).toHaveProperty('/health');
    await app.close();
  });
});
