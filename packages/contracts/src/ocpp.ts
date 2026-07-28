// F-G2 — Hợp đồng OCPP 1.6J (JSON qua WebSocket) giữa trụ sạc và CSMS tự xây
// (tham chiếu SteVe; Q8 DECISION-LOG: vận hành 1.6J, sẵn sàng nâng 2.0.1).
// QUY TẮC 2 (CLAUDE.md): csms/ocpp-sim chỉ đụng lib `ws` trong file transport riêng;
// toàn bộ logic nghiệp vụ dùng IChargePointTransport + OcppRpc thuần túy ở đây.

// ---------- Khung message OCPP-J (spec OCPP 1.6 JSON, mục 4.2) ----------

export const OCPP_SUBPROTOCOL = 'ocpp1.6';

export type OcppCall = [2, string, string, unknown]; // [MessageTypeId, UniqueId, Action, Payload]
export type OcppCallResult = [3, string, unknown];
export type OcppCallError = [4, string, string, string, unknown];
export type OcppFrame = OcppCall | OcppCallResult | OcppCallError;

/** Parse 1 frame OCPP-J; trả null nếu không đúng dạng (bên nhận tự quyết cách báo lỗi). */
export function parseOcppFrame(data: string): OcppFrame | null {
  let raw: unknown;
  try {
    raw = JSON.parse(data);
  } catch {
    return null;
  }
  if (!Array.isArray(raw) || raw.length < 3) return null;
  const [type, uid] = raw;
  if (typeof uid !== 'string') return null;
  if (type === 2 && raw.length === 4 && typeof raw[2] === 'string') return raw as OcppCall;
  if (type === 3 && raw.length === 3) return raw as OcppCallResult;
  if (type === 4 && raw.length === 5 && typeof raw[2] === 'string') return raw as OcppCallError;
  return null;
}

// ---------- Payload các action Phase 1 (đủ cho F-G2/F-C2/F-B2/F-H1) ----------

export type ConnectorOcppStatus =
  | 'Available'
  | 'Preparing'
  | 'Charging'
  | 'SuspendedEVSE'
  | 'SuspendedEV'
  | 'Finishing'
  | 'Reserved'
  | 'Unavailable'
  | 'Faulted';

export interface BootNotificationReq {
  chargePointVendor: string;
  chargePointModel: string;
  chargePointSerialNumber?: string;
  firmwareVersion?: string;
}
export interface BootNotificationConf {
  status: 'Accepted' | 'Pending' | 'Rejected';
  currentTime: string;
  interval: number; // giây giữa 2 Heartbeat
}

export type HeartbeatReq = Record<string, never>;
export interface HeartbeatConf {
  currentTime: string;
}

export interface StatusNotificationReq {
  connectorId: number; // 0 = cả trụ, ≥1 = từng súng (khớp connectors.ocpp_connector_id)
  status: ConnectorOcppStatus;
  errorCode: string; // 'NoError' | 'GroundFailure' | ...
  timestamp?: string;
  info?: string;
}
export type StatusNotificationConf = Record<string, never>;

export interface StartTransactionReq {
  connectorId: number;
  /** Phase 1 (simulator): idTag = VIN xe GIẢ — xem ADR-005; luồng thật sẽ do F-H1 cấp. */
  idTag: string;
  meterStart: number; // Wh
  timestamp: string;
}
export interface StartTransactionConf {
  transactionId: number;
  idTagInfo: { status: 'Accepted' | 'Blocked' | 'Expired' | 'Invalid' };
}

export interface SampledValue {
  value: string;
  measurand?: string; // 'Energy.Active.Import.Register' | 'SoC' | 'Power.Active.Import'
  unit?: string; // 'Wh' | 'Percent' | 'W'
  context?: string;
}
export interface MeterValue {
  timestamp: string;
  sampledValue: SampledValue[];
}
export interface MeterValuesReq {
  connectorId: number;
  transactionId?: number;
  meterValue: MeterValue[];
}
export type MeterValuesConf = Record<string, never>;

