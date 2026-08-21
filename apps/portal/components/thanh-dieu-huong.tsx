// F-E1 — Thanh điều hướng chung. Chỉ hiện mục mà vai trò đang đăng nhập dùng được
// (quy tắc 6: mặc định TỪ CHỐI — không bày ra menu dẫn tới màn hình chắc chắn bị 403).
import Link from 'next/link';
import type { ToiLaAi } from '../lib/api';
import { NutDangXuat } from './nut-dang-xuat';

const TEN_VAI_TRO: Record<string, string> = {
  driver: 'Tài xế',
  fleet_manager: 'Quản lý đội xe',
  energy_ops: 'Vận hành G3 Energy',
  warranty_admin: 'Bảo hành G3 Mobility',
  cskh: 'CSKH Holding',
  admin: 'Admin G3 Network',
  sale: 'Sale Holding',
};

export function tenVaiTro(role: string): string {
  return TEN_VAI_TRO[role] ?? role;
}

export function ThanhDieuHuong({ toi, muc }: { toi: ToiLaAi; muc: string }) {
  const laAdmin = toi.role === 'admin';
  return (
    <nav className="thanh-tren">
      <strong style={{ fontSize: '1.1rem' }}>G3 Network</strong>
      <Link href="/tong-quan" className={muc === 'tong-quan' ? 'hien-tai' : ''}>
        Tổng quan
      </Link>
      {laAdmin && (
        <>
          <Link href="/tai-khoan" className={muc === 'tai-khoan' ? 'hien-tai' : ''}>
            Tài khoản
          </Link>
          <Link href="/audit-log" className={muc === 'audit-log' ? 'hien-tai' : ''}>
            Nhật ký truy cập
          </Link>
          <Link href="/kich-hoat" className={muc === 'kich-hoat' ? 'hien-tai' : ''}>
            Kích hoạt xe
          </Link>
        </>
      )}
      <span className="day-phai">
        <span>
          {toi.full_name} · {tenVaiTro(toi.role)}
        </span>
        <NutDangXuat />
      </span>
    </nav>
  );
}
