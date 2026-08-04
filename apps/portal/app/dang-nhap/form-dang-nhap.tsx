// F-F1 — Biểu mẫu đăng nhập 2 bước: xin mã OTP → nhập mã.
// Máy trạng thái giữ ở đây cho đơn giản; token do Route Handler cất vào cookie httpOnly,
// mã trên trình duyệt KHÔNG bao giờ nhìn thấy token (xem lib/phien.ts).
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Buoc = 'nhap-sdt' | 'nhap-ma';

export function FormDangNhap() {
  const router = useRouter();
  const [buoc, setBuoc] = useState<Buoc>('nhap-sdt');
  const [sdt, setSdt] = useState('');
  const [ma, setMa] = useState('');
  const [loi, setLoi] = useState<string | null>(null);
  const [dangChay, setDangChay] = useState(false);

  async function xinMa(e: React.FormEvent) {
    e.preventDefault();
    setLoi(null);
    setDangChay(true);
    try {
      const res = await fetch('/api/otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: sdt }),
      });
      const body = (await res.json()) as { message?: string };
      if (!res.ok) {
        setLoi(body.message ?? 'Không xin được mã OTP.');
        return;
      }
      setBuoc('nhap-ma');
    } finally {
      setDangChay(false);
    }
  }

  async function xacNhan(e: React.FormEvent) {
    e.preventDefault();
    setLoi(null);
    setDangChay(true);
    try {
      const res = await fetch('/api/phien', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: sdt, code: ma }),
      });
      const body = (await res.json()) as { message?: string };
      if (!res.ok) {
        setLoi(body.message ?? 'Mã OTP không đúng.');
        return;
      }
      router.replace('/tong-quan');
      // Cookie phiên vừa đổi — buộc Server Component tải lại dữ liệu theo phiên mới.
      router.refresh();
    } finally {
      setDangChay(false);
    }
  }

  if (buoc === 'nhap-sdt') {
    return (
      <form onSubmit={(e) => void xinMa(e)}>
        <label htmlFor="sdt">Số điện thoại</label>
        <input
          id="sdt"
          type="tel"
          inputMode="numeric"
          autoComplete="username"
          placeholder="0900000003"
          value={sdt}
          onChange={(e) => {
            setSdt(e.target.value);
          }}
          required
        />
        {loi && <div className="loi">{loi}</div>}
        <button type="submit" disabled={dangChay || sdt.trim() === ''} style={{ marginTop: 16 }}>
          {dangChay ? 'Đang gửi…' : 'Gửi mã OTP'}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={(e) => void xacNhan(e)}>
      <p style={{ marginTop: 0 }}>
        Đã gửi mã tới <strong>{sdt}</strong>.
      </p>
      <label htmlFor="ma">Mã OTP</label>
      <input
        id="ma"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="6 chữ số"
        value={ma}
        onChange={(e) => {
          setMa(e.target.value);
        }}
        required
      />
      {loi && <div className="loi">{loi}</div>}
      <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
        <button type="submit" disabled={dangChay || ma.trim() === ''}>
          {dangChay ? 'Đang kiểm tra…' : 'Đăng nhập'}
        </button>
        <button
          type="button"
          className="phu"
          disabled={dangChay}
          onClick={() => {
            setBuoc('nhap-sdt');
            setMa('');
            setLoi(null);
          }}
        >
          Đổi số
        </button>
      </div>
    </form>
  );
}
