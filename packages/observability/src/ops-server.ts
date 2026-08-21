// NF-14 — Cổng vận hành dùng chung cho MỌI service không phải Fastify (ingest, csms).
// Đúng 2 đường dẫn, cố tình không hơn:
//   GET /health   → JSON tình trạng, dùng cho probe hạ tầng & docker healthcheck
//   GET /metrics  → text Prometheus
// KHÔNG expose ra internet công cộng (quy tắc 12) — chỉ Prometheus trong mạng compose gọi.
import http from 'node:http';
import type { Registry } from 'prom-client';

/** Kết quả một phép kiểm tra phụ thuộc (DB, MQTT…). */
export interface KetQuaKiemTra {
  ok: boolean;
  /** Mô tả ngắn khi hỏng — KHÔNG chứa secret/connection string (quy tắc 3). */
  chi_tiet?: string;
}

export type PhepKiemTra = () => Promise<KetQuaKiemTra> | KetQuaKiemTra;

export interface HealthReport {
  status: 'ok' | 'degraded';
  service: string;
  uptime_s: number;
  checks: Record<string, KetQuaKiemTra>;
  timestamp: string;
}

export interface OpsServerOptions {
  /** Tên service hiện trong /health và nhãn metric. */
  service: string;
  registry: Registry;
  /** Phụ thuộc cần kiểm: { db: () => …, mqtt: () => … }. Rỗng = luôn 'ok'. */
  checks?: Record<string, PhepKiemTra>;
  /** Trần thời gian cho MỖI phép kiểm tra; quá hạn coi là hỏng (mặc định 2s). */
  timeoutMs?: number;
  clock?: () => number;
}

/**
 * Chạy tất cả phép kiểm tra song song, mỗi phép có trần thời gian riêng.
 * Một phụ thuộc treo KHÔNG được làm treo /health — probe treo còn tệ hơn probe báo hỏng.
 */
export async function chayKiemTra(
  checks: Record<string, PhepKiemTra>,
  timeoutMs: number,
): Promise<Record<string, KetQuaKiemTra>> {
  const ten = Object.keys(checks);
  const ketQua = await Promise.all(
    ten.map(async (name): Promise<KetQuaKiemTra> => {
      let hetGio: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          Promise.resolve(checks[name]!()),
          new Promise<KetQuaKiemTra>((resolve) => {
            hetGio = setTimeout(
              () => resolve({ ok: false, chi_tiet: `quá ${timeoutMs}ms không trả lời` }),
              timeoutMs,
            );
          }),
        ]);
      } catch (err) {
        return { ok: false, chi_tiet: err instanceof Error ? err.message : String(err) };
      } finally {
        if (hetGio) clearTimeout(hetGio);
      }
    }),
  );
  return Object.fromEntries(ten.map((name, i) => [name, ketQua[i]!]));
}

export class OpsServer {
  readonly #opts: Required<Omit<OpsServerOptions, 'checks'>> & {
    checks: Record<string, PhepKiemTra>;
  };
  readonly #khoiDongLuc: number;
  #server: http.Server | null = null;

  constructor(opts: OpsServerOptions) {
    const clock = opts.clock ?? (() => Date.now());
    this.#opts = {
      service: opts.service,
      registry: opts.registry,
      checks: opts.checks ?? {},
      timeoutMs: opts.timeoutMs ?? 2000,
      clock,
    };
    this.#khoiDongLuc = clock();
  }

  /** Trạng thái hiện tại — tách khỏi HTTP để test không cần mở cổng. */
  async health(): Promise<HealthReport> {
    const checks = await chayKiemTra(this.#opts.checks, this.#opts.timeoutMs);
    const now = this.#opts.clock();
    return {
      status: Object.values(checks).every((c) => c.ok) ? 'ok' : 'degraded',
      service: this.#opts.service,
      uptime_s: Math.round((now - this.#khoiDongLuc) / 100) / 10,
      checks,
      timestamp: new Date(now).toISOString(),
    };
  }

  listen(port: number): http.Server {
    const server = http.createServer((req, res) => {
      // Bỏ query string: Prometheus và probe hay gắn ?verbose, ?timeout…
      const duongDan = (req.url ?? '').split('?')[0];
      if (req.method !== 'GET') {
        res.writeHead(405, { 'content-type': 'application/json' }).end('{"error":"chi_nhan_GET"}');
        return;
      }
      if (duongDan === '/health') {
        void this.health().then((report) => {
          // 503 khi degraded: probe hạ tầng đọc MÃ TRẠNG THÁI, không đọc thân JSON.
          res.writeHead(report.status === 'ok' ? 200 : 503, {
            'content-type': 'application/json; charset=utf-8',
          });
          res.end(JSON.stringify(report));
        });
        return;
      }
      if (duongDan === '/metrics') {
        void this.#opts.registry
          .metrics()
          .then((body) => {
            res.writeHead(200, { 'content-type': this.#opts.registry.contentType });
            res.end(body);
          })
          .catch(() => res.writeHead(500).end());
        return;
      }
      res.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"khong_tim_thay"}');
    });
    server.listen(port);
    this.#server = server;
    return server;
  }

  close(): void {
    this.#server?.close();
    this.#server = null;
  }
}
