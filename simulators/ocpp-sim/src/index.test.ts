import { describe, expect, it } from 'vitest';
import { parseStations } from './index';

describe('@g3/ocpp-sim — parseStations', () => {
  it('mặc định 1 trụ khi không truyền --stations', () => {
    expect(parseStations([])).toBe(1);
  });

  it('đọc đúng --stations 3', () => {
    expect(parseStations(['--stations', '3'])).toBe(3);
  });

  it('kịch bản xấu: --stations không hợp lệ → báo lỗi rõ ràng', () => {
    expect(() => parseStations(['--stations', 'ba'])).toThrow(/số nguyên/);
    expect(() => parseStations(['--stations', '0'])).toThrow(/số nguyên/);
  });
});
