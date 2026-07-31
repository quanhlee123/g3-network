// F-G1 — Pipeline ingest: bản tin thô → validate theo schema_version → telematics_readings.
// Nguyên tắc: KHÔNG drop lặng lẽ (sai schema/VIN lạ → telemetry_quarantine + alert
// 'data_quality'); dữ liệu gửi bù/trùng đi qua ON CONFLICT DO NOTHING (NF-09);
// time ghi DB = ts THIẾT BỊ; last_seen thiết bị cập nhật phục vụ F-J1.
import {
  STATUS_TOPIC_PREFIX,
  TELEMETRY_TOPIC_PREFIX,
  type INotifier,
  type TelematicsEnvelope,
  type TelemetryStatus,
} from '@g3/contracts';
import { AnomalyEvaluator } from './anomaly';
import { BatteryAlertEvaluator } from './battery-alerts';
import { GeofenceEvaluator } from './geofence';
import type { IngestMetrics } from './metrics';
import { peekSchemaVersion, validateStatus, validateTelemetry } from './validate';

/** Nhận Pool hoặc Client của pg — test truyền Client vào thẳng. */
export interface Queryable {
  query(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
}

interface VehicleRef {
  vehicleId: string;
  deviceId: string | null;
}

export class IngestPipeline {
  #vinCache = new Map<string, VehicleRef>();
  #canhBaoPin: BatteryAlertEvaluator;
  #batThuong: AnomalyEvaluator;
  #geofence: GeofenceEvaluator;

  constructor(
    private readonly db: Queryable,
    private readonly metrics: IngestMetrics,
    private readonly clock: () => number = () => Date.now(),
    log: (msg: string) => void = () => {
      /* mặc định im lặng — index.ts truyền console.log vào */
    },
    /** F-F3: cổng thông báo. Không truyền = chỉ ghi bảng alerts, không báo cho người. */
    notifier?: INotifier,
  ) {
    this.#canhBaoPin = new BatteryAlertEvaluator(db, log, notifier);
    this.#batThuong = new AnomalyEvaluator(db, log, notifier);
    this.#geofence = new GeofenceEvaluator(db, log, notifier);
  }

  async handle(msg: TelematicsEnvelope): Promise<void> {
    if (msg.topic.startsWith(TELEMETRY_TOPIC_PREFIX)) {
      await this.#handleTelemetry(msg);
    } else if (msg.topic.startsWith(STATUS_TOPIC_PREFIX)) {
      await this.#handleStatus(msg);
    } else {
      await this.#quarantine(msg, 'topic_khong_nhan_dang', null);
    }
  }

  async #handleTelemetry(msg: TelematicsEnvelope): Promise<void> {
    const raw = parseJson(msg.payload);
    if (raw === PARSE_FAILED) {
      await this.#quarantine(msg, 'json_khong_hop_le', null);
      return;
    }
    const result = validateTelemetry(raw);
    if (!result.ok) {
      await this.#quarantine(msg, result.reason, peekSchemaVersion(raw));
      return;
    }
    const record = result.record;
    const topicVin = msg.topic.slice(TELEMETRY_TOPIC_PREFIX.length);
    if (topicVin !== record.vin) {
      await this.#quarantine(msg, `vin_khong_khop_topic: "${topicVin}" vs "${record.vin}"`, 1);
      return;
    }
    const ref = await this.#resolveVin(record.vin);
    if (!ref) {
      await this.#quarantine(msg, `vin_khong_ton_tai: ${record.vin}`, record.schema_version);
      return;
    }

    const inserted = await this.db.query(
      `INSERT INTO telematics_readings
         (time, vehicle_id, device_id, schema_version, soc_pct, battery_voltage_v,
          battery_temp_c, speed_kmh, odometer_km, position, fault_codes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
               ST_SetSRID(ST_MakePoint($10, $11), 4326)::geography, $12)
       ON CONFLICT DO NOTHING`,
      [
        record.ts, // time = giờ THIẾT BỊ (NF-09), không phải giờ nhận
        ref.vehicleId,
        ref.deviceId,
        record.schema_version,
        record.soc_pct,
        record.battery_voltage_v,
        record.battery_temp_c,
        record.speed_kmh,
        record.odometer_km,
        record.lng,
        record.lat,
        JSON.stringify(record.fault_codes),
      ],
    );

