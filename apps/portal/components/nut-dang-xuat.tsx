// F-F1 — Nút đăng xuất: xoá cookie phiên qua Route Handler rồi về màn hình đăng nhập.
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function NutDangXuat() {
  const router = useRouter();
  const [dangChay, setDangChay] = useState(false);

  return (
    <button
      type="button"
      className="phu"
      style={{ padding: '6px 14px', fontSize: '0.9rem' }}
      disabled={dangChay}
      onClick={() => {
        setDangChay(true);
        void fetch('/api/phien', { method: 'DELETE' }).then(() => {
          router.replace('/dang-nhap');
          router.refresh();
        });
      }}
    >
      Đăng xuất
    </button>
  );
}
