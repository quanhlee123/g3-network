// F-G1 — Test validator schema_version (NF-16): đúng v1, sai trường, version lạ.
import { describe, expect, it } from 'vitest';
import { peekSchemaVersion, validateStatus, validateTelemetry } from './validate';

const validRecord = {
  schema_version: 1,
  vin: 'G3-SIM-VIN-0001',
  model: 'EVT-262',
  ts: '2026-07-28T03:00:00.000Z',
  soc_pct: 55.5,
  battery_voltage_v: 640.2,
  battery_temp_c: 31.5,
  speed_kmh: 42,
  odometer_km: 1234.5,
  lat: 10.85,
  lng: 106.75,
  fault_codes: [],
};

describe('validateTelemetry', () => {
  it('chấp nhận bản ghi v1 hợp lệ (kể cả trường lạ — tương thích tiến)', () => {
    expect(validateTelemetry(validRecord).ok).toBe(true);
    expect(validateTelemetry({ ...validRecord, truong_moi: 1 }).ok).toBe(true);
  });

  it('từ chối khi thiếu trường bắt buộc, nêu rõ lý do', () => {
    const thieuSoc: Record<string, unknown> = { ...validRecord };
    delete thieuSoc.soc_pct;
    const result = validateTelemetry(thieuSoc);
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.reason).toContain('soc_pct');
  });

  it('từ chối SOC ngoài 0–100 và ts không phải ISO 8601', () => {
    expect(validateTelemetry({ ...validRecord, soc_pct: 101 }).ok).toBe(false);
    expect(validateTelemetry({ ...validRecord, ts: 'hom-qua' }).ok).toBe(false);
  });

  it('kịch bản xấu: schema_version lạ / thiếu → từ chối kèm lý do rõ', () => {
    const v99 = validateTelemetry({ ...validRecord, schema_version: 99 });
    expect(v99).toMatchObject({ ok: false });
    if (!v99.ok) expect(v99.reason).toContain('schema_version_khong_ho_tro');

    const khongCo = validateTelemetry({ vin: 'x' });
    expect(khongCo).toMatchObject({ ok: false, reason: 'thieu_schema_version' });
  });
});

describe('validateStatus + peekSchemaVersion', () => {
  it('chấp nhận status online/offline đúng dạng, từ chối reason lạ', () => {
    const ok = validateStatus({
      vin: 'G3-SIM-VIN-0001',
      status: 'offline',
      reason: 'lwt',
      ts: '2026-07-28T03:00:00Z',
    });
    expect(ok.ok).toBe(true);
    expect(validateStatus({ vin: 'x', status: 'offline', reason: 'chay-pin', ts: 'x' }).ok).toBe(
      false,
    );
  });

  it('peekSchemaVersion đọc được version từ payload hỏng một phần', () => {
    expect(peekSchemaVersion({ schema_version: 7, rac: true })).toBe(7);
    expect(peekSchemaVersion({ schema_version: '7' })).toBeNull();
    expect(peekSchemaVersion('khong-phai-object')).toBeNull();
  });
});
