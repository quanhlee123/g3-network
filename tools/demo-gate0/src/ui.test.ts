// Test tiện ích hiển thị của demo Gate 0 — bảng lệch cột trong video báo cáo Ban lãnh đạo
// là lỗi thật, dù không phải lỗi nghiệp vụ.
import { describe, expect, it, vi } from 'vitest';
import { bang, choDen, soVn, tienVn } from './ui';

describe('định dạng số theo chuẩn Việt Nam (NF-17)', () => {
  it('kWh dùng dấu phẩy thập phân, 3 chữ số', () => {
    expect(soVn(4)).toBe('4,000');
    expect(soVn(22.05)).toBe('22,050');
  });

  it('VNĐ có dấu chấm ngăn nghìn và ký hiệu ₫', () => {
    expect(tienVn(14000)).toBe('14.000 ₫');
    expect(tienVn(1_500_000)).toBe('1.500.000 ₫');
  });

  it('giá trị thiếu hiển thị gạch ngang, không phải NaN/null', () => {
    expect(soVn(null)).toBe('—');
    expect(soVn(Number.POSITIVE_INFINITY)).toBe('—');
    expect(tienVn(undefined)).toBe('—');
  });
});

describe('bảng console', () => {
  it('mọi dòng có cùng độ rộng để khung không bị vỡ', () => {
    const dong: string[] = [];
    const goc = console.log;
    console.log = (m: string) => dong.push(m);
    try {
      bang(
        [
          { ten: 'Xe', rong: 16 },
          { ten: 'kWh', rong: 8, phai: true },
        ],
        [
          ['G3-SIM-VIN-0001', '4,000'],
          ['VIN-rất-dài-vượt-quá-độ-rộng-cột', '22,050'],
        ],
      );
    } finally {
      console.log = goc;
    }

    const doRong = new Set(dong.map((d) => d.length));
    expect(doRong.size, `các dòng lệch nhau: ${[...doRong].join(', ')}`).toBe(1);
  });
});

describe('choDen', () => {
  it('trả true ngay khi điều kiện đúng', async () => {
    let lan = 0;
    const kq = await choDen('thử', () => Promise.resolve(++lan >= 2), 5, 1);
    expect(kq).toBe(true);
  });

  it('kịch bản xấu — điều kiện không bao giờ đúng thì HẾT HẠN, không treo demo', async () => {
    vi.useFakeTimers();
    try {
      const chay = choDen('không bao giờ', () => Promise.resolve(false), 1, 1);
      await vi.advanceTimersByTimeAsync(2000);
      await expect(chay).resolves.toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
