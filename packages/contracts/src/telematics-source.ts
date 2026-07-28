// F-G1 — Hợp đồng NGUỒN telematics phía nhận (ingest): trừu tượng hóa nơi bản tin đến
// (Phase 1: MQTT/EMQX từ simulator; sau này: IoT gateway Tri-Ring thật — Q1 DECISION-LOG).
// QUY TẮC 2 (CLAUDE.md): services/ingest chỉ phụ thuộc interface này; implementation
// MQTT thật nằm ở services/ingest/src/mqtt-source.ts, mock ở ./mocks/telematics-source.ts.

/** Một bản tin thô nhận từ nguồn telematics — chưa validate, chưa parse. */
export interface TelematicsEnvelope {
  /** Topic gốc, vd g3/telemetry/G3-SIM-VIN-0001 hoặc g3/status/G3-SIM-VIN-0001. */
  topic: string;
  /** Payload thô (JSON string) — pipeline chịu trách nhiệm parse + validate. */
  payload: string;
  /** Giờ NHẬN tại ingest (epoch ms) — so với ts thiết bị trong payload để đo NF-01. */
  receivedAtMs: number;
}

export type TelematicsHandler = (msg: TelematicsEnvelope) => void | Promise<void>;

/**
 * Nguồn telematics trừu tượng. Gọi subscribe() TRƯỚC connect() để không rơi bản tin
 * retained/LWT phát ngay lúc kết nối. Nguồn phải giao cả bản tin telemetry lẫn status.
 */
export interface ITelematicsSource {
  /** Đăng ký handler nhận mọi bản tin; gọi được trước khi connect. */
  subscribe(handler: TelematicsHandler): void;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  readonly connected: boolean;
}
