// F-F1 — Biểu mẫu mời tài khoản mới.
// Ô "đội xe" tự ẩn/hiện theo vai trò: apps/api từ chối vai trò nội bộ mà gắn đội (và ngược
// lại), nên giao diện phải nói trước điều đó thay vì để người dùng bấm rồi ăn lỗi 400.
'use client';

import { useActionState, useState } from 'react';
import { moiTaiKhoan, type KetQuaThaoTac } from './actions';
import { VAI_TRO_CHON, vaiTroThuocDoi } from '../../lib/api-tai-khoan';

export function FormMoi({ doiXe }: { doiXe: { id: string; name: string }[] }) {
  const [vaiTro, setVaiTro] = useState('driver');
  const [ketQua, guiForm, dangChay] = useActionState<KetQuaThaoTac | null, FormData>(
    moiTaiKhoan,
    null,
  );
  const canDoi = vaiTroThuocDoi(vaiTro);

  return (
    <form action={guiForm}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
        }}
      >
        <div>
          <label htmlFor="full_name">Họ tên</label>
          <input id="full_name" name="full_name" type="text" required maxLength={200} />
        </div>
        <div>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="text" required maxLength={200} />
        </div>
        <div>
          <label htmlFor="phone">Số điện thoại (dùng để đăng nhập)</label>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="numeric"
            required
            placeholder="0900000123"
          />
        </div>
        <div>
          <label htmlFor="role">Vai trò</label>
          <select
            id="role"
            name="role"
            value={vaiTro}
            onChange={(e) => {
              setVaiTro(e.target.value);
            }}
          >
            {VAI_TRO_CHON.map((v) => (
              <option key={v.ma} value={v.ma}>
                {v.ten}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="customer_id">Đội xe</label>
          <select id="customer_id" name="customer_id" disabled={!canDoi} required={canDoi}>
            {canDoi ? (
              <>
                <option value="">— Chọn đội xe —</option>
                {doiXe.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </>
            ) : (
              <option value="">Không áp dụng (vai trò nội bộ G3)</option>
            )}
          </select>
          <div className="ghi-chu" style={{ marginTop: 6 }}>
            {canDoi
              ? 'Bắt buộc: vai trò này chỉ xem được dữ liệu trong đội được gán.'
              : 'Vai trò nội bộ G3 không gắn với đội xe nào.'}
          </div>
        </div>
      </div>

      {ketQua && <div className={ketQua.ok ? 'thanh-cong' : 'loi'}>{ketQua.message}</div>}

      <button type="submit" disabled={dangChay} style={{ marginTop: 16 }}>
        {dangChay ? 'Đang mời…' : 'Mời tài khoản'}
      </button>
      <p className="ghi-chu" style={{ marginTop: 10 }}>
        Phase 1 không có mật khẩu: mời xong là người đó đăng nhập được bằng mã OTP gửi tới số điện
        thoại đã khai. Dùng SỐ GIẢ (quy tắc 12).
      </p>
    </form>
  );
}
