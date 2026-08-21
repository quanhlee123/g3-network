// F-G2 — Metric CSMS (NF-02: trạng thái trụ ≤30s · NF-14: expose Prometheus).
// Trễ NF-02 = giờ CSMS ghi DB − timestamp trong StatusNotification của trụ. Trụ không gửi
// timestamp (OCPP 1.6 để field này optional) thì KHÔNG đo — đếm riêng, không bịa số 0.
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export const NF02_MAX_SECONDS = 30;

export class CsmsMetrics {
  readonly registry = new Registry();
  readonly #statusLag: Histogram;
  readonly #statusKhongCoGio: Counter;
  readonly #messages: Counter;
  readonly #tramKetNoi: Gauge;
  readonly #banTinCuoi: Gauge;
  #warned = false;

  constructor(private readonly clock: () => number = () => Date.now()) {
    collectDefaultMetrics({ register: this.registry });
    this.#statusLag = new Histogram({
      name: 'g3_ocpp_status_lag_seconds',
      help: 'Trễ trạng thái trụ: lúc CSMS ghi DB trừ timestamp của trụ (NF-02 ≤30s)',
      buckets: [0.5, 1, 2, 5, 10, 30, 60, 300],
      registers: [this.registry],
    });
    this.#statusKhongCoGio = new Counter({
      name: 'g3_ocpp_status_thieu_timestamp_total',
      help: 'StatusNotification không kèm timestamp — không đo được NF-02 cho bản tin đó',
      registers: [this.registry],
    });
    this.#messages = new Counter({
      name: 'g3_ocpp_messages_total',
      help: 'Số bản tin OCPP đã xử lý, theo action và kết quả',
      labelNames: ['action', 'ket_qua'],
      registers: [this.registry],
    });
    this.#tramKetNoi = new Gauge({
      name: 'g3_ocpp_stations_connected',
      help: 'Số trụ đang mở kết nối WebSocket tới CSMS',
      registers: [this.registry],
    });
    this.#banTinCuoi = new Gauge({
      name: 'g3_ocpp_last_message_timestamp_seconds',
      help: 'Unix time (giây) của bản tin OCPP gần nhất — dùng để báo CSMS đứt (NF-14)',
      registers: [this.registry],
    });
  }

  /** `tsTruIso` = trường timestamp của StatusNotification; undefined = trụ không gửi. */
  observeStatusLag(tsTruIso: string | undefined): void {
    if (tsTruIso === undefined) {
      this.#statusKhongCoGio.inc();
      return;
    }
    const tsMs = Date.parse(tsTruIso);
    if (Number.isNaN(tsMs)) {
      this.#statusKhongCoGio.inc();
      return;
    }
    // Trụ báo giờ chạy trước máy chủ → lag âm. Kẹp về 0 như ingest, nhưng ở đây chưa tách
    // counter lệch đồng hồ riêng: trụ OCPP đồng bộ giờ TỪ CSMS (BootNotification trả
    // currentTime) nên lệch đồng hồ trụ là chuyện khác hẳn với T-BOX xe.
    const lag = Math.max(0, (this.clock() - tsMs) / 1000);
    this.#statusLag.observe(lag);
    if (lag > NF02_MAX_SECONDS) {
      if (!this.#warned) {
        this.#warned = true;
        console.warn(`[csms] CẢNH BÁO NF-02: trễ trạng thái trụ ${lag.toFixed(1)}s > 30s`);
      }
    } else {
      this.#warned = false;
    }
  }

  countMessage(action: string, ketQua: 'ok' | 'loi'): void {
    this.#messages.inc({ action, ket_qua: ketQua });
    this.#banTinCuoi.set(this.clock() / 1000);
  }

  setStationsConnected(n: number): void {
    this.#tramKetNoi.set(n);
  }
}
