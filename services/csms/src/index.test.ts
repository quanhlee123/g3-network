import { describe, expect, it } from 'vitest';
import { resolveCsmsPort } from './index';

describe('@g3/csms — khung khởi tạo', () => {
  it('đọc CSMS_WS_PORT từ biến môi trường', () => {
    expect(resolveCsmsPort({ CSMS_WS_PORT: '9500' })).toBe(9500);
  });

  it('thiếu biến môi trường → dùng cổng mặc định 9220', () => {
    expect(resolveCsmsPort({})).toBe(9220);
  });

  it('kịch bản xấu: giá trị không phải cổng hợp lệ → báo lỗi rõ ràng', () => {
    expect(() => resolveCsmsPort({ CSMS_WS_PORT: 'abc' })).toThrow(/không hợp lệ/);
    expect(() => resolveCsmsPort({ CSMS_WS_PORT: '99999' })).toThrow(/không hợp lệ/);
  });
});
