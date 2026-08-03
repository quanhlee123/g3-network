// F-D4 — tra cứu chuỗi tiếng Việt + thay tham số dạng {ten} (NF-12).
// Phase 1 chỉ có tiếng Việt nên KHÔNG dựng thư viện i18n đầy đủ: một hàm thay chuỗi
// là đủ, mà lại không kéo thêm dependency vào bundle Android tầm trung (NF-13).
import { VI } from './vi';

export { VI } from './vi';
export type { ViCatalog } from './vi';

export type ThamSo = Record<string, string | number>;

/**
 * Thay các ô {ten} trong câu bằng giá trị tương ứng.
 * Ô không có giá trị được GIỮ NGUYÊN thay vì xoá đi — để lỗi thiếu tham số lộ ra
 * trên màn hình lúc test, chứ không âm thầm hiện câu cụt cho tài xế.
 */
export function dienThamSo(mau: string, thamSo: ThamSo = {}): string {
  return mau.replace(/\{(\w+)\}/g, (nguyenVan, ten: string) => {
    const giaTri = thamSo[ten];
    return giaTri === undefined ? nguyenVan : String(giaTri);
  });
}

/** Câu cho lỗi đăng nhập theo mã backend trả về; mã lạ thì rơi về câu chung. */
export function cauLoiDangNhap(maLoi: string): string {
  const bang: Record<string, string> = VI.loiDangNhap;
  return bang[maLoi] ?? VI.loiMang.khong_ro;
}

/** Câu cho lỗi tầng mạng theo phân loại của ApiError. */
export function cauLoiMang(loai: keyof typeof VI.loiMang): string {
  return VI.loiMang[loai] ?? VI.loiMang.khong_ro;
}
