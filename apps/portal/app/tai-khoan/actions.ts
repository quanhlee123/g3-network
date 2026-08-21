// F-F1 — Server Action cho các thao tác quản trị tài khoản.
//
// Chạy TRÊN MÁY CHỦ: token lấy từ cookie httpOnly, trình duyệt chỉ gửi dữ liệu biểu mẫu.
// Quyền vẫn do apps/api quyết định (quy tắc 6) — chỗ này không tự kiểm tra vai trò, chỉ
// chuyển tiếp lỗi tiếng Việt của API lên màn hình.
'use server';

import { revalidatePath } from 'next/cache';
import { goiApi } from '../../lib/api';
import type { TaiKhoan } from '../../lib/api-tai-khoan';

export interface KetQuaThaoTac {
  ok: boolean;
  message: string;
}

export async function moiTaiKhoan(
  _truoc: KetQuaThaoTac | null,
  form: FormData,
): Promise<KetQuaThaoTac> {
  const customerId = String(form.get('customer_id') ?? '').trim();
  const kq = await goiApi<TaiKhoan>('/users', {
    method: 'POST',
    body: {
      email: String(form.get('email') ?? '').trim(),
      full_name: String(form.get('full_name') ?? '').trim(),
      role: String(form.get('role') ?? ''),
      phone: String(form.get('phone') ?? '').trim(),
      // Vai trò nội bộ G3 không gắn đội — API từ chối nếu gửi kèm customer_id.
      ...(customerId === '' ? {} : { customer_id: customerId }),
    },
  });

  if (!kq.ok) return { ok: false, message: kq.loi.message };
  revalidatePath('/tai-khoan');
  return {
    ok: true,
    message: `Đã mời ${kq.data.full_name}. Người này đăng nhập bằng OTP gửi tới ${kq.data.phone ?? ''}.`,
  };
}

export async function doiTrangThai(userId: string, kichHoat: boolean): Promise<KetQuaThaoTac> {
  const kq = await goiApi<TaiKhoan>(`/users/${userId}`, {
    method: 'PATCH',
    body: { is_active: kichHoat },
  });
  if (!kq.ok) return { ok: false, message: kq.loi.message };
  revalidatePath('/tai-khoan');
  return {
    ok: true,
    message: kichHoat
      ? `Đã mở khóa ${kq.data.full_name}.`
      : `Đã khóa ${kq.data.full_name}. Token đang dùng của người này hết hiệu lực ngay.`,
  };
}

export async function doiVaiTro(userId: string, vaiTro: string): Promise<KetQuaThaoTac> {
  const kq = await goiApi<TaiKhoan>(`/users/${userId}`, {
    method: 'PATCH',
    body: { role: vaiTro },
  });
  if (!kq.ok) return { ok: false, message: kq.loi.message };
  revalidatePath('/tai-khoan');
  return { ok: true, message: `Đã đổi vai trò của ${kq.data.full_name}.` };
}
