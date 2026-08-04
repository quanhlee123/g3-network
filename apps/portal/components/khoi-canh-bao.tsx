// F-E1 — Khối cảnh báo trên màn hình tổng quan.
//
// Gộp BA nguồn mà Hành trình 2 bước 1 nêu tên: "bản đồ toàn đội, xe offline, cảnh báo qua
// đêm" — pin (F-A2/F-A4), vi phạm sạc (F-B5) và thiết bị mất liên lạc (F-J1/F-J3).
// Mỗi cảnh báo đi kèm HÀNH ĐỘNG GỢI Ý, đúng yêu cầu thiết kế của bước 2 ("Cảnh báo kèm
// hành động gợi ý"): cảnh báo không nói phải làm gì thì chỉ là tiếng ồn.
import type { CanhBao, ThietBi } from '../lib/api';
import { gioVn, hanhDongGoiY, khoangThoiGian, tenLoaiCanhBao, tenMucDo } from '../lib/dinh-dang';

function MotCanhBao({ cb }: { cb: CanhBao }) {
  return (
    <article className={`canh-bao-item muc-${String(Math.min(3, Math.max(1, cb.severity)))}`}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <strong>{tenLoaiCanhBao(cb.type)}</strong>
        <span className={`nhan ${cb.severity >= 3 ? 'do' : cb.severity === 2 ? 'vang' : 'xam'}`}>
          {tenMucDo(cb.severity)}
        </span>
        <span className="ghi-chu">{cb.vin}</span>
        <span className="ghi-chu" style={{ marginLeft: 'auto' }}>
          {gioVn(cb.triggered_at)}
        </span>
      </div>
      <div className="goi-y">{hanhDongGoiY(cb.type)}</div>
    </article>
  );
}

/**
 * Tóm tắt theo LOẠI trước khi liệt kê.
 *
 * Vì sao cần: một đợt quét thiết bị có thể sinh vài chục cảnh báo cùng loại một lúc.
 * Danh sách xếp theo mức độ khi đó bị một loại chiếm hết chỗ, và cảnh báo pin của một
 * xe khác bị đẩy khuất — đúng thứ màn hình tổng quan sinh ra để tránh.
 */
function TomTatTheoLoai({ theoLoai }: { theoLoai: Record<string, number> }) {
  const dong = Object.entries(theoLoai).sort((a, b) => b[1] - a[1]);
  if (dong.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
      {dong.map(([loai, n]) => (
        <span key={loai} className="nhan xam">
          {tenLoaiCanhBao(loai)}: <strong>{n}</strong>
        </span>
      ))}
    </div>
  );
}

export function KhoiCanhBao({
  canhBao,
  thietBi,
}: {
  canhBao: { total: number; theo_loai: Record<string, number>; items: CanhBao[] } | null;
  thietBi: { total: number; items: ThietBi[] } | null;
}) {
  return (
    <aside style={{ display: 'grid', gap: 20 }}>
      <section className="the">
        <h2>Cảnh báo chưa xử lý</h2>
        {canhBao === null ? (
          <p className="ghi-chu">Vai trò của bạn không xem được cảnh báo pin (sheet 9).</p>
        ) : canhBao.total === 0 ? (
          <p className="ghi-chu">Không có cảnh báo nào đang mở. Đội xe đang yên.</p>
        ) : (
          <>
            <TomTatTheoLoai theoLoai={canhBao.theo_loai} />
            {canhBao.items.slice(0, 8).map((cb) => (
              <MotCanhBao key={cb.id} cb={cb} />
            ))}
            {canhBao.total > 8 && <p className="ghi-chu">…và {canhBao.total - 8} cảnh báo khác.</p>}
          </>
        )}
      </section>

      <section className="the">
        <h2>Thiết bị mất liên lạc</h2>
        {thietBi === null ? (
          <p className="ghi-chu">Vai trò của bạn không xem được sức khỏe thiết bị (sheet 9).</p>
        ) : thietBi.items.length === 0 ? (
          <p className="ghi-chu">Mọi thiết bị đang gửi dữ liệu bình thường.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>VIN</th>
                  <th>Im lặng</th>
                  <th>Kết luận</th>
                </tr>
              </thead>
              <tbody>
                {thietBi.items.slice(0, 8).map((tb) => (
                  <tr key={tb.device_id}>
                    <td>
                      <strong>{tb.vin}</strong>
                    </td>
                    <td>
                      {tb.im_lang_giay === null ? 'Chưa từng gửi' : khoangThoiGian(tb.im_lang_giay)}
                    </td>
                    <td>
                      {/* F-J3: "mất nguồn" khác hẳn "mất sóng" — một cái là nghi tháo thiết bị,
                          cái kia chỉ là vùng lõm sóng. Không được hiển thị giống nhau. */}
                      {tb.power_status === 'lost' ? (
                        <span className="nhan do">Nghi tháo thiết bị</span>
                      ) : (
                        <span className="nhan vang">Mất sóng</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </aside>
  );
}
