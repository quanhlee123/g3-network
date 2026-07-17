import { describe, expect, it } from 'vitest';
import { TELEMETRY_SCHEMA_VERSION, UNITS, formatVnd } from './index';

describe('@g3/shared', () => {
  it('schema_version telematics khởi điểm là 1 (NF-16)', () => {
    expect(TELEMETRY_SCHEMA_VERSION).toBe(1);
  });

  it('đơn vị chuẩn là VNĐ / km / kWh (NF-17)', () => {
    expect(UNITS).toEqual({ currency: 'VNĐ', distance: 'km', energy: 'kWh' });
  });

  it('formatVnd định dạng theo chuẩn Việt Nam', () => {
    expect(formatVnd(1500000)).toBe('1.500.000 VNĐ');
    expect(formatVnd(0)).toBe('0 VNĐ');
  });
});
