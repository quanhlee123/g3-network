// F-D4 + F-F1 — các lệnh gọi xác thực của app tài xế.
// Khớp 1-1 với apps/api/src/routes/auth.ts; đổi khuôn ở backend thì sửa cả hai chỗ.
import type { ApiClient } from './client';

/**
 * Chuẩn hoá SĐT — BẢN SAO NGUYÊN VĂN của normalizePhone trong
 * apps/api/src/auth/otp.ts. Phải giống từng ký tự, kể cả chỗ trông như thừa:
 * chỉ bỏ khoảng trắng/dấu chấm/gạch nối (không bỏ ngoặc), và nhánh '84' đòi
 * ĐỦ 11 ký tự.
 *
 * Vì sao không "cải tiến" cho rộng rãi hơn: app chỉ được phép đoán ĐÚNG cái backend
 * sẽ làm. Nới lỏng một chút thôi là lệch — vd '8412345678' (10 ký tự): backend giữ
 * nguyên rồi từ chối, còn bản nới lỏng sẽ đổi thành '0412345678' và gửi đi một SỐ
 * KHÁC hẳn số người dùng gõ. Muốn chấp nhận thêm định dạng thì sửa backend trước,
 * rồi chép lại sang đây.
 */
export function chuanHoaSdt(sdt: string): string {
  const soDaBoDauCach = sdt.replace(/[\s.-]/g, '');
  if (soDaBoDauCach.startsWith('+84')) return `0${soDaBoDauCach.slice(3)}`;
  if (soDaBoDauCach.startsWith('84') && soDaBoDauCach.length >= 11) {
    return `0${soDaBoDauCach.slice(2)}`;
  }
  return soDaBoDauCach;
}

/** Cùng biểu thức kiểm tra mà backend dùng trước khi nhận SĐT. */
export function sdtHopLe(sdt: string): boolean {
  return /^0\d{8,11}$/.test(chuanHoaSdt(sdt));
}

export interface NguoiDung {
  id: string;
  full_name: string;
  role: string;
}

export interface KetQuaDangNhap {
  access_token: string;
  token_type: 'Bearer';
  /** Số giây token còn hiệu lực. */
  expires_in: number;
  user: NguoiDung;
}

export interface QuyenHan {
  permission: string;
  scope: string;
  require_open_ticket: boolean;
}

export interface ThongTinTaiKhoan extends NguoiDung {
  customer_id: string | null;
  permissions: QuyenHan[];
}

export class AuthApi {
  constructor(private readonly client: ApiClient) {}

  /**
   * Xin mã OTP. Backend luôn trả 202 dù SĐT có tài khoản hay không (chống dò danh sách
   * tài khoản) — nên KHÔNG được suy ra "số này có tồn tại" từ việc gọi thành công.
   */
  async xinMa(sdt: string, signal?: AbortSignal): Promise<void> {
    await this.client.goi<{ message: string }>('/auth/otp/request', {
      method: 'POST',
      body: { phone: chuanHoaSdt(sdt) },
      congKhai: true,
      signal,
    });
  }

  async xacThucMa(sdt: string, ma: string, signal?: AbortSignal): Promise<KetQuaDangNhap> {
    return this.client.goi<KetQuaDangNhap>('/auth/otp/verify', {
      method: 'POST',
      body: { phone: chuanHoaSdt(sdt), code: ma.trim() },
      congKhai: true,
      signal,
    });
  }

  async layTaiKhoan(signal?: AbortSignal): Promise<ThongTinTaiKhoan> {
    return this.client.goi<ThongTinTaiKhoan>('/auth/me', { signal });
  }
}
