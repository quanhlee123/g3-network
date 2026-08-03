// F-F1 — Test khung app + nguyên tắc MẶC ĐỊNH TỪ CHỐI (quy tắc 6).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type RouteGuardConfig } from './app';
import { loadConfig } from './config';
import { createHarness, TEST_JWT_SECRET, type Harness } from './test/app-harness';
import { seedWorld } from './test/world';

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
  await seedWorld(h.db);
});
afterAll(async () => {
  await h.close();
});

describe('@g3/api — khung app', () => {
  it('GET /health công khai, trả status ok kèm schema_version', async () => {
    const res = await h.app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
    // v2 từ Prompt 07 (F-J3): thêm điện áp nguồn nuôi + cường độ sóng — migration 0021
    expect(res.json().telemetry_schema_version).toBe(2);
  });

  it('kịch bản xấu: route không tồn tại trả 404 (không bị guard biến thành 403)', async () => {
    const res = await h.app.inject({ method: 'GET', url: '/khong-ton-tai' });

    expect(res.statusCode).toBe(404);
  });

  it('đặc tả OpenAPI sinh được và chứa các route chính', async () => {
    const spec = h.app.swagger() as { paths: Record<string, unknown> };

    expect(spec).toHaveProperty('openapi');
    for (const path of [
      '/health',
      '/auth/otp/request',
      '/auth/otp/verify',
      '/vehicles',
      '/vehicles/{id}/telemetry/latest',
      '/vehicles/{id}/location',
      '/stations',
      '/charging-sessions',
      '/charging-policies',
      '/charging-policies/{code}/versions',
      '/vehicles/{id}/charging-policy',
      '/violations',
      '/violations/{id}',
      '/stations/map',
      '/reports/kwh',
      '/reconciliation/report',
      '/devices/health',
    ]) {
      expect(spec.paths, `thiếu ${path} trong OpenAPI`).toHaveProperty(path);
    }
  });

  it('/docs mở được mà không cần token (tài liệu là public), kể cả khi có query string', async () => {
    // '/docs?v=1' là ca DUY NHẤT thật sự kiểm tra việc guard cắt query string trước khi so
    // tiền tố — '/docs/json?v=1' vẫn qua kể cả khi không cắt, nên một mình nó vô dụng.
    for (const url of ['/docs/json', '/docs/json?v=1', '/docs', '/docs?v=1']) {
      const res = await h.app.inject({ method: 'GET', url });
      expect(res.statusCode, `${url} phải mở được không cần token`).toBeLessThan(400);
    }
  });
});

describe('quy tắc 6 — mặc định TỪ CHỐI', () => {
  it('MỌI route đã đăng ký đều khai báo public / authenticated / permission', async () => {
    // Chốt chặn chống hồi quy: thêm route mới mà quên khai báo quyền là test đỏ NGAY,
    // chứ không phải phát hiện khi dữ liệu đã hở ra ngoài.
    const routes: { method: string | string[]; url: string; config: RouteGuardConfig }[] = [];
    const app = await buildApp({
      logger: false,
      config: loadConfig({ JWT_SECRET: TEST_JWT_SECRET }),
      db: h.db,
      onRoute: (r) => routes.push(r),
    });
    await app.ready();
    await app.close();

    const chuaKhaiBao = routes
      // /docs/* do @fastify/swagger-ui tự đăng ký — nằm trong allowlist tiền tố của guard
      .filter((r) => !r.url.startsWith('/docs'))
      .filter(
        (r) =>
          r.config.public !== true &&
          r.config.authenticated !== true &&
          r.config.permission === undefined,
      )
      .map((r) => `${String(r.method)} ${r.url}`);

    expect(routes.length).toBeGreaterThan(5);
    expect(chuaKhaiBao).toEqual([]);
  });

  it('gọi endpoint nghiệp vụ không kèm token → 401', async () => {
    for (const url of ['/vehicles', '/stations', '/charging-sessions', '/devices/health']) {
      const res = await h.app.inject({ method: 'GET', url });
      expect(res.statusCode, `${url} phải đòi đăng nhập`).toBe(401);
      expect(res.json().error.code).toBe('chua_dang_nhap');
    }
  });

  it('token rác → 401, không lộ chi tiết lỗi ký', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: '/vehicles',
      headers: { authorization: 'Bearer khong-phai-jwt' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.message).not.toContain('jwt');
  });

  // Phát hiện khi làm F-A5: route nào khai `400: ErrorSchema` mà gặp lỗi validate của
  // Fastify thì body mặc định không khớp schema → serialize hỏng → 400 biến thành 500,
  // tức lỗi nhập liệu của người gọi bị báo thành lỗi hệ thống. POST /auth/otp/request
  // (khai 400 từ Prompt 06) đang dính đúng lỗi này. setErrorHandler ở app.ts sửa gốc.
  it('lỗi validate trên route có khai 400 → đúng 400 theo định dạng lỗi chung, KHÔNG phải 500', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/auth/otp/request',
      payload: { phone: 123 }, // sai kiểu: schema yêu cầu chuỗi
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('du_lieu_khong_hop_le');
  });
});
