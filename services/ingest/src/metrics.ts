// F-G1 — Metric ingest (NF-01: độ trễ thiết bị→DB ≤30s p95 · NF-14: expose Prometheus).
// Lag = giờ ghi DB − ts THIẾT BỊ trong bản ghi (đúng cách đo ghi ở PRD sheet 5).
import http from 'node:http';
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export const NF01_P95_MAX_SECONDS = 30;

/**
 * Đồng hồ thiết bị chạy TRƯỚC máy chủ quá số giây này thì coi là lệch đồng hồ, không phải
 * nhiễu mạng. 120s đủ rộng để bỏ qua trôi NTP thông thường và độ trễ hàng đợi, nhưng vẫn
 * bắt được ngay mức lệch nguy hiểm nhất: 1 giờ (UTC+8 của Trung Quốc so với UTC+7 Việt Nam).
 */
export const LECH_DONG_HO_TOI_DA_GIAY = 120;

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
  readonly #lechDongHo: Counter;
  #warned = false;
  #canhBaoLechDongHo = false;

  constructor(clock: () => number = () => Date.now()) {
    this.lagWindow = new LagWindow(undefined, clock);
    collectDefaultMetrics({ register: this.registry });
    this.#lag = new Histogram({
      name: 'g3_ingest_lag_seconds',
      help: 'Độ trễ ingest: giờ ghi DB trừ timestamp thiết bị (NF-01 ≤30s p95)',
      buckets: [1, 5, 10, 30, 60, 300, 3600],
      registers: [this.registry],
    });
    // Đếm riêng, KHÔNG gộp vào histogram lag: đây là lỗi cấu hình thiết bị, không phải
    // độ trễ mạng. Vận hành phải thấy được nó tách bạch trên Prometheus (NF-14).
    this.#lechDongHo = new Counter({
      name: 'g3_ingest_lech_dong_ho_total',
      help:
        'Số bản ghi có giờ thiết bị chạy TRƯỚC máy chủ quá ngưỡng — nghi lệch múi giờ ' +
        '(vd T-BOX dùng UTC+8 gắn nhãn UTC). >0 là phải sửa trước khi tin dữ liệu thời gian.',
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
    // ---- Đồng hồ thiết bị chạy TRƯỚC máy chủ (lag ÂM) -------------------------------
    //
    // Trước đây chỗ này chỉ có Math.max(0, …): lag âm bị kẹp về 0 và BIẾN MẤT. Nghĩa là
    // một thiết bị gắn nhãn giờ sai vẫn cho metric NF-01 đẹp như xe khoẻ mạnh.
    //
    // Vì sao nguy hiểm chứ không chỉ khó coi: tài liệu kỹ thuật Tri-Ring (07/2026) đánh
    // dấu "Timestamp theo UTC" là ✖ CHƯA XÁC NHẬN, kèm ghi chú "rủi ro lệch giờ TQ/VN".
    // T-BOX Trung Quốc gửi giờ UTC+8 mà gắn nhãn UTC sẽ làm mọi bản ghi sớm 1 giờ. Khi đó
    // ADR-010 mô tả đúng hậu quả: khung giờ ToU của chính sách sạc bị đối chiếu lệch giờ,
    // và hệ thống gắn cờ vi phạm bảo hành OAN gần như toàn bộ phiên sạc đêm — tiền và
    // pháp lý, không phải chuyện hiển thị.
    //
    // Nên: vẫn KHÔNG chặn bản ghi (NF-09 cấm mất dữ liệu), nhưng phải kêu to.
    if (lagSeconds < -LECH_DONG_HO_TOI_DA_GIAY) {
      this.#lechDongHo.inc();
      if (!this.#canhBaoLechDongHo) {
        this.#canhBaoLechDongHo = true;
        const gio = (-lagSeconds / 3600).toFixed(2);
        console.warn(
          `[ingest] CẢNH BÁO LỆCH ĐỒNG HỒ: thiết bị gửi bản ghi sớm hơn máy chủ ` +
            `${(-lagSeconds).toFixed(0)}s (~${gio} giờ). Nếu xấp xỉ 1 giờ, gần như chắc chắn ` +
            'là thiết bị dùng UTC+8 (giờ Trung Quốc) mà gắn nhãn UTC. ĐỪNG bật job gắn cờ ' +
            'vi phạm sạc cho tới khi sửa: khung giờ ToU sẽ lệch và gắn cờ oan (ADR-010).',
        );
      }
    }

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
