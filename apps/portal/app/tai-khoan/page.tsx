// F-F1 — Màn hình quản trị tài khoản (Admin): mời, khóa, gán vai trò.
import { redirect } from 'next/navigation';
import { ThanhDieuHuong } from '../../components/thanh-dieu-huong';
import { goiApi, type ToiLaAi } from '../../lib/api';
import type { DanhSachTaiKhoan } from '../../lib/api-tai-khoan';
import { BangTaiKhoan } from './bang-tai-khoan';
import { FormMoi } from './form-moi';

interface DanhSachDoiXe {
  total: number;
  items: { id: string; name: string; contract_no: string | null; so_xe: number }[];
}

export default async function TrangTaiKhoan() {
  const toiKq = await goiApi<ToiLaAi>('/auth/me');
  if (!toiKq.ok) redirect('/dang-nhap');
  const toi = toiKq.data;

  const [dsKq, doiKq] = await Promise.all([
    goiApi<DanhSachTaiKhoan>('/users?limit=200'),
    goiApi<DanhSachDoiXe>('/customers'),
  ]);

  if (!dsKq.ok && dsKq.loi.status === 401) redirect('/dang-nhap');

  return (
    <>
      <ThanhDieuHuong toi={toi} muc="tai-khoan" />
      <main className="trang">
        <h1>Quản trị tài khoản</h1>
        <p className="ghi-chu" style={{ marginTop: 0 }}>
          Phân quyền theo ma trận <code>docs/prd/09-rbac.md</code>. Mặc định là TỪ CHỐI: vai trò nào
          không được cấp quyền thì không xem được dữ liệu tương ứng.
        </p>

        {!dsKq.ok ? (
          <div className="loi">Không xem được danh sách tài khoản: {dsKq.loi.message}</div>
        ) : (
          <>
            {/* Chỉ hiện form mời khi thật sự có quyền — GET /customers dùng chung quyền
                user.manage nên nó hỏng cũng có nghĩa là vai trò này chỉ được XEM. */}
            {doiKq.ok && (
              <section className="the" style={{ marginBottom: 20 }}>
                <h2>Mời tài khoản mới</h2>
                <FormMoi doiXe={doiKq.data.items.map((d) => ({ id: d.id, name: d.name }))} />
              </section>
            )}

            <section className="the">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 12,
                }}
              >
                <h2 style={{ marginBottom: 4 }}>Danh sách tài khoản</h2>
                <span className="ghi-chu">{dsKq.data.total} tài khoản</span>
              </div>
              {!doiKq.ok && (
                <p className="ghi-chu">
                  Vai trò của bạn chỉ được XEM danh sách này (sheet 9: &ldquo;V*&rdquo;), không mời
                  hay khóa tài khoản được.
                </p>
              )}
              <BangTaiKhoan danhSach={dsKq.data.items} toiLa={toi.id} />
            </section>
          </>
        )}
      </main>
    </>
  );
}
