// NF-14 — Test cổng vận hành: /health phản ánh đúng phụ thuộc, /metrics ra text Prometheus.
import { Counter, Registry } from 'prom-client';
import { describe, expect, it } from 'vitest';
import { kiemTraDb } from './checks';
import { OpsServer, chayKiemTra } from './ops-server';

function moCong(server: OpsServer): { port: number; dong: () => void } {
  const http = server.listen(0);
  const addr = http.address();
  if (addr === null || typeof addr === 'string') throw new Error('không lấy được cổng');
  return { port: addr.port, dong: () => server.close() };
}

describe('OpsServer', () => {
  it('/health trả ok khi mọi phụ thuộc khoẻ', async () => {
    const server = new OpsServer({
      service: 'ingest',
      registry: new Registry(),
      checks: { db: () => ({ ok: true }) },
    });
    const report = await server.health();
    expect(report.status).toBe('ok');
    expect(report.service).toBe('ingest');
    expect(report.checks.db).toEqual({ ok: true });
  });

  it('/health trả degraded + HTTP 503 khi 1 phụ thuộc hỏng', async () => {
    const server = new OpsServer({
      service: 'csms',
      registry: new Registry(),
      checks: { db: () => ({ ok: true }), mqtt: () => ({ ok: false, chi_tiet: 'mất kết nối' }) },
    });
    const { port, dong } = moCong(server);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      // Probe hạ tầng đọc mã trạng thái chứ không parse JSON — 503 mới là tín hiệu thật.
      expect(res.status).toBe(503);
      const body = (await res.json()) as { status: string; checks: Record<string, unknown> };
      expect(body.status).toBe('degraded');
      expect(body.checks.mqtt).toEqual({ ok: false, chi_tiet: 'mất kết nối' });
    } finally {
      dong();
    }
  });

  it('phụ thuộc TREO không làm treo /health — quá hạn thì báo hỏng', async () => {
    const checks = { db: () => new Promise<never>(() => {}) }; // không bao giờ resolve
    const bandau = Date.now();
    const ketQua = await chayKiemTra(checks, 50);
    expect(Date.now() - bandau).toBeLessThan(2000);
    expect(ketQua.db!.ok).toBe(false);
    expect(ketQua.db!.chi_tiet).toContain('50ms');
  });

  it('phép kiểm tra NÉM lỗi được tính là hỏng, không làm sập server', async () => {
    const ketQua = await chayKiemTra(
      {
        db: () => {
          throw new Error('ECONNREFUSED');
        },
      },
      100,
    );
    expect(ketQua.db).toEqual({ ok: false, chi_tiet: 'ECONNREFUSED' });
  });

  it('/metrics trả text Prometheus của registry được truyền vào', async () => {
    const registry = new Registry();
    new Counter({ name: 'g3_thu_nghiem_total', help: 'đếm thử', registers: [registry] }).inc(3);
    const server = new OpsServer({ service: 'ingest', registry });
    const { port, dong } = moCong(server);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/metrics`);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('g3_thu_nghiem_total 3');
    } finally {
      dong();
    }
  });

  it('đường dẫn lạ trả 404, không lộ thông tin', async () => {
    const server = new OpsServer({ service: 'ingest', registry: new Registry() });
    const { port, dong } = moCong(server);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      expect(res.status).toBe(404);
    } finally {
      dong();
    }
  });
});

describe('kiemTraDb', () => {
  it('DB lỗi → ok:false và KHÔNG lộ chuỗi kết nối trong chi tiết (quy tắc 3)', async () => {
    const check = kiemTraDb({
      query: () =>
        Promise.reject(
          new Error('connect ECONNREFUSED postgres://g3:matkhau-that@localhost:5432/g3'),
        ),
    });
    const ketQua = await check();
    expect(ketQua.ok).toBe(false);
    expect(ketQua.chi_tiet).not.toContain('matkhau-that');
    expect(ketQua.chi_tiet).not.toContain('postgres://');
  });
});
