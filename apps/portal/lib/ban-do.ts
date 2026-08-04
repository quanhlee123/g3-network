// F-E1 — Phép chiếu toạ độ cho bản đồ đội xe.
//
// ⚠️ VÌ SAO KHÔNG CÓ TILE BẢN ĐỒ Ở ĐÂY: quyết định Q5 (VietMap vs Google vs Mapbox) đang
// MỞ trong docs/DECISION-LOG.md. Gọi tile của một nhà cung cấp bất kỳ lúc này là tự chốt
// Q5 bằng code — điều CLAUDE.md cấm. Nên Phase 1 vẽ xe trên một khung toạ độ tự dựng:
// vẫn thấy được đội hình, cụm xe, xe lạc tuyến; chỉ chưa có đường sá bên dưới.
//
// Khi Q5 chốt: giữ nguyên chieuDiem() làm phép chiếu, thay lớp nền bằng tile của nhà
// cung cấp được chọn (xem components/ban-do-doi.tsx — lớp nền là một <rect> duy nhất).

export interface DiemToaDo {
  lat: number;
  lng: number;
}

export interface KhungNhin {
  latMin: number;
  latMax: number;
  lngMin: number;
  lngMax: number;
}

/** Toạ độ đã chiếu sang hệ pixel của SVG (gốc trên-trái). */
export interface DiemManHinh {
  x: number;
  y: number;
}

/**
 * Nửa cạnh tối thiểu của khung nhìn, tính bằng ĐỘ (~1.1 km).
 *
 * Cần nó cho hai ca suy biến mà đội xe thật gặp thường xuyên:
 *   - chỉ có ĐÚNG MỘT xe → khung nhìn có bề rộng 0 → chia cho 0;
 *   - cả đội đang đỗ CÙNG MỘT BÃI → mọi toạ độ gần như trùng nhau → phóng đại nhiễu GPS
 *     vài mét thành cả màn hình, nhìn như đội xe đang tán loạn.
 */
const NUA_CANH_TOI_THIEU_DO = 0.01;

/** Chừa lề để điểm sát biên không bị cắt mất nửa ký hiệu. */
const LE_TY_LE = 0.1;

/**
 * Khung nhìn bao trọn các điểm, luôn có bề rộng/cao dương.
 * Danh sách rỗng trả về khung mặc định quanh TP.HCM để bản đồ vẫn vẽ được lưới.
 */
export function tinhKhungNhin(diem: readonly DiemToaDo[]): KhungNhin {
  if (diem.length === 0) {
    return { latMin: 10.7, latMax: 10.9, lngMin: 106.6, lngMax: 106.8 };
  }

  const lats = diem.map((d) => d.lat);
  const lngs = diem.map((d) => d.lng);
  const latGiua = (Math.min(...lats) + Math.max(...lats)) / 2;
  const lngGiua = (Math.min(...lngs) + Math.max(...lngs)) / 2;

  // Nửa cạnh thật của dữ liệu, cộng lề, nhưng không bao giờ nhỏ hơn mức tối thiểu.
  const nuaLat = Math.max(
    ((Math.max(...lats) - Math.min(...lats)) / 2) * (1 + LE_TY_LE),
    NUA_CANH_TOI_THIEU_DO,
  );
  const nuaLng = Math.max(
    ((Math.max(...lngs) - Math.min(...lngs)) / 2) * (1 + LE_TY_LE),
    NUA_CANH_TOI_THIEU_DO,
  );

  return {
    latMin: latGiua - nuaLat,
    latMax: latGiua + nuaLat,
    lngMin: lngGiua - nuaLng,
    lngMax: lngGiua + nuaLng,
  };
}

/**
 * Chiếu một toạ độ vào khung SVG rộng `rong` × cao `cao` pixel.
 *
 * Phép chiếu phẳng (equirectangular). Đủ đúng ở phạm vi một đội xe vài trăm km và không
 * cần thư viện nào; KHÔNG dùng để đo khoảng cách — việc đó đã có PostGIS làm trong DB.
 * Trục y bị lật vì vĩ độ tăng lên phía BẮC còn y của SVG tăng xuống DƯỚI.
 */
export function chieuDiem(
  diem: DiemToaDo,
  khung: KhungNhin,
  rong: number,
  cao: number,
): DiemManHinh {
  const tyLeX = (diem.lng - khung.lngMin) / (khung.lngMax - khung.lngMin);
  const tyLeY = (diem.lat - khung.latMin) / (khung.latMax - khung.latMin);
  return { x: tyLeX * rong, y: (1 - tyLeY) * cao };
}

/**
 * Mức "cũ" của một vị trí, dùng để đổi màu ký hiệu xe trên bản đồ.
 * Xe mất sóng phải NHÌN LÀ BIẾT, không phải rê chuột vào mới thấy.
 */
export type DoTuoiViTri = 'moi' | 'cham' | 'cu';

export function doTuoiViTri(cuGiay: number): DoTuoiViTri {
  if (cuGiay <= 120) return 'moi'; // vẫn đang gửi đều
  if (cuGiay <= 900) return 'cham'; // trễ, có thể sóng yếu
  return 'cu'; // quá 15 phút — coi như mất liên lạc
}