    if ((inserted.rowCount ?? 0) === 0) {
      this.metrics.count('duplicate'); // bản ghi gửi bù đã có (NF-09) — không phải lỗi
    } else {
      this.metrics.count('valid');
      this.metrics.observeLag((this.clock() - Date.parse(record.ts)) / 1000);
      // F-A2: đánh giá ngưỡng pin NGAY trên dòng dữ liệu mới (không chờ job quét).
      // Chỉ chạy với bản ghi mới: dữ liệu gửi bù sau mất sóng không bắn lại cảnh báo cũ.
      await this.#canhBaoPin.danhGia(
        ref.vehicleId,
        record.soc_pct,
        { lat: record.lat, lng: record.lng },
        record.ts,
      );
      // F-A4: rule engine bất thường chạy trên cùng dòng dữ liệu — snapshot đọc từ
      // telematics_readings nên PHẢI gọi SAU khi bản ghi hiện tại đã được ghi vào bảng.
      await this.#batThuong.danhGia(
        ref.vehicleId,
        {
          battery_temp_c: record.battery_temp_c,
          battery_voltage_v: record.battery_voltage_v,
          fault_codes: record.fault_codes,
        },
        record.ts,
      );
      // F-A5: ra/vào vùng geofence — cũng chạy trên chính dòng dữ liệu này.
      await this.#geofence.danhGia(ref.vehicleId, { lat: record.lat, lng: record.lng }, record.ts);
    }
    await this.#touchDevice(ref, msg.receivedAtMs);
  }

  async #handleStatus(msg: TelematicsEnvelope): Promise<void> {
    const raw = parseJson(msg.payload);
    if (raw === PARSE_FAILED) {
      await this.#quarantine(msg, 'json_khong_hop_le', null);
      return;
    }
    const result = validateStatus(raw);
    if (!result.ok) {
      await this.#quarantine(msg, result.reason, null);
      return;
    }
    const status: TelemetryStatus = result.record;
    const ref = await this.#resolveVin(status.vin);
    if (!ref?.deviceId) {
      await this.#quarantine(msg, `vin_khong_ton_tai: ${status.vin}`, null);
      return;
    }
    if (status.reason === 'lwt') {
      // F-J3: broker phát LWT = mất nguồn/mất kết nối đột ngột — KHÔNG đụng last_seen_at
      // (thiết bị không hề liên lạc), đánh dấu nguồn 'lost' cho F-J1 phân biệt.
      await this.db.query(`UPDATE devices SET power_status = 'lost' WHERE id = $1`, [ref.deviceId]);
      return;
    }
    await this.db.query(
      `UPDATE devices SET power_status = 'normal', last_seen_at = to_timestamp($2 / 1000.0)
       WHERE id = $1`,
      [ref.deviceId, msg.receivedAtMs],
    );
  }

  /** Ghi bảng cách ly + alert data_quality (dedup 1 alert/giờ để không spam NF-14). */
  async #quarantine(
    msg: TelematicsEnvelope,
    reason: string,
    schemaVersion: number | null,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO telemetry_quarantine (received_at, topic, raw_payload, schema_version, reason)
       VALUES (to_timestamp($1 / 1000.0), $2, $3, $4, $5)`,
      [msg.receivedAtMs, msg.topic, msg.payload, schemaVersion, reason],
    );
    const hour = new Date(msg.receivedAtMs).toISOString().slice(0, 13);
    const dedupKey = `F-G1:data_quality:${hour}`;
    await this.db.query(
      `INSERT INTO alerts (type, severity, dedup_key, payload)
       SELECT 'data_quality', 2, $1, $2
       WHERE NOT EXISTS (SELECT 1 FROM alerts WHERE dedup_key = $1)`,
      [dedupKey, JSON.stringify({ topic: msg.topic, reason })],
    );
    this.metrics.count('quarantine');
  }

  async #resolveVin(vin: string): Promise<VehicleRef | null> {
    const cached = this.#vinCache.get(vin);
    if (cached) return cached;
    const res = await this.db.query(
      `SELECT v.id AS vehicle_id, d.id AS device_id
       FROM vehicles v LEFT JOIN devices d ON d.vehicle_id = v.id
       WHERE v.vin = $1`,
      [vin],
    );
    const row = res.rows[0];
    if (!row) return null; // không cache kết quả âm — xe có thể được provisioning sau (F-F2)
    const ref: VehicleRef = {
      vehicleId: row.vehicle_id as string,
      deviceId: (row.device_id as string | null) ?? null,
    };
    this.#vinCache.set(vin, ref);
    return ref;
  }

  /** F-J1: thiết bị vừa liên lạc — cập nhật last_seen_at = giờ nhận bản tin. */
  async #touchDevice(ref: VehicleRef, receivedAtMs: number): Promise<void> {
    if (!ref.deviceId) return;
    await this.db.query(
      `UPDATE devices SET last_seen_at = GREATEST(coalesce(last_seen_at, '-infinity'), to_timestamp($2 / 1000.0))
       WHERE id = $1`,
      [ref.deviceId, receivedAtMs],
    );
  }
}

const PARSE_FAILED = Symbol('parse-failed');

function parseJson(payload: string): unknown | typeof PARSE_FAILED {
  try {
    return JSON.parse(payload);
  } catch {
    return PARSE_FAILED;
  }
}
