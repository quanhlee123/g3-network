// F-F1 — Bảng tài khoản: khóa/mở khóa và đổi vai trò tại chỗ.
'use client';

import { useState, useTransition } from 'react';
import { doiTrangThai, doiVaiTro, type KetQuaThaoTac } from './actions';
import { VAI_TRO_CHON, type TaiKhoan } from '../../lib/api-tai-khoan';

function tenVaiTro(ma: string): string {
  return VAI_TRO_CHON.find((v) => v.ma === ma)?.ten ?? ma;
}

export function BangTaiKhoan({ danhSach, toiLa }: { danhSach: TaiKhoan[]; toiLa: string }) {
  const [dangChay, batDau] = useTransition();
  const [ketQua, setKetQua] = useState<KetQuaThaoTac | null>(null);

  function chay(viec: () => Promise<KetQuaThaoTac>) {
    batDau(() => {
      void viec().then(setKetQua);
    });
  }

  return (
    <>
      {ketQua && <div className={ketQua.ok ? 'thanh-cong' : 'loi'}>{ketQua.message}</div>}

      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Họ tên</th>
              <th>Đăng nhập (SĐT)</th>
              <th>Đội xe</th>
              <th>Vai trò</th>
              <th>Trạng thái</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {danhSach.map((u) => {
              const laToi = u.id === toiLa;
              return (
                <tr key={u.id}>
                  <td>
                    <strong>{u.full_name}</strong>
                    {laToi && <span className="nhan xam"> bạn</span>}
                    <div className="ghi-chu">{u.email}</div>
                  </td>
                  <td>{u.phone ?? '—'}</td>
                  <td>{u.customer_name ?? <span className="ghi-chu">Nội bộ G3</span>}</td>
                  <td>
                    <select
                      aria-label={`Vai trò của ${u.full_name}`}
                      value={u.role}
                      disabled={dangChay || laToi}
                      onChange={(e) => {
                        chay(() => doiVaiTro(u.id, e.target.value));
                      }}
                    >
                      {VAI_TRO_CHON.map((v) => (
                        <option key={v.ma} value={v.ma}>
                          {v.ten}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {u.is_active ? (
                      <span className="nhan luc">Đang hoạt động</span>
                    ) : (
                      <span className="nhan do">Đã khóa</span>
                    )}
                  </td>
                  <td>
                    {/* Không cho tự khóa mình ngay trên giao diện — API cũng chặn, nhưng
                        bày ra một nút chắc chắn báo lỗi là thiết kế tồi. */}
                    <button
                      type="button"
                      className={u.is_active ? 'nguy-hiem' : 'phu'}
                      style={{ padding: '6px 14px', fontSize: '0.9rem' }}
                      disabled={dangChay || laToi}
                      title={laToi ? 'Không thể tự khóa tài khoản của chính mình' : undefined}
                      onClick={() => {
                        chay(() => doiTrangThai(u.id, !u.is_active));
                      }}
                    >
                      {u.is_active ? 'Khóa' : 'Mở khóa'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="ghi-chu" style={{ marginTop: 12 }}>
        Khóa tài khoản hoặc đổi vai trò có hiệu lực <strong>ngay lập tức</strong>, kể cả với phiên
        đang đăng nhập — hệ thống đọc lại quyền từ cơ sở dữ liệu ở mỗi lần gọi.
      </p>
    </>
  );
}

export { tenVaiTro };
