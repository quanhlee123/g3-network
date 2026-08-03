// F-B1 — Test thuần cho khung giờ ToU (không cần DB).
//
// Trọng tâm là hai chỗ dễ sai nhất và sai thì gắn cờ vi phạm oan:
//   1. Múi giờ: khung giờ trong hợp đồng là giờ Việt Nam, timestamptz trong DB là UTC.
//   2. Khung qua nửa đêm (22:00–06:00) — nửa số ca thực tế của sạc ban đêm nằm ở đây.
import { describe, expect, it } from 'vitest';
import {
  kiemTraKhungGio,
  moTaKhungGio,
  phutDiaPhuong,
  phutTrongNgay,
  trongKhungGio,
} from './policy';

describe('F-B1 — đọc khung giờ', () => {
  it('đổi HH:MM thành số phút', () => {
    expect(phutTrongNgay('00:00')).toBe(0);
    expect(phutTrongNgay('06:30')).toBe(390);
    expect(phutTrongNgay('23:59')).toBe(1439);
  });

  it('kịch bản xấu: định dạng sai bị từ chối, không âm thầm nhận bừa', () => {
    for (const xau of ['24:00', '6:30', '06:60', '0630', 'sáng sớm', '']) {
      expect(() => phutTrongNgay(xau), `"${xau}" phải bị từ chối`).toThrow();
    }
  });

  it('kiemTraKhungGio bắt được khung rỗng và khung độ dài 0', () => {
    expect(kiemTraKhungGio([])).toContain('rỗng');
    expect(kiemTraKhungGio([{ from: '22:00', to: '22:00' }])).toContain('độ dài 0');
    expect(kiemTraKhungGio([{ from: '22:00', to: '06:00' }])).toBeNull();
  });
});

describe('F-B1 — quy đổi múi giờ (Asia/Ho_Chi_Minh = UTC+7)', () => {
  it('23:00 UTC là 06:00 hôm sau ở Việt Nam', () => {
    // Đây chính là ca làm hệ thống gắn cờ oan nếu quên quy đổi: cùng một mốc, giờ UTC
    // nằm trong khung cấm mà giờ Việt Nam thì không (hoặc ngược lại).
    const mocUtc = new Date('2026-06-12T23:00:00Z');

    expect(phutDiaPhuong(mocUtc, 'Asia/Ho_Chi_Minh')).toBe(6 * 60);
    expect(phutDiaPhuong(mocUtc, 'UTC')).toBe(23 * 60);
  });
});

describe('F-B1 — khung giờ cho phép', () => {
  const banDem = [{ from: '22:00', to: '06:00' }]; // qua nửa đêm
  const banNgay = [{ from: '09:00', to: '17:00' }]; // trong ngày

  it('khung qua nửa đêm nhận cả hai đầu, loại khoảng giữa ngày', () => {
    // 15:00Z = 22:00 VN — đúng biên mở của khung
    expect(trongKhungGio(new Date('2026-06-12T15:00:00Z'), banDem)).toBe(true);
    // 19:00Z = 02:00 VN hôm sau — giữa khung, phía sau nửa đêm
    expect(trongKhungGio(new Date('2026-06-12T19:00:00Z'), banDem)).toBe(true);
    // 22:59Z = 05:59 VN — sát biên đóng, vẫn trong khung
    expect(trongKhungGio(new Date('2026-06-12T22:59:00Z'), banDem)).toBe(true);
    // 23:00Z = 06:00 VN — biên đóng KHÔNG thuộc khung
    expect(trongKhungGio(new Date('2026-06-12T23:00:00Z'), banDem)).toBe(false);
    // 07:00Z = 14:00 VN — giữa trưa, ngoài khung ban đêm
    expect(trongKhungGio(new Date('2026-06-12T07:00:00Z'), banDem)).toBe(false);
  });

  it('khung trong ngày không bị hiểu nhầm thành khung qua đêm', () => {
    expect(trongKhungGio(new Date('2026-06-12T02:00:00Z'), banNgay)).toBe(true); // 09:00 VN — biên mở
    expect(trongKhungGio(new Date('2026-06-12T09:00:00Z'), banNgay)).toBe(true); // 16:00 VN
    expect(trongKhungGio(new Date('2026-06-12T10:00:00Z'), banNgay)).toBe(false); // 17:00 VN — biên đóng
    expect(trongKhungGio(new Date('2026-06-12T19:00:00Z'), banNgay)).toBe(false); // 02:00 VN
  });

  it('nhiều khung rời nhau: chỉ cần thuộc MỘT khung là hợp lệ', () => {
    const haiKhung = [
      { from: '00:00', to: '06:00' },
      { from: '22:00', to: '23:59' },
    ];
    expect(trongKhungGio(new Date('2026-06-12T19:00:00Z'), haiKhung)).toBe(true); // 02:00 VN
    expect(trongKhungGio(new Date('2026-06-12T15:30:00Z'), haiKhung)).toBe(true); // 22:30 VN
    expect(trongKhungGio(new Date('2026-06-12T05:00:00Z'), haiKhung)).toBe(false); // 12:00 VN
  });

  it('mô tả khung giờ đọc được để đưa vào nội dung cảnh báo F-B5', () => {
    expect(moTaKhungGio(banDem)).toBe('22:00–06:00');
  });
});
