// F-D4 + F-F1 — các lệnh gọi xác thực của app tài xế.
// Khớp 1-1 với apps/api/src/routes/auth.ts; đổi khuôn ở backend thì sửa cả hai chỗ.
//
// Chuẩn hoá SĐT dùng CHUNG một bản với backend qua @g3/shared — không còn bản sao
// chép tay ở đây nữa. Sửa cách chuẩn hoá thì sửa packages/shared/src/phone.ts,
// cả hai bên đổi theo cùng lúc.
import { normalizePhone as chuanHoaSdt } from '@g3/shared';
import type { ApiClient } from './client';

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
