// F-G2 — Phiên làm việc CSMS ↔ 1 trạm sạc (OCPP 1.6J). Logic thuần trên
// IChargePointTransport + OcppRpc (@g3/contracts, quy tắc 2) — test bằng mock, không cần ws.
// - StatusNotification → connectors.status (F-C2, NF-02 ≤30s)
// - StartTransaction/MeterValues → ocpp_transactions (bảng mutable, ADR-005)
// - StopTransaction → ĐÚNG 1 dòng charging_sessions (F-B2, append-only NF-11;
//   UNIQUE ocpp_transaction_id chặn Stop gửi trùng khi trụ retry sau mất kết nối)
// - RemoteStart/RemoteStop → chuẩn bị luồng thanh toán QR F-H1
import {
  OcppRpc,
  type BootNotificationConf,
  type BootNotificationReq,
  type ConnectorOcppStatus,
  type HeartbeatConf,
  type IChargePointTransport,
  type MeterValue,
  type MeterValuesReq,
  type RemoteStartTransactionConf,
  type RemoteStopTransactionConf,
  type StartTransactionConf,
  type StartTransactionReq,
  type StatusNotificationReq,
  type StopTransactionConf,
  type StopTransactionReq,
} from '@g3/contracts';
import type { CsmsMetrics } from './metrics';

/** Nhận Pool hoặc Client của pg — test truyền Client vào thẳng. */
export interface Queryable {
  query(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
}

export interface CsmsSessionOptions {
  /** Giây giữa 2 Heartbeat trả cho trụ trong BootNotification (mặc định 30 — NF-02). */
  heartbeatIntervalS?: number;
  clock?: () => number;
  log?: (msg: string) => void;
  /** NF-14: không truyền = không đo (test cũ và demo in-process không cần metric). */
  metrics?: CsmsMetrics;
}

/**
 * Trạng thái OCPP → enum connector_status của DB (migration 0002 chỉ có 4 giá trị).
 * Các trạng thái trung gian (Preparing, Finishing, SuspendedEV/EVSE, Reserved) quy về nhóm gần nhất
 * — đủ cho F-C2 Phase 1; mở rộng enum khi cần phân biệt tinh hơn (migration mới).
 */
export function mapOcppStatus(
  status: ConnectorOcppStatus,
): 'Available' | 'Charging' | 'Faulted' | 'Unavailable' {
  switch (status) {
    case 'Faulted':
      return 'Faulted';
    case 'Unavailable':
      return 'Unavailable';
    case 'Charging':
    case 'SuspendedEV':
    case 'SuspendedEVSE':
    case 'Finishing':
      return 'Charging';
    default: // Available, Preparing, Reserved
      return 'Available';
  }
}

export class CsmsStationSession {
  readonly rpc: OcppRpc;
  #log: (msg: string) => void;
  #clock: () => number;
  #heartbeatIntervalS: number;
  #metrics: CsmsMetrics | undefined;

  constructor(
    transport: IChargePointTransport,
    private readonly db: Queryable,
    readonly stationCode: string,
    private readonly stationId: string,
    opts: CsmsSessionOptions = {},
  ) {
    this.#clock = opts.clock ?? (() => Date.now());
    this.#heartbeatIntervalS = opts.heartbeatIntervalS ?? 30;
    this.#log = opts.log ?? ((m) => console.log(m));
    this.#metrics = opts.metrics;
    this.rpc = new OcppRpc(transport);
    this.rpc.onCall((action, payload) => this.#dispatch(action, payload));
    transport.onClose(() => void this.#onDisconnect());
  }

  /** Tra station theo mã OCPP identity (charging_stations.code); null nếu không tồn tại. */
  static async resolveStationId(db: Queryable, stationCode: string): Promise<string | null> {
    const res = await db.query(`SELECT id FROM charging_stations WHERE code = $1`, [stationCode]);
    return (res.rows[0]?.id as string | undefined) ?? null;
  }

  async #dispatch(action: string, payload: unknown): Promise<unknown> {
    // NF-14: đếm CẢ bản tin lỗi. Trụ gửi action lạ hoặc DB từ chối là tín hiệu vận hành,
    // và nếu chỉ đếm đường thành công thì "CSMS im lặng vì hỏng" trông y hệt "không có trụ".
    try {
      const ket_qua = await this.#dispatchAction(action, payload);
      this.#metrics?.countMessage(action, 'ok');
      return ket_qua;
    } catch (err) {
      this.#metrics?.countMessage(action, 'loi');
      throw err;
    }
  }

  async #dispatchAction(action: string, payload: unknown): Promise<unknown> {
    switch (action) {
      case 'BootNotification':
        return this.#onBoot(payload as BootNotificationReq);
      case 'Heartbeat':
        return { currentTime: this.#now() } satisfies HeartbeatConf;
      case 'StatusNotification':
        return this.#onStatus(payload as StatusNotificationReq);
      case 'StartTransaction':
        return this.#onStart(payload as StartTransactionReq);
      case 'MeterValues':
        return this.#onMeterValues(payload as MeterValuesReq);
      case 'StopTransaction':
        return this.#onStop(payload as StopTransactionReq);
      default:
        throw new Error(`NotImplemented: ${action}`);
    }
  }

  #now(): string {
    return new Date(this.#clock()).toISOString();
  }

  #onBoot(req: BootNotificationReq): BootNotificationConf {
    this.#log(
      `[csms] ${this.stationCode}: BootNotification ${req.chargePointVendor}/${req.chargePointModel}`,
    );
    return { status: 'Accepted', currentTime: this.#now(), interval: this.#heartbeatIntervalS };
  }

