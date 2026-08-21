// F-F1 · NF-06 — Màn hình xem NHẬT KÝ TRUY CẬP VỊ TRÍ XE (Admin).
//
// Đây là màn hình trả lời câu hỏi mà Nghị định 13/2023 cho chủ thể dữ liệu quyền hỏi:
// "AI đã xem vị trí xe tôi, LÚC NÀO, và VÌ SAO?". Nên bộ lọc theo xe phải là thứ dùng
// được trong 1 thao tác, và lượt BỊ TỪ CHỐI cũng phải hiện.
import { redirect } from 'next/navigation';
import { ThanhDieuHuong } from '../../components/thanh-dieu-huong';
import { goiApi, type ToiLaAi } from '../../lib/api';
import type { DanhSachNhatKy } from '../../lib/api-tai-khoan';
import { gioVn } from '../../lib/dinh-dang';
import { BoLocNhatKy } from './bo-loc-nhat-ky';

const MOI_TRANG = 100;

export default async function TrangNhatKy({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const chuoi = (ten: string): string => (typeof sp[ten] === 'string' ? sp[ten] : '');
  const vin = chuoi('vin');
  const action = chuoi('action');
  const from = chuoi('from');
  const to = chuoi('to');

  const toiKq = await goiApi<ToiLaAi>('/auth/me');
  if (!toiKq.ok) redirect('/dang-nhap');
  const toi = toiKq.data;

  // Lọc theo VIN cho người dùng, nhưng API nhận vehicle_id — tra mã xe trước.
  let vehicleId = '';
  let khongCoXe = false;
  if (vin !== '') {
    const xeKq = await goiApi<{ items: { id: string; vin: string }[] }>(
      `/vehicles?q=${encodeURIComponent(vin)}&limit=2`,
    );
    const khop = xeKq.ok
      ? (xeKq.data.items.find((x) => x.vin === vin) ?? xeKq.data.items[0])
      : undefined;
    if (khop) vehicleId = khop.id;
    else khongCoXe = true;
  }

  const thamSo = new URLSearchParams({ limit: String(MOI_TRANG) });
  if (vehicleId !== '') thamSo.set('vehicle_id', vehicleId);
  if (action !== '') thamSo.set('action', action);
  if (from !== '') thamSo.set('from', new Date(`${from}T00:00:00`).toISOString());
  if (to !== '') thamSo.set('to', new Date(`${to}T23:59:59`).toISOString());

  const kq = khongCoXe ? null : await goiApi<DanhSachNhatKy>(`/audit-logs?${thamSo.toString()}`);
  if (kq && !kq.ok && kq.loi.status === 401) redirect('/dang-nhap');

  return (
    <>
      <ThanhDieuHuong toi={toi} muc="audit-log" />
      <main className="trang">
        <h1>Nhật ký truy cập vị trí xe</h1>
        <p className="ghi-chu" style={{ marginTop: 0 }}>
          Mỗi dòng ghi đủ: <strong>ai · lúc nào · xe nào · lý do</strong> (NF-06, Nghị định
          13/2023). Cả lượt xem được lẫn lượt bị từ chối đều được lưu.
        </p>

        <section className="the" style={{ marginBottom: 20 }}>
          <BoLocNhatKy vin={vin} action={action} from={from} to={to} />
        </section>

        {khongCoXe ? (
          <div className="loi">
            Không tìm thấy xe có VIN &ldquo;{vin}&rdquo; trong phạm vi của bạn.
          </div>
        ) : kq && !kq.ok ? (
          <div className="loi">Không đọc được nhật ký: {kq.loi.message}</div>
        ) : kq?.ok ? (
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
              <h2 style={{ marginBottom: 4 }}>Kết quả</h2>
              <span className="ghi-chu">
                {kq.data.total} lượt truy cập
                {kq.data.total > MOI_TRANG && ` — đang hiện ${MOI_TRANG} lượt gần nhất`}
              </span>
            </div>

            {kq.data.items.length === 0 ? (
              <p className="ghi-chu">Chưa có lượt truy cập nào khớp bộ lọc.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Lúc nào</th>
                      <th>Ai</th>
                      <th>Xe nào</th>
                      <th>Lý do</th>
                      <th>Kết quả</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kq.data.items.map((d) => (
                      <tr key={d.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>{gioVn(d.occurred_at)}</td>
                        <td>
                          <strong>{d.user_name}</strong>
                          <div className="ghi-chu">{d.user_role}</div>
                        </td>
                        <td>
                          {d.vin ? (
                            d.vin
                          ) : d.so_xe !== null ? (
                            // Một lần xem bản đồ = một hành vi truy cập nhiều xe
                            // (rbac-matrix R-13). Phải nói rõ, không để trống.
                            <span className="nhan xam">Bản đồ đội — {d.so_xe} xe</span>
                          ) : (
                            <span className="ghi-chu">—</span>
                          )}
                        </td>
                        <td>{d.reason}</td>
                        <td>
                          {d.action === 'vehicle_location.denied' ? (
                            <span className="nhan do">Bị từ chối</span>
                          ) : (
                            <span className="nhan luc">Đã xem</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}
      </main>
    </>
  );
}
