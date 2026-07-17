import { describe, expect, it } from 'vitest';
import { resolveProviderKind } from './index';

describe('@g3/contracts — resolveProviderKind', () => {
  it('mặc định là mock khi không đặt biến môi trường (Phase 1 dữ liệu giả 100%)', () => {
    expect(resolveProviderKind(undefined)).toBe('mock');
    expect(resolveProviderKind('')).toBe('mock');
  });

  it('nhận đúng giá trị hợp lệ', () => {
    expect(resolveProviderKind('mock')).toBe('mock');
    expect(resolveProviderKind('real')).toBe('real');
  });

  it('từ chối giá trị lạ (kịch bản xấu: cấu hình sai)', () => {
    expect(() => resolveProviderKind('production')).toThrow(/không hợp lệ/);
  });
});