  /** F-C2/NF-02: trạng thái trụ phản ánh vào DB ngay khi nhận — không hàng đợi trung gian. */
  async #onStatus(req: StatusNotificationReq): Promise<Record<string, never>> {
    if (req.connectorId >= 1) {
      await this.db.query(
        `UPDATE connectors SET status = $1, updated_at = now()
         WHERE station_id = $2 AND ocpp_connector_id = $3`,
        [mapOcppStatus(req.status), this.stationId, req.connectorId],
      );
      // Đo SAU khi ghi DB xong: NF-02 nói về lúc trạng thái NHÌN THẤY ĐƯỢC trong hệ,
      // không phải lúc gói tin chạm vào tiến trình CSMS.
      this.#metrics?.observeStatusLag(req.timestamp);
      this.#log(`[csms] ${this.stationCode}: connector ${req.connectorId} → ${req.status}`);
    }
    return {};
  }

  async #onStart(req: StartTransactionReq): Promise<StartTransactionConf> {
    // Phase 1 (simulator): idTag = VIN xe GIẢ (ADR-005). idTag lạ → Invalid, không mở phiên
    // (dữ liệu phiên sạc phục vụ bảo hành — không nhận xe vô danh).
    const vehicle = await this.db.query(`SELECT id FROM vehicles WHERE vin = $1`, [req.idTag]);
    const vehicleId = vehicle.rows[0]?.id as string | undefined;
    if (!vehicleId) {
      this.#log(`[csms] ${this.stationCode}: idTag lạ "${req.idTag}" — từ chối StartTransaction`);
      return { transactionId: -1, idTagInfo: { status: 'Invalid' } };
    }
    const connector = await this.db.query(
      `SELECT id FROM connectors WHERE station_id = $1 AND ocpp_connector_id = $2`,
      [this.stationId, req.connectorId],
    );
    const connectorId = connector.rows[0]?.id as string | undefined;
    if (!connectorId) {
      throw new Error(`Trạm ${this.stationCode} không có connector ${req.connectorId}`);
    }
    const tx = await this.db.query(
      `INSERT INTO ocpp_transactions
         (station_id, connector_id, vehicle_id, id_tag, meter_start_wh, started_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING transaction_id`,
      [this.stationId, connectorId, vehicleId, req.idTag, req.meterStart, req.timestamp],
    );
    const transactionId = tx.rows[0]!.transaction_id as number;
    this.#log(
      `[csms] ${this.stationCode}: StartTransaction #${transactionId} (idTag ${req.idTag})`,
    );
    return { transactionId, idTagInfo: { status: 'Accepted' } };
  }

  async #onMeterValues(req: MeterValuesReq): Promise<Record<string, never>> {
    if (req.transactionId === undefined) return {};
    const sampled = extractSampled(req.meterValue);
    await this.db.query(
      `UPDATE ocpp_transactions SET
         last_meter_wh = COALESCE($2, last_meter_wh),
         soc_start_pct = COALESCE(soc_start_pct, $3),
         last_soc_pct  = COALESCE($3, last_soc_pct),
         max_power_kw  = GREATEST(COALESCE(max_power_kw, 0), COALESCE($4, 0))
       WHERE transaction_id = $1 AND status = 'open'`,
      [req.transactionId, sampled.meterWh, sampled.socPct, sampled.powerKw],
    );
    return {};
  }

  /**
   * F-B2: ghi ĐÚNG 1 dòng charging_sessions. Trụ mất kết nối giữa phiên rồi gửi Stop bù
   * (kể cả 2 lần) vẫn ra 1 dòng: UNIQUE (ocpp_transaction_id) + ON CONFLICT DO NOTHING.
   */
  async #onStop(req: StopTransactionReq): Promise<StopTransactionConf> {
    const txRes = await this.db.query(`SELECT * FROM ocpp_transactions WHERE transaction_id = $1`, [
      req.transactionId,
    ]);
    const tx = txRes.rows[0];
    if (!tx) {
      this.#log(`[csms] ${this.stationCode}: StopTransaction #${req.transactionId} không tồn tại`);
      return { idTagInfo: { status: 'Invalid' } };
    }
    const meterStartWh = tx.meter_start_wh as number;
    const energyKwh = Math.max(0, (req.meterStop - meterStartWh) / 1000);
    const socEnd =
      extractSampled(req.transactionData ?? []).socPct ??
      (tx.last_soc_pct === null ? null : Number(tx.last_soc_pct));
    const startedAtMs = new Date(tx.started_at as string).getTime();
    const durationH = (Date.parse(req.timestamp) - startedAtMs) / 3_600_000;
    // Phiên ngắn bất thường (trụ báo giờ lệch) cho avg vô nghĩa/tràn numeric(8,2) → bỏ trống
    const rawAvg = durationH > 0 ? energyKwh / durationH : null;
    const avgPowerKw =
      rawAvg !== null && Number.isFinite(rawAvg) && rawAvg < 100_000 ? rawAvg : null;

    await this.db.query(
      `INSERT INTO charging_sessions
         (vehicle_id, station_id, connector_id, ocpp_transaction_id, started_at, ended_at,
          energy_kwh, soc_start_pct, soc_end_pct, avg_power_kw, max_power_kw)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (ocpp_transaction_id) DO NOTHING`,
      [
        tx.vehicle_id,
        tx.station_id,
        tx.connector_id,
        String(req.transactionId),
        tx.started_at,
        req.timestamp,
        energyKwh,
        tx.soc_start_pct,
        socEnd,
        avgPowerKw,
        tx.max_power_kw,
      ],
    );
    await this.db.query(
      `UPDATE ocpp_transactions
       SET status = 'closed', closed_at = now(), last_meter_wh = $2
       WHERE transaction_id = $1 AND status = 'open'`,
      [req.transactionId, req.meterStop],
    );
    this.#log(
      `[csms] ${this.stationCode}: StopTransaction #${req.transactionId} — ${energyKwh.toFixed(3)} kWh` +
        (req.reason ? ` (reason ${req.reason})` : ''),
    );
    return { idTagInfo: { status: 'Accepted' } };
  }

  /** F-H1 (chuẩn bị): CSMS chủ động yêu cầu trụ mở phiên — luồng thanh toán QR gọi hàm này. */
  async remoteStart(connectorId: number, idTag: string): Promise<'Accepted' | 'Rejected'> {
    const conf = await this.rpc.call<RemoteStartTransactionConf>('RemoteStartTransaction', {
      connectorId,
      idTag,
    });
    return conf.status;
  }

  async remoteStop(transactionId: number): Promise<'Accepted' | 'Rejected'> {
    const conf = await this.rpc.call<RemoteStopTransactionConf>('RemoteStopTransaction', {
      transactionId,
    });
    return conf.status;
  }

  /**
   * Trụ rớt kết nối: không còn tin được trạng thái súng → 'Unavailable' (trừ súng đang
   * Faulted — lỗi phần cứng vẫn là lỗi). Phiên đang 'open' GIỮ NGUYÊN: trụ sẽ gửi
   * StopTransaction bù khi nối lại (test bắt buộc Prompt 05).
   */
  async #onDisconnect(): Promise<void> {
    try {
      await this.db.query(
        `UPDATE connectors SET status = 'Unavailable', updated_at = now()
         WHERE station_id = $1 AND status <> 'Faulted'`,
        [this.stationId],
      );
      this.#log(`[csms] ${this.stationCode}: mất kết nối — connectors → Unavailable`);
    } catch (err) {
      this.#log(`[csms] ${this.stationCode}: lỗi cập nhật khi mất kết nối: ${String(err)}`);
    }
  }
}

/** Rút Energy(Wh)/SoC(%)/Power(kW) từ danh sách MeterValue theo measurand OCPP 1.6. */
function extractSampled(meterValues: MeterValue[]): {
  meterWh: number | null;
  socPct: number | null;
  powerKw: number | null;
} {
  let meterWh: number | null = null;
  let socPct: number | null = null;
  let powerKw: number | null = null;
  for (const mv of meterValues) {
    for (const s of mv.sampledValue) {
      const value = Number(s.value);
      if (Number.isNaN(value)) continue;
      const measurand = s.measurand ?? 'Energy.Active.Import.Register'; // mặc định theo spec
      if (measurand === 'Energy.Active.Import.Register') {
        meterWh = s.unit === 'kWh' ? value * 1000 : value;
      } else if (measurand === 'SoC') {
        socPct = value;
      } else if (measurand === 'Power.Active.Import') {
        powerKw = s.unit === 'kW' ? value : value / 1000; // mặc định W theo spec
      }
    }
  }
  return { meterWh, socPct, powerKw };
}
