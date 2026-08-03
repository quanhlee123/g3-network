// Nghiệm thu tuần 8 — khung giờ của kịch bản phải luôn LOẠI TRỪ thời điểm chạy demo.
// Sai chỗ này thì demo chạy lúc 23h sẽ kết luận ngược hẳn lời thuyết minh trước Ban lãnh đạo.
import { describe, expect, it } from 'vitest';
import { trongKhungGio } from '@g3/api';
import { khungGioLoaiTru, phutDiaPhuong } from './khung-gio';

const TZ = 'Asia/Ho_Chi_Minh';

describe('nghiệm thu tuần 8 — khung giờ loại trừ', () => {
  it('MỌI giờ trong ngày đều cho ra khung KHÔNG chứa thời điểm đó', () => {
    // Quét cả 24×4 mốc 15 phút: không được có một mốc nào lọt.
    for (let i = 0; i < 24 * 4; i++) {
      const at = new Date(Date.UTC(2026, 7, 3, 0, 0, 0) + i * 15 * 60_000);
      const khung = khungGioLoaiTru(at, TZ);

      expect(
        trongKhungGio(at, [khung], TZ),
        `${at.toISOString()} không được nằm trong ${khung.from}–${khung.to}`,
      ).toBe(false);
    }
  });

  it('khung vắt qua nửa đêm vẫn loại trừ đúng', () => {
    // 03:00 giờ VN → khung [21:00, 00:00) của hôm trước
    const at = new Date('2026-08-03T20:00:00Z'); // 03:00 VN ngày 04
    const khung = khungGioLoaiTru(at, TZ);

    expect(phutDiaPhuong(at, TZ)).toBe(3 * 60);
    expect(khung).toEqual({ from: '21:00', to: '00:00' });
    expect(trongKhungGio(at, [khung], TZ)).toBe(false);
  });

  it('phiên sạc kéo dài vài phút sau thời điểm bắt đầu vẫn nằm ngoài khung', () => {
    const batDau = new Date('2026-08-03T09:00:00Z');
    const khung = khungGioLoaiTru(batDau, TZ);

    for (const phut of [0, 1, 5, 15, 60, 120]) {
      const luc = new Date(batDau.getTime() + phut * 60_000);
      expect(trongKhungGio(luc, [khung], TZ), `phút thứ ${phut}`).toBe(false);
    }
  });
});
