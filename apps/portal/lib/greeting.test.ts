import { describe, expect, it } from 'vitest';
import { getGreeting } from './greeting';

describe('@g3/portal — khung khởi tạo', () => {
  it('trang chào hiển thị tên hệ thống bằng tiếng Việt (NF-12)', () => {
    expect(getGreeting()).toBe('G3 Network — Portal đội xe');
  });
});
