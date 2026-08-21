// F-F2 bước 1 — Nhận VIN. Ô nhập tự viết hoa và bỏ khoảng trắng vì VIN quét từ mã vạch
// hay dính ký tự thừa, còn nhân viên gõ tay trên máy tính bảng thì hay dính dấu cách cuối.
'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { batDauTheoVin, type KetQua } from './actions';
import type { PhienKichHoat } from '../../lib/api-kich-hoat';

export function FormVin() {
  const router = useRouter();
  const [kq, gui, dangChay] = useActionState<KetQua<PhienKichHoat> | null, FormData>(
    batDauTheoVin,
    null,
  );

  // Mở phiên xong đi thẳng vào wizard — bàn giao xe là việc làm tại chỗ, không nên
  // bắt nhân viên bấm thêm một lần nữa (NF-12: tác vụ chính ≤3 chạm).
  useEffect(() => {
    if (kq?.ok && kq.data) router.push(`/kich-hoat/${kq.data.id}`);
  }, [kq, router]);

  return (
    <form action={gui}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 320px' }}>
          <label htmlFor="vin">Số khung (VIN)</label>
          <input
            id="vin"
            name="vin"
            type="text"
            required
            autoFocus
            placeholder="G3-SIM-VIN-0013"
            style={{ textTransform: 'uppercase' }}
          />
        </div>
        <button type="submit" disabled={dangChay}>
          {dangChay ? 'Đang mở…' : 'Bắt đầu kích hoạt'}
        </button>
      </div>
      {kq && !kq.ok && <div className="loi">{kq.message}</div>}
    </form>
  );
}
