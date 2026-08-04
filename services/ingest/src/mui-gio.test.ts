// F-G1 · TR-03 — Test bắt buộc `ts` có múi giờ tường minh.
//
// Quyết định 2026-08-04: T-BOX do phía Việt Nam chọn, vận hành theo GMT+7. Nhưng "GMT+7"
// phải nằm TRONG bản tin. Chuỗi ISO thiếu múi giờ được Date.parse hiểu theo giờ MÁY CHẠY
// ingest — cùng bản tin cho hai kết quả khác nhau tuỳ nơi chạy.
import { describe, expect, it } from 'vitest';
import { validateTelemetry } from './validate';

/** Bản ghi v1 hợp lệ, chỉ thay mỗi trường ts. */
function banGhi(ts: string): Record<string, unknown> {
  return {
    schema_version: 1,
    vin: 'G3-SIM-VIN-0001',
    model: 'EVT-262',
    ts,
    soc_pct: 80,
    battery_voltage_v: 540,
    battery_temp_c: 30,
    speed_kmh: 60,
    odometer_km: 12345,
    lat: 10.8,
    lng: 106.7,
    fault_codes: [],
  };
}

describe('TR-03 — múi giờ trong ts', () => {
  it('chấp nhận UTC (Z)', () => {
    const kq = validateTelemetry(banGhi('2026-08-04T07:30:00Z'));
    expect(kq.ok).toBe(true);
  });

  it('chấp nhận giờ Việt Nam có offset tường minh (+07:00)', () => {
    // Đây là dạng mà thiết bị vận hành theo GMT+7 nên gửi.
    const kq = validateTelemetry(banGhi('2026-08-04T14:30:00+07:00'));
    expect(kq.ok).toBe(true);
    // Và phải quy về đúng mốc UTC tương ứng, không lệch.
    const rec = kq.ok ? kq.record : null;
    expect(new Date(rec!.ts).toISOString()).toBe('2026-08-04T07:30:00.000Z');
  });

  it('chấp nhận offset không có dấu hai chấm (+0700)', () => {
    expect(validateTelemetry(banGhi('2026-08-04T14:30:00+0700')).ok).toBe(true);
  });

  it('KỊCH BẢN NGUY HIỂM — ts THIẾU múi giờ bị từ chối, không đoán mò', () => {
    // Date.parse KHÔNG coi chuỗi này là lỗi: nó hiểu theo giờ máy chạy ingest.
    // Máy dev Asia/Bangkok ra đúng, container Docker (UTC) lệch đúng 7 tiếng.
    const kq = validateTelemetry(banGhi('2026-08-04T14:30:00'));
    expect(kq.ok).toBe(false);
    const reason = kq.ok ? '' : kq.reason;
    expect(reason).toContain('thiếu múi giờ');
    // Thông báo phải chỉ đúng chỗ sửa, không chỉ nói "sai".
    expect(reason).toContain('+07:00');
  });

  it('chuỗi thiếu múi giờ VẪN parse được — chứng minh vì sao không thể chỉ dựa Date.parse', () => {
    // Nếu chỉ kiểm tra Number.isNaN(Date.parse(ts)) thì ca trên LỌT.
    expect(Number.isNaN(Date.parse('2026-08-04T14:30:00'))).toBe(false);
  });

  it('KỊCH BẢN XẤU — ts rác vẫn bị từ chối như cũ', () => {
    const kq = validateTelemetry(banGhi('hom qua'));
    expect(kq.ok).toBe(false);
    expect(kq.ok ? '' : kq.reason).toContain('ISO 8601');
  });
});
