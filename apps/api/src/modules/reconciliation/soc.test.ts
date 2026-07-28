// F-C6 — Nội suy SOC: phần dễ sai nhất của đối soát, test riêng như hàm thuần.
import { describe, expect, it } from 'vitest';
import { kwhTuTelematics, lechPhanTram, socTaiThoiDiem, type DiemSoc } from './soc';

const t = (giay: number): number => Date.UTC(2026, 6, 1, 8, 0, giay);

const chuoi: DiemSoc[] = [
  { timeMs: t(0), socPct: 20 },
  { timeMs: t(10), socPct: 22 },
  { timeMs: t(20), socPct: 24 },
  { timeMs: t(30), socPct: 26 },
];

describe('socTaiThoiDiem', () => {
  it('trùng đúng mốc bản ghi → lấy nguyên giá trị', () => {
    expect(socTaiThoiDiem(chuoi, t(20), 60)).toEqual({
      socPct: 24,
      cach: 'trung_khop',
      lech_giay: 0,
    });
  });

  it('nằm giữa 2 bản ghi → nội suy tuyến tính', () => {
    const kq = socTaiThoiDiem(chuoi, t(15), 60);
    expect(kq?.socPct).toBeCloseTo(23, 6);
    expect(kq?.cach).toBe('noi_suy');
  });

  it('nội suy không đối xứng vẫn đúng tỉ lệ', () => {
    expect(socTaiThoiDiem(chuoi, t(12), 60)?.socPct).toBeCloseTo(22.4, 6);
  });

  it('trước bản ghi đầu tiên nhưng trong cửa sổ → lấy điểm gần nhất', () => {
    const kq = socTaiThoiDiem(chuoi, t(-5), 60);
    expect(kq).toEqual({ socPct: 20, cach: 'gan_nhat', lech_giay: 5 });
  });

  it('sau bản ghi cuối nhưng trong cửa sổ → lấy điểm gần nhất', () => {
    expect(socTaiThoiDiem(chuoi, t(45), 60)?.socPct).toBe(26);
  });

  it('kịch bản xấu — ngoài cửa sổ → null (thiếu dữ liệu, KHÔNG đoán bừa)', () => {
    expect(socTaiThoiDiem(chuoi, t(-120), 60)).toBeNull();
    expect(socTaiThoiDiem(chuoi, t(200), 60)).toBeNull();
  });

  it('kịch bản xấu — mất sóng giữa phiên: 2 điểm kẹp nhưng cách quá xa → null', () => {
    const hong: DiemSoc[] = [
      { timeMs: t(0), socPct: 20 },
      { timeMs: t(600), socPct: 80 }, // im lặng 10 phút
    ];
    expect(socTaiThoiDiem(hong, t(300), 60)).toBeNull();
  });

  it('kịch bản xấu — không có bản ghi nào → null', () => {
    expect(socTaiThoiDiem([], t(0), 60)).toBeNull();
  });
});

describe('kwhTuTelematics', () => {
  it('ΔSOC 20% trên pin 105 kWh, hiệu suất 1.0 → 21 kWh', () => {
    expect(kwhTuTelematics(30, 50, 105, 1)).toBeCloseTo(21, 9);
  });

  it('hiệu suất 0.9: năng lượng lấy từ lưới lớn hơn năng lượng vào pin', () => {
    expect(kwhTuTelematics(30, 50, 105, 0.9)).toBeCloseTo(21 / 0.9, 9);
  });
});

describe('lechPhanTram', () => {
  it('lệch 5% cho ra đúng 5', () => {
    expect(lechPhanTram(105, 100)).toBeCloseTo(5, 9);
    expect(lechPhanTram(95, 100)).toBeCloseTo(5, 9);
  });

  it('tham chiếu bằng 0: cả hai bằng 0 là khớp, khác 0 là vô cùng', () => {
    expect(lechPhanTram(0, 0)).toBe(0);
    expect(lechPhanTram(1, 0)).toBe(Number.POSITIVE_INFINITY);
  });
});