export interface StopTransactionReq {
  transactionId: number;
  meterStop: number; // Wh
  timestamp: string;
  reason?: string; // 'Local' | 'Remote' | 'PowerLoss' | 'Other' | ...
  /** Dữ liệu kèm lúc dừng — sim gửi SoC cuối tại đây (measurand 'SoC'). */
  transactionData?: MeterValue[];
}
export interface StopTransactionConf {
  idTagInfo?: { status: 'Accepted' | 'Invalid' };
}

export interface RemoteStartTransactionReq {
  connectorId?: number;
  idTag: string;
}
export interface RemoteStartTransactionConf {
  status: 'Accepted' | 'Rejected';
}
export interface RemoteStopTransactionReq {
  transactionId: number;
}
export interface RemoteStopTransactionConf {
  status: 'Accepted' | 'Rejected';
}

// ---------- Transport trừu tượng (quy tắc 2) ----------

/** Một kết nối 2 chiều trụ↔CSMS. Implementation thật: WebSocket; mock: cặp trong RAM. */
export interface IChargePointTransport {
  send(data: string): void;
  onMessage(handler: (data: string) => void): void;
  onClose(handler: () => void): void;
  close(): void;
  readonly open: boolean;
}

// ---------- RPC helper dùng chung 2 phía ----------

export type OcppCallHandler = (action: string, payload: unknown) => Promise<unknown> | unknown;

let uidCounter = 0;

/**
 * Bọc transport thành RPC OCPP-J: `call()` gửi CALL và chờ CALLRESULT tương ứng;
 * `onCall()` đăng ký xử lý CALL từ phía bên kia (handler ném lỗi → CALLERROR).
 * Thuần túy, không phụ thuộc ws — test được bằng mock transport.
 */
export class OcppRpc {
  #pending = new Map<
    string,
    { resolve: (payload: unknown) => void; reject: (err: Error) => void }
  >();
  #handler: OcppCallHandler | null = null;

  constructor(
    private readonly transport: IChargePointTransport,
    private readonly callTimeoutMs = 30_000,
  ) {
    transport.onMessage((data) => void this.#onData(data));
    transport.onClose(() => {
      for (const [uid, p] of this.#pending) {
        p.reject(new Error(`Kết nối đóng khi đang chờ CALLRESULT (uid=${uid})`));
      }
      this.#pending.clear();
    });
  }

  onCall(handler: OcppCallHandler): void {
    this.#handler = handler;
  }

  async call<TConf>(action: string, payload: unknown): Promise<TConf> {
    const uid = `${Date.now()}-${++uidCounter}`;
    const frame: OcppCall = [2, uid, action, payload];
    return new Promise<TConf>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(uid);
        reject(new Error(`Hết giờ chờ CALLRESULT cho ${action} (uid=${uid})`));
      }, this.callTimeoutMs);
      this.#pending.set(uid, {
        resolve: (p) => {
          clearTimeout(timer);
          resolve(p as TConf);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
      this.transport.send(JSON.stringify(frame));
    });
  }

  async #onData(data: string): Promise<void> {
    const frame = parseOcppFrame(data);
    if (!frame) return; // frame rác — bên gọi không có uid để trả CALLERROR chuẩn
    if (frame[0] === 2) {
      const [, uid, action, payload] = frame;
      try {
        if (!this.#handler) throw new Error(`NotImplemented: chưa đăng ký onCall (${action})`);
        const result = await this.#handler(action, payload);
        this.transport.send(JSON.stringify([3, uid, result ?? {}] satisfies OcppCallResult));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.transport.send(
          JSON.stringify([4, uid, 'InternalError', message, {}] satisfies OcppCallError),
        );
      }
      return;
    }
    const uid = frame[1];
    const pending = this.#pending.get(uid);
    if (!pending) return; // CALLRESULT lạc (vd đến sau timeout) — bỏ qua
    this.#pending.delete(uid);
    if (frame[0] === 3) {
      pending.resolve(frame[2]);
    } else {
      pending.reject(new Error(`CALLERROR ${frame[2]}: ${frame[3]}`));
    }
  }
}
