import { describe, expect, it } from 'vitest';
import { TELEMETRY_SCHEMA_VERSION, UNITS, formatVnd } from './index';

describe('@g3/shared', () => {
  // NF-16: đổi schema = migration mới + TĂNG số này, không sửa migration cũ.
  // v1 (0003) → v2 (0021, F-J3: thêm supply_voltage_v + signal_dbm).
  it('schema_version telematics hiện tại là 2 (NF-16)', () => {
    expect(TELEMETRY_SCHEMA_VERSION).toBe(2);
  });

  it('đơn vị chuẩn là VNĐ / km / kWh (NF-17)', () => {
    expect(UNITS).toEqual({ currency: 'VNĐ', distance: 'km', energy: 'kWh' });
  });

  it('formatVnd định dạng theo chuẩn Việt Nam', () => {
    expect(formatVnd(1500000)).toBe('1.500.000 VNĐ');
    expect(formatVnd(0)).toBe('0 VNĐ');
  });
});
