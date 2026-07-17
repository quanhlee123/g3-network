import { describe, expect, it } from 'vitest';
import { parseCount } from './index';

describe('@g3/vehicle-sim — parseCount', () => {
  it('mặc định 1 xe khi không truyền --count', () => {
    expect(parseCount([])).toBe(1);
  });

  it('đọc đúng --count 20', () => {
    expect(parseCount(['--count', '20'])).toBe(20);
  });

  it('kịch bản xấu: --count không hợp lệ → báo lỗi rõ ràng', () => {
    expect(() => parseCount(['--count', 'abc'])).toThrow(/số nguyên/);
    expect(() => parseCount(['--count', '0'])).toThrow(/số nguyên/);
    expect(() => parseCount(['--count=-5'])).toThrow(/số nguyên/);
  });
});
