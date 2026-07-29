// F-G1 — Metric ingest (NF-01: độ trễ thiết bị→DB ≤30s p95 · NF-14: expose Prometheus).
// Lag = giờ ghi DB − ts THIẾT BỊ trong bản ghi (đúng cách đo ghi ở PRD sheet 5).
import http from 'node:http';
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export const NF01_P95_MAX_SECONDS = 30;

export type IngestResult = 'valid' | 'duplicate' | 'quarantine';

/** Cửa sổ trượt tính p95 lag 5 phút gần nhất — cảnh báo vận hành khi vượt NF-01. */
export class LagWindow {
  #samples: { atMs: number; lagSeconds: number }[] = [];

  constructor(
    private readonly windowMs = 5 * 60_000,
    private readonly clock: () => number = () => Date.now(),
  ) {}

  add(lagSeconds: number): void {
    const now = this.clock();
    this.#samples.push({ atMs: now, lagSeconds });
    const cutoff = now - this.windowMs;
    while (this.#samples.length > 0 && this.#samples[0]!.atMs < cutoff) {
      this.#samples.shift();
    }
  }

  /** p95 của cửa sổ hiện tại; null nếu chưa có mẫu. */
  p95(): number | null {
    if (this.#samples.length === 0) return null;
    const sorted = this.#samples.map((s) => s.lagSeconds).sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]!;
  }
}

export class IngestMetrics {
  readonly registry = new Registry();
  readonly lagWindow: LagWindow;
  readonly #lag: Histogram;
  readonly #records: Counter;
  #warned = false;

  constructor(clock: () => number = () => Date.now()) {
    this.lagWindow = new LagWindow(undefined, clock);
    collectDefaultMetrics({ register: this.registry });
    this.#lag = new Histogram({
      name: 'g3_ingest_lag_seconds',
      help: 'Độ trễ ingest: giờ ghi DB trừ timestamp thiết bị (NF-01 ≤30s p95)',
      buckets: [1, 5, 10, 30, 60, 300, 3600],
      registers: [this.registry],
    });
    this.#records = new Counter({
      name: 'g3_ingest_records_total',
      help: 'Số bản tin ingest theo kết quả xử lý',
      labelNames: ['result'],
      registers: [this.registry],
    });
  }

  observeLag(lagSeconds: number): void {
    // Bản ghi gửi bù sau mất sóng (NF-09) có lag lớn hợp lệ — vẫn ghi nhận trung thực,
    // NF-01 chỉ áp cho xe online nên cảnh báo dựa trên p95 cửa sổ, không từng bản ghi.
    this.#lag.observe(Math.max(0, lagSeconds));
    this.lagWindow.add(Math.max(0, lagSeconds));
    const p95 = this.lagWindow.p95();
    if (p95 !== null && p95 > NF01_P95_MAX_SECONDS) {
      if (!this.#warned) {
        this.#warned = true;
        console.warn(`[ingest] CẢNH BÁO NF-01: p95 lag 5 phút = ${p95.toFixed(1)}s > 30s`);
      }
    } else {
      this.#warned = false;
    }
  }

  count(result: IngestResult): void {
    this.#records.inc({ result });
  }

  /** HTTP GET /metrics dạng text Prometheus (NF-14). */
  serve(port: number): http.Server {
    const server = http.createServer((req, res) => {
      if (req.url === '/metrics') {
        void this.registry.metrics().then((body) => {
          res.writeHead(200, { 'content-type': this.registry.contentType });
          res.end(body);
        });
        return;
      }
      res.writeHead(404).end();
    });
    server.listen(port);
    return server;
  }
}
