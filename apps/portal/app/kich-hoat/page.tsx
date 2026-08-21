// F-F2 — Màn hình bắt đầu kích hoạt (quét/nhập VIN) + bảng KPI tỷ lệ thành công.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ThanhDieuHuong } from '../../components/thanh-dieu-huong';
import { goiApi, type ToiLaAi } from '../../lib/api';
import { tenTrangThai, type DanhSachKichHoat } from '../../lib/api-kich-hoat';
import { gioVn } from '../../lib/dinh-dang';
import { FormVin } from './form-vin';

export default async function TrangKichHoat() {
  const toiKq = await goiApi<ToiLaAi>('/auth/me');
  if (!toiKq.ok) redirect('/dang-nhap');

  const dsKq = await goiApi<DanhSachKichHoat>('/provisioning?limit=30');
  if (!dsKq.ok && dsKq.loi.status === 401) redirect('/dang-nhap');

  return (
    <>
      <ThanhDieuHuong toi={toiKq.data} muc="kich-hoat" />
      <main className="trang">
        <h1>Kích hoạt xe khi bàn giao</h1>
        <p className="ghi-chu" style={{ marginTop: 0 }}>
          Bốn bước tại chỗ: nhận VIN → gán thiết bị → tài xế đồng ý xử lý dữ liệu → xác nhận dữ liệu
          đã về. Xong mới in được checklist bàn giao.
        </p>

        {!dsKq.ok ? (
          <div className="loi">Không mở được màn hình kích hoạt: {dsKq.loi.message}</div>
        ) : (
          <>
            <div className="hang-o-dem">
              <div
                className={`o-dem ${
                  dsKq.data.kpi.dat_muc_tieu === null
                    ? ''
                    : dsKq.data.kpi.dat_muc_tieu
                      ? 'tot'
                      : 'canh-bao'
                }`}
              >
                {/* Chưa có phiên nào kết thúc thì hiện "—", KHÔNG hiện 0%: mẫu số rỗng
                    khác hẳn "hỏng hết", và 0% ngày đầu triển khai là báo động giả. */}
                <div className="so">
                  {dsKq.data.kpi.ty_le_pct === null ? '—' : `${dsKq.data.kpi.ty_le_pct}%`}
                </div>
                <div className="nhan">Tỷ lệ thành công (mục tiêu ≥98%)</div>
              </div>
              <div className="o-dem tot">
                <div className="so">{dsKq.data.kpi.so_thanh_cong}</div>
                <div className="nhan">Kích hoạt thành công</div>
              </div>
              <div className={`o-dem ${dsKq.data.kpi.so_that_bai > 0 ? 'canh-bao' : ''}`}>
                <div className="so">{dsKq.data.kpi.so_that_bai}</div>
                <div className="nhan">Thất bại</div>
              </div>
              <div className={`o-dem ${dsKq.data.kpi.so_dang_lam > 0 ? 'chu-y' : ''}`}>
                <div className="so">{dsKq.data.kpi.so_dang_lam}</div>
                <div className="nhan">Đang làm dở</div>
              </div>
            </div>

            <section className="the" style={{ marginBottom: 20 }}>
              <h2>Bắt đầu: quét hoặc nhập VIN</h2>
              <FormVin />
            </section>

            <section className="the">
              <h2>Lịch sử kích hoạt</h2>
              {dsKq.data.items.length === 0 ? (
                <p className="ghi-chu">Chưa có phiên kích hoạt nào.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Bắt đầu</th>
                        <th>VIN</th>
                        <th>Thiết bị</th>
                        <th>Người thực hiện</th>
                        <th>Kết quả</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {dsKq.data.items.map((p) => (
                        <tr key={p.id}>
                          <td style={{ whiteSpace: 'nowrap' }}>{gioVn(p.bat_dau_at)}</td>
                          <td>
                            <strong>{p.vin}</strong>
                          </td>
                          <td>{p.device_serial ?? <span className="ghi-chu">—</span>}</td>
                          <td>{p.thuc_hien_boi_ten}</td>
                          <td>
                            <span
                              className={`nhan ${
                                p.status === 'thanh_cong'
                                  ? 'luc'
                                  : p.status === 'that_bai'
                                    ? 'do'
                                    : p.status === 'dang_lam'
                                      ? 'vang'
                                      : 'xam'
                              }`}
                            >
                              {tenTrangThai(p.status)}
                            </span>
                            {p.ly_do_that_bai && <div className="ghi-chu">{p.ly_do_that_bai}</div>}
                          </td>
                          <td>
                            <Link href={`/kich-hoat/${p.id}`}>
                              {p.status === 'dang_lam' ? 'Làm tiếp' : 'Xem'}
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </>
  );
}
