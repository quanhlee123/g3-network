// F-D4 — cấu hình của app tài xế. Ưu tiên Android tầm trung (NF-13).
//
// Quy tắc 3: KHÔNG hardcode giá trị môi trường. Expo chỉ nhúng biến có tiền tố
// EXPO_PUBLIC_ vào bundle nên tên biến phải giữ nguyên tiền tố đó.
//
// ⚠️ Hệ quả bảo mật của tiền tố EXPO_PUBLIC_: mọi biến loại này nằm SẴN trong file
// bundle tải về máy, ai giải nén APK cũng đọc được. Vì vậy chỉ đặt ở đây những giá trị
// công khai được (địa chỉ máy chủ, thời gian chờ). TUYỆT ĐỐI không đặt khoá ký JWT,
// khoá cổng thanh toán hay bất kỳ secret nào — những thứ đó ở lại apps/api.

/** Giá trị mặc định khi chưa khai EXPO_PUBLIC_API_URL. */
const API_URL_MAC_DINH = 'http://10.0.2.2:3000';

export interface CauHinhApp {
  /** Địa chỉ gốc của apps/api. */
  apiBaseUrl: string;
  /**
   * true = đang dùng địa chỉ mặc định vì chưa ai khai biến môi trường.
   * 10.0.2.2 là lối tắt của TRÌNH GIẢ LẬP Android trỏ về localhost máy chủ — chạy trên
   * ĐIỆN THOẠI THẬT qua Expo Go thì địa chỉ này không tồn tại và app sẽ báo mất sóng.
   * Màn hình đăng nhập dùng cờ này để nhắc người chạy demo khai IP LAN của máy chủ.
   */
  dungApiUrlMacDinh: boolean;
  /** Thời gian chờ tối đa 1 lần gọi API (ms). */
  timeoutMs: number;
  /** Số chữ số của mã OTP — khớp với apps/api (6 chữ số). */
  soChuSoOtp: number;
  /** Số giây phải chờ trước khi cho xin lại mã OTP. */
  giayChoGuiLaiOtp: number;
  targetPlatform: 'android';
}

function docSo(giaTri: string | undefined, macDinh: number): number {
  const so = Number(giaTri);
  return Number.isFinite(so) && so > 0 ? so : macDinh;
}

export function taoCauHinh(env: Record<string, string | undefined> = process.env): CauHinhApp {
  const apiUrlKhai = env.EXPO_PUBLIC_API_URL?.trim();
  return {
    apiBaseUrl: (apiUrlKhai || API_URL_MAC_DINH).replace(/\/+$/, ''),
    dungApiUrlMacDinh: !apiUrlKhai,
    timeoutMs: docSo(env.EXPO_PUBLIC_API_TIMEOUT_MS, 10_000),
    soChuSoOtp: 6,
    giayChoGuiLaiOtp: 60,
    targetPlatform: 'android',
  };
}

export const APP_CONFIG: CauHinhApp = taoCauHinh();
