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

/** Registry validator theo schema_version — thêm version mới tại đây, không sửa cũ. */
const TELEMETRY_VALIDATORS: Record<number, (raw: unknown) => ValidateResult<TelemetryRecord>> = {
  1: (raw) => {
    if (!Value.Check(TelemetryV1, raw)) {
      const first = Value.Errors(TelemetryV1, raw).First();
      return { ok: false, reason: `sai_schema_v1: ${first?.path ?? '?'} ${first?.message ?? ''}` };
    }
    const record = raw as Static<typeof TelemetryV1>;
    if (Number.isNaN(Date.parse(record.ts))) {
      return { ok: false, reason: `sai_schema_v1: /ts không phải ISO 8601 ("${record.ts}")` };
    }
    return { ok: true, record };
  },
  2: (raw) => {
    if (!Value.Check(TelemetryV2, raw)) {
      const first = Value.Errors(TelemetryV2, raw).First();
      return { ok: false, reason: `sai_schema_v2: ${first?.path ?? '?'} ${first?.message ?? ''}` };
    }
    const record = raw as Static<typeof TelemetryV2>;
    if (Number.isNaN(Date.parse(record.ts))) {
      return { ok: false, reason: `sai_schema_v2: /ts không phải ISO 8601 ("${record.ts}")` };
    }
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
