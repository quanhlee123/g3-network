// F-D4 + F-F1 — nơi cất token đăng nhập của tài xế.
//
// Để sau INTERFACE vì hai lý do:
// 1. Test chạy được không cần thiết bị (bản trong bộ nhớ ở dưới).
// 2. Bản thật phải dùng expo-secure-store (Keystore của Android) chứ KHÔNG dùng
//    AsyncStorage — AsyncStorage lưu chữ trần, máy đã root là đọc được token.
//    Bản thật gắn vào ở bước có màn hình; tới lúc đó chỉ cần thêm một lớp cài đặt
//    interface này, không đụng vào luồng đăng nhập.

export interface PhienDangNhap {
  token: string;
  /** Mốc hết hạn (epoch ms) — tính từ expires_in lúc đăng nhập. */
  hetHanLuc: number;
  nguoiDungId: string;
  hoTen: string;
  vaiTro: string;
}

export interface KhoToken {
  doc(): Promise<PhienDangNhap | null>;
  ghi(phien: PhienDangNhap): Promise<void>;
  xoa(): Promise<void>;
}

/** Bản trong bộ nhớ — dùng cho test và cho lúc chạy thử trên simulator. */
export class KhoTokenTrongBoNho implements KhoToken {
  #phien: PhienDangNhap | null = null;

  async doc(): Promise<PhienDangNhap | null> {
    return this.#phien;
  }

  async ghi(phien: PhienDangNhap): Promise<void> {
    this.#phien = phien;
  }

  async xoa(): Promise<void> {
    this.#phien = null;
  }
}

/**
 * Phiên còn dùng được không.
 * Trừ hao `bienAnToanMs` để tránh trường hợp token còn 2 giây thì được coi là hợp lệ,
 * gọi API xong thì vừa kịp hết hạn và tài xế ăn lỗi 401 giữa chừng.
 */
export function phienConHan(
  phien: PhienDangNhap | null,
  bayGio: number = Date.now(),
  bienAnToanMs = 30_000,
): boolean {
  if (!phien) return false;
  return phien.hetHanLuc - bienAnToanMs > bayGio;
}
