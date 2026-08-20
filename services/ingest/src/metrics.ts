// F-G1 — Metric ingest (NF-01: độ trễ thiết bị→DB ≤30s p95 · NF-14: expose Prometheus).
// Lag = giờ ghi DB − ts THIẾT BỊ trong bản ghi (đúng cách đo ghi ở PRD sheet 5).
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export const NF01_P95_MAX_SECONDS = 30;

/**
 * NF-01 áp cho cả CẢNH BÁO: bản ghi chạm ngưỡng lúc T thì cảnh báo phải có mặt trước T+30s.
 * Đo từ giờ THIẾT BỊ của bản ghi kích hoạt, không phải từ lúc pipeline bắt đầu xử lý —
 * người vận hành chịu hậu quả của TOÀN BỘ chuỗi trễ, không riêng đoạn trong tiến trình.
 */
export const NF01_ALERT_MAX_SECONDS = 30;

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
  readonly #lagP95: Gauge;
  readonly #records: Counter;
  readonly #lechDongHo: Counter;
  readonly #banTinCuoi: Gauge;
  readonly #alerts: Counter;
  readonly #alertLatency: Histogram;
  #warned = false;
  #canhBaoLechDongHo = false;

  constructor(private readonly clock: () => number = () => Date.now()) {
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
    // Bucket của histogram lag quá thưa để suy ra p95 chính xác; gauge này là p95 ĐÃ TÍNH
    // của cửa sổ 5 phút — vẽ thẳng lên Grafana và đặt alert NF-01 không cần histogram_quantile.
    this.#lagP95 = new Gauge({
      name: 'g3_ingest_lag_p95_5m_seconds',
      help: 'p95 độ trễ ingest trong cửa sổ trượt 5 phút (NF-01 ≤30s)',
      registers: [this.registry],
    });
    // NF-14 'alert khi ingest gián đoạn': Prometheus KHÔNG phát hiện được sự vắng mặt của
    // một counter đang đứng yên, nhưng phát hiện được 'time() - gauge này > ngưỡng'.
    this.#banTinCuoi = new Gauge({
      name: 'g3_ingest_last_message_timestamp_seconds',
      help: 'Unix time (giây) của bản tin telemetry hợp lệ gần nhất — dùng để báo ingest đứt',
      registers: [this.registry],
    });
    this.#alerts = new Counter({
      name: 'g3_alerts_total',
      help: 'Số cảnh báo đã bắn, theo bộ đánh giá sinh ra nó',
      labelNames: ['nguon'],
      registers: [this.registry],
    });
    this.#alertLatency = new Histogram({
      name: 'g3_alert_latency_seconds',
      help: 'Trễ cảnh báo: lúc ghi alert trừ ts THIẾT BỊ của bản ghi kích hoạt (NF-01 ≤30s)',
      buckets: [0.5, 1, 2, 5, 10, 30, 60, 300],
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
    if (p95 !== null) this.#lagP95.set(p95);
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

  /** Đánh dấu vừa nhận được bản tin hợp lệ — mốc để báo 'ingest gián đoạn' (NF-14). */
  markBanTin(atMs: number): void {
    this.#banTinCuoi.set(atMs / 1000);
  }

  /**
   * Ghi nhận cảnh báo vừa bắn từ MỘT bộ đánh giá (pin / bất thường / geofence).
   * tsThietBiMs = giờ THIẾT BỊ của bản ghi kích hoạt; null thì chỉ đếm, KHÔNG bịa
   * số 0 vào histogram trễ. soLuong = 0 thì không ghi gì (đường chạy thường xuyên nhất).
   *
   * Nhãn ở đây là NGUỒN chứ không phải alert_type: pipeline chỉ biết bộ đánh giá nào vừa
   * bắn bao nhiêu cái. Bảng chia theo type/severity chính xác do apps/api đọc thẳng từ
   * bảng alerts (xem apps/api/src/routes/metrics.ts) — không đoán ở tầng này.
   */
  observeAlert(nguon: string, soLuong: number, tsThietBiMs: number | null): void {
    if (soLuong <= 0) return;
    this.#alerts.inc({ nguon }, soLuong);
    if (tsThietBiMs === null || Number.isNaN(tsThietBiMs)) return;
    // Dữ liệu gửi bù sau mất sóng (NF-09) sinh cảnh báo với ts rất cũ — vẫn ghi trung thực;
    // chỉ chặn số ÂM (đồng hồ thiết bị chạy nhanh, đã có counter riêng ở trên).
    const tre = Math.max(0, (this.clock() - tsThietBiMs) / 1000);
    for (let i = 0; i < soLuong; i++) this.#alertLatency.observe(tre);
  }
}
