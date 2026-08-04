// F-E1 — Test phép chiếu bản đồ đội xe.
// Trọng tâm là các ca SUY BIẾN: đội 1 xe và đội đỗ chung một bãi. Cả hai đều làm khung
// nhìn có bề rộng 0 → chia cho 0 → toạ độ NaN → bản đồ trắng trơn không báo lỗi gì.
import { describe, expect, it } from 'vitest';
import { chieuDiem, doTuoiViTri, tinhKhungNhin } from './ban-do';

describe('tinhKhungNhin', () => {
  it('bao trọn các điểm và chừa lề', () => {
    const khung = tinhKhungNhin([
      { lat: 10.0, lng: 106.0 },
      { lat: 11.0, lng: 107.0 },
    ]);
    // Tâm giữ nguyên, cạnh nới ra vì có lề.
    expect((khung.latMin + khung.latMax) / 2).toBeCloseTo(10.5, 6);
    expect((khung.lngMin + khung.lngMax) / 2).toBeCloseTo(106.5, 6);
    expect(khung.latMin).toBeLessThan(10.0);
    expect(khung.latMax).toBeGreaterThan(11.0);
  });

  it('KỊCH BẢN XẤU — đội chỉ có MỘT xe: khung vẫn có bề rộng dương', () => {
    const khung = tinhKhungNhin([{ lat: 10.8, lng: 106.7 }]);
    expect(khung.latMax - khung.latMin).toBeGreaterThan(0);
    expect(khung.lngMax - khung.lngMin).toBeGreaterThan(0);
    // Xe phải nằm ĐÚNG GIỮA khung, không dạt về góc.
    const { x, y } = chieuDiem({ lat: 10.8, lng: 106.7 }, khung, 800, 400);
    expect(x).toBeCloseTo(400, 6);
    expect(y).toBeCloseTo(200, 6);
  });

  it('KỊCH BẢN XẤU — cả đội đỗ chung một bãi: không phóng đại nhiễu GPS', () => {
    // Ba xe cách nhau vài mét (~0.00002 độ ≈ 2 m).
    const diem = [
      { lat: 10.8, lng: 106.7 },
      { lat: 10.80002, lng: 106.70001 },
      { lat: 10.79999, lng: 106.69998 },
    ];
    const khung = tinhKhungNhin(diem);
    // Khung không được co lại tới cỡ vài mét, nếu không ba xe sẽ trải khắp màn hình
    // trông như đang chạy tán loạn. (So sánh gần đúng: cộng trừ quanh 10.8 làm sai số
    // dấu phẩy động khiến hiệu không bằng ĐÚNG 0.02.)
    expect(khung.latMax - khung.latMin).toBeCloseTo(0.02, 6);

    const toaDo = diem.map((d) => chieuDiem(d, khung, 800, 400));
    // Ba xe phải nằm sát nhau ở giữa (chưa tới 5 px), đúng như thực tế.
    const xs = toaDo.map((t) => t.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(5);
  });

  it('danh sách rỗng vẫn cho khung hợp lệ để vẽ được lưới', () => {
    const khung = tinhKhungNhin([]);
    expect(khung.latMax).toBeGreaterThan(khung.latMin);
    expect(khung.lngMax).toBeGreaterThan(khung.lngMin);
  });
});

describe('chieuDiem', () => {
  const khung = { latMin: 10, latMax: 11, lngMin: 106, lngMax: 107 };

  it('lật trục y — vĩ độ CAO hơn phải nằm CAO hơn trên màn hình', () => {
    const bac = chieuDiem({ lat: 11, lng: 106.5 }, khung, 800, 400);
    const nam = chieuDiem({ lat: 10, lng: 106.5 }, khung, 800, 400);
    // y của SVG tăng xuống dưới, nên điểm phía bắc phải có y NHỎ hơn.
    expect(bac.y).toBeLessThan(nam.y);
    expect(bac.y).toBeCloseTo(0, 6);
    expect(nam.y).toBeCloseTo(400, 6);
  });

  it('kinh độ tăng thì x tăng', () => {
    const tay = chieuDiem({ lat: 10.5, lng: 106 }, khung, 800, 400);
    const dong = chieuDiem({ lat: 10.5, lng: 107 }, khung, 800, 400);
    expect(tay.x).toBeCloseTo(0, 6);
    expect(dong.x).toBeCloseTo(800, 6);
  });

  it('không bao giờ trả NaN với khung do tinhKhungNhin sinh ra', () => {
    for (const diem of [[{ lat: 10.8, lng: 106.7 }], []] as const) {
      const k = tinhKhungNhin(diem);
      const { x, y } = chieuDiem({ lat: 10.8, lng: 106.7 }, k, 800, 400);
      expect(Number.isNaN(x)).toBe(false);
      expect(Number.isNaN(y)).toBe(false);
    }
  });
});

describe('doTuoiViTri', () => {
  it('phân loại đúng ở hai bên mỗi ngưỡng', () => {
    expect(doTuoiViTri(0)).toBe('moi');
    expect(doTuoiViTri(120)).toBe('moi');
    expect(doTuoiViTri(121)).toBe('cham');
    expect(doTuoiViTri(900)).toBe('cham');
    expect(doTuoiViTri(901)).toBe('cu');
    expect(doTuoiViTri(86_400)).toBe('cu');
  });
});
