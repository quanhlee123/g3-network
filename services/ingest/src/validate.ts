// F-G1 — Validate payload telemetry theo schema_version (NF-16: registry theo version,
// version mới = thêm validator mới, KHÔNG sửa validator cũ). TypeBox nhất quán D-04.
import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import type { TelemetryRecord, TelemetryStatus } from '@g3/contracts';
import { TELEMETRY_SCHEMA_VERSION } from '@g3/shared';

// Khớp TelemetryRecord v1 (@g3/contracts) + cột telematics_readings (migration 0003)
const TelemetryV1 = Type.Object(
  {
    schema_version: Type.Literal(1),
    vin: Type.String({ minLength: 1 }),
    model: Type.Union([Type.Literal('EVT-262'), Type.Literal('EVT-400'), Type.Literal('EVT-825')]),
    ts: Type.String({ minLength: 1 }),
    soc_pct: Type.Number({ minimum: 0, maximum: 100 }),
    battery_voltage_v: Type.Number(),
    battery_temp_c: Type.Number(),
    speed_kmh: Type.Number({ minimum: 0 }),
    odometer_km: Type.Number({ minimum: 0 }),
    lat: Type.Number({ minimum: -90, maximum: 90 }),
    lng: Type.Number({ minimum: -180, maximum: 180 }),
    fault_codes: Type.Array(Type.String()),
  },
  { additionalProperties: true }, // trường lạ không làm hỏng bản ghi (tương thích tiến)
);

// v2 (F-J3, migration 0021): v1 + điện áp NGUỒN NUÔI thiết bị và cường độ sóng.
// KHÔNG sửa TelemetryV1 ở trên — thiết bị chưa cập nhật firmware vẫn gửi v1 và vẫn phải nhận.
const TelemetryV2 = Type.Object(
  {
    ...TelemetryV1.properties,
    schema_version: Type.Literal(2),
    supply_voltage_v: Type.Number({ minimum: 0 }),
    // dBm luôn âm; chặn giá trị vô lý ngay ở cổng vào thay vì để rule engine đoán.
    signal_dbm: Type.Number({ minimum: -140, maximum: 0 }),
  },
  { additionalProperties: true },
);

const StatusPayload = Type.Object(
  {
    vin: Type.String({ minLength: 1 }),
    status: Type.Union([Type.Literal('online'), Type.Literal('offline')]),
    reason: Type.Union([Type.Literal('boot'), Type.Literal('graceful'), Type.Literal('lwt')]),
    ts: Type.String({ minLength: 1 }),
  },
  { additionalProperties: true },
);

type ValidateResult<T> = { ok: true; record: T } | { ok: false; reason: string };

/**
 * `ts` BẮT BUỘC có chỉ định múi giờ tường minh: `Z`, `+07:00` hoặc `-05:30`.
 *
 * VÌ SAO KHÔNG CHỈ DÙNG Date.parse: chuỗi ISO thiếu múi giờ (vd `2026-08-04T14:30:00`)
 * KHÔNG bị Date.parse coi là lỗi — nó được hiểu theo GIỜ CỦA MÁY CHẠY INGEST. Nghĩa là
 * cùng một bản tin sẽ cho hai kết quả khác nhau tuỳ nơi chạy: máy dev ở Asia/Bangkok (+07)
 * ra đúng, nhưng container Docker mặc định UTC ra lệch ĐÚNG 7 TIẾNG. Lỗi nằm im cho tới
 * lúc đổi chỗ chạy.
 *
 * Quyết định TR-03 (2026-08-04): thiết bị do phía Việt Nam chọn, giờ vận hành GMT+7.
 * Nhưng "GMT+7" phải nằm TRONG bản tin, không phải là giả định của người đọc — nên bản ghi
 * thiếu múi giờ bị đẩy vào quarantine thay vì đoán mò.
 */
const CO_MUI_GIO = /(?:[Zz]|[+-]\d{2}:?\d{2})$/;

function kiemTraTs(ts: string, phienBan: number): string | null {
  if (Number.isNaN(Date.parse(ts))) {
    return `sai_schema_v${String(phienBan)}: /ts không phải ISO 8601 ("${ts}")`;
  }
  if (!CO_MUI_GIO.test(ts.trim())) {
    return (
      `sai_schema_v${String(phienBan)}: /ts thiếu múi giờ ("${ts}") — bắt buộc kết thúc bằng ` +
      'Z hoặc +07:00. Thiếu thì giờ bị hiểu theo máy chạy ingest và lệch 7 tiếng khi ' +
      'chạy trong Docker (mặc định UTC). Xem TR-03, docs/integrations/tri-ring-tbox.md.'
    );
  }
  return null;
}

/** Registry validator theo schema_version — thêm version mới tại đây, không sửa cũ. */
const TELEMETRY_VALIDATORS: Record<number, (raw: unknown) => ValidateResult<TelemetryRecord>> = {
  1: (raw) => {
    if (!Value.Check(TelemetryV1, raw)) {
      const first = Value.Errors(TelemetryV1, raw).First();
      return { ok: false, reason: `sai_schema_v1: ${first?.path ?? '?'} ${first?.message ?? ''}` };
    }
    const record = raw as Static<typeof TelemetryV1>;
    const loiTs = kiemTraTs(record.ts, 1);
    if (loiTs) return { ok: false, reason: loiTs };
    return { ok: true, record };
  },
  2: (raw) => {
    if (!Value.Check(TelemetryV2, raw)) {
      const first = Value.Errors(TelemetryV2, raw).First();
      return { ok: false, reason: `sai_schema_v2: ${first?.path ?? '?'} ${first?.message ?? ''}` };
    }
    const record = raw as Static<typeof TelemetryV2>;
    const loiTs = kiemTraTs(record.ts, 2);
    if (loiTs) return { ok: false, reason: loiTs };
    return { ok: true, record };
  },
};

/** Đọc schema_version từ payload đã parse (nếu có) — dùng cho cả bản ghi quarantine. */
export function peekSchemaVersion(raw: unknown): number | null {
  if (typeof raw === 'object' && raw !== null && 'schema_version' in raw) {
    const v = (raw as { schema_version: unknown }).schema_version;
    if (typeof v === 'number' && Number.isInteger(v)) return v;
  }
  return null;
}

export function validateTelemetry(raw: unknown): ValidateResult<TelemetryRecord> {
  const version = peekSchemaVersion(raw);
  if (version === null) {
    return { ok: false, reason: 'thieu_schema_version' };
  }
  const validator = TELEMETRY_VALIDATORS[version];
  if (!validator) {
    return {
      ok: false,
      reason: `schema_version_khong_ho_tro: ${version} (hỗ trợ tối đa v${TELEMETRY_SCHEMA_VERSION})`,
    };
  }
  return validator(raw);
}

export function validateStatus(raw: unknown): ValidateResult<TelemetryStatus> {
  if (!Value.Check(StatusPayload, raw)) {
    const first = Value.Errors(StatusPayload, raw).First();
    return { ok: false, reason: `sai_status: ${first?.path ?? '?'} ${first?.message ?? ''}` };
  }
  return { ok: true, record: raw as Static<typeof StatusPayload> };
}
