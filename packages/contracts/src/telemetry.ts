// F-A1 — Hợp đồng telemetry xe–pin: kiểu bản ghi, topic MQTT và interface publisher.
// QUY TẮC 2 (CLAUDE.md): logic nghiệp vụ và simulator chỉ dùng interface này;
// implementation MQTT thật nằm ở simulators/vehicle-sim (package contracts không có
// dependency ngoài). Ingest (Prompt 05) import cùng type + topic từ đây.
import type { VehicleModel } from '@g3/shared';

/** Tiền tố topic telemetry — bản ghi đầy đủ, 1 topic/xe: g3/telemetry/{vin}. */
export const TELEMETRY_TOPIC_PREFIX = 'g3/telemetry/';
/** Tiền tố topic trạng thái online/offline (retained + LWT, phục vụ F-J3): g3/status/{vin}. */
export const STATUS_TOPIC_PREFIX = 'g3/status/';

/** VIN dùng làm segment topic MQTT nên cấm ký tự đặc biệt của MQTT và khoảng trắng. */
function assertVinForTopic(vin: string): void {
  if (vin === '' || /[/+#\s]/.test(vin)) {
    throw new Error(
      `VIN không hợp lệ cho topic MQTT: "${vin}" (cấm rỗng, '/', '+', '#', khoảng trắng)`,
    );
  }
}

/** Topic telemetry của một xe: g3/telemetry/{vin}. */
export function telemetryTopic(vin: string): string {
  assertVinForTopic(vin);
  return `${TELEMETRY_TOPIC_PREFIX}${vin}`;
}

/** Topic trạng thái của một xe: g3/status/{vin}. */
export function statusTopic(vin: string): string {
  assertVinForTopic(vin);
  return `${STATUS_TOPIC_PREFIX}${vin}`;
}

/**
 * Bản ghi telemetry một xe gửi lên mỗi chu kỳ (~10s).
 * QUAN TRỌNG (NF-09): `ts` là GIỜ THIẾT BỊ lúc sinh bản ghi (ISO 8601 UTC),
 * KHÔNG phải giờ broker/ingest nhận — dữ liệu bù sau mất sóng giữ nguyên ts gốc.
 * Các trường số khớp cột bảng telematics_readings (migration 0003).
 */
export interface TelemetryRecord {
  /** = TELEMETRY_SCHEMA_VERSION của @g3/shared (NF-16 — schema có version từ ngày 1). */
  schema_version: number;
  /** VIN GIẢ 100% ở Phase 1 (quy tắc 12), ví dụ G3-SIM-0001. */
  vin: string;
  model: VehicleModel;
  /**
   * Giờ THIẾT BỊ sinh bản ghi, ISO 8601 **BẮT BUỘC có múi giờ tường minh**:
   * `2026-08-04T07:30:00Z` hoặc `2026-08-04T14:30:00+07:00`.
   *
   * KHÔNG được gửi dạng thiếu múi giờ (`2026-08-04T14:30:00`): `Date.parse` không coi đó
   * là lỗi mà hiểu theo giờ MÁY CHẠY ingest — container Docker mặc định UTC sẽ lệch đúng
   * 7 tiếng so với máy dev ở +07. Ingest từ chối bản ghi thiếu múi giờ (TR-03).
   *
   * Quy ước vận hành là GMT+7 (Việt Nam, không có giờ mùa hè), nhưng LƯU TRỮ vẫn quy về
   * UTC qua `timestamptz`. Xem docs/integrations/tri-ring-tbox.md §3.2.
   */
  ts: string;
  soc_pct: number;
  battery_voltage_v: number;
  battery_temp_c: number;
  speed_kmh: number;
  odometer_km: number;
  lat: number;
  lng: number;
  /** Mã lỗi BMS/motor đang hoạt động, ví dụ ["P0A80"]; rỗng nếu bình thường. */
  fault_codes: string[];

  // --- Thêm ở schema v2 (F-J3, migration 0021). Tuỳ chọn vì bản ghi v1 không có. ---

  /**
   * Điện áp NGUỒN NUÔI hộp telematics (V) — acquy phụ 12V/24V, KHÔNG phải
   * `battery_voltage_v` (điện áp pack kéo xe). Đây là trường cho biết thiết bị còn
   * được cấp điện hay không: pack pin đầy mà dây nguồn hộp bị rút thì chỉ trường này thấy.
   */
  supply_voltage_v?: number;
  /**
   * Cường độ sóng di động (dBm, luôn âm): -60 khoẻ · -100 yếu · -113 gần như mất sóng.
   * Dùng để phân biệt "mất sóng" (yếu dần rồi im) với "mất nguồn" (đang khoẻ thì im bặt).
   */
  signal_dbm?: number;
}

/** Payload đăng trên g3/status/{vin} (retained): trạng thái kết nối của thiết bị. */
export interface TelemetryStatus {
  vin: string;
  status: 'online' | 'offline';
  /** 'lwt' = broker phát hộ khi mất nguồn đột ngột (F-J3); 'graceful' = tự tắt sạch. */
  reason: 'boot' | 'graceful' | 'lwt';
  ts: string;
}

/** Last Will and Testament — broker tự phát khi client rớt KHÔNG gửi DISCONNECT (F-J3). */
export interface TelemetryWill {
  topic: string;
  payload: string;
  retain: boolean;
}

/**
 * Cổng xuất telemetry của thiết bị. `disconnect()` là tắt sạch (có "goodbye");
 * `destroy()` cắt kết nối đột ngột KHÔNG báo trước — mô phỏng mất nguồn/tháo thiết bị
 * (F-J3: hệ thống phải phân biệt được 2 kiểu này).
 */
export interface TelemetryPublisher {
  connect(): Promise<void>;
  publish(topic: string, payload: string, opts?: { retain?: boolean }): Promise<void>;
  disconnect(): Promise<void>;
  destroy(): void;
  readonly connected: boolean;
}
