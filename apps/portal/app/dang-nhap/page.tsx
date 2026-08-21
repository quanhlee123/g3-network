// F-F1 — Màn hình đăng nhập portal (OTP qua SĐT, giống app tài xế).
import { redirect } from 'next/navigation';
import { docPhien } from '../../lib/phien';
import { FormDangNhap } from './form-dang-nhap';

export default async function TrangDangNhap() {
  // Đã đăng nhập rồi thì không bắt làm lại.
  if (await docPhien()) redirect('/tong-quan');

  return (
    <main style={{ maxWidth: 460, margin: '0 auto', padding: '64px 24px' }}>
      <h1>G3 Network</h1>
      <p className="ghi-chu" style={{ marginTop: 0, marginBottom: 28 }}>
        Portal quản lý đội xe · Phase 1 chạy trên simulator, dữ liệu giả 100%.
      </p>
      <div className="the">
        <FormDangNhap />
      </div>
      <p className="ghi-chu" style={{ marginTop: 20 }}>
        Phase 1 không gửi SMS thật: mã OTP được in ra console của <code>apps/api</code>.
      </p>
    </main>
  );
}
