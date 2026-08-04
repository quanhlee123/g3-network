// F-E1 — Danh sách xe kèm lọc/tìm kiếm ("Xem toàn đội; lọc/tìm kiếm" — PRD dòng F-E1).
//
// Lọc chạy bằng ĐIỀU HƯỚNG URL chứ không phải state trên trình duyệt: bộ lọc nằm trong
// query string nên quản lý đội gửi được link "xe EVT-400 đang mất liên lạc" cho đồng
// nghiệp, và F5 không mất bộ lọc. Việc lọc thật do apps/api làm (đúng phạm vi sheet 9).
import type { Xe } from '../lib/api';
import { giayKeTu, khoangThoiGian, phanTram, soKm, tenTinhTrangBaoHanh } from '../lib/dinh-dang';
import { BoLocXe } from './bo-loc-xe';

/** Ngưỡng coi là "mất liên lạc" trên danh sách — khớp doTuoiViTri('cu') của bản đồ. */
const NGUONG_MAT_LIEN_LAC_GIAY = 900;

function NhanSoc({ soc }: { soc: number | null }) {
  if (soc === null) return <span className="nhan xam">Chưa có</span>;
  const lop = soc <= 10 ? 'do' : soc <= 30 ? 'vang' : 'luc';
  return <span className={`nhan ${lop}`}>{phanTram(soc)}</span>;
}

function NhanLienLac({ xe, bayGio }: { xe: Xe; bayGio: number }) {
  const giay = giayKeTu(xe.last_reading_at, bayGio);
  const matNguon = xe.device_power_status === 'lost';

  // Cột này là "dữ liệu cuối" nên LUÔN phải trả lời "cuối là bao giờ". Trạng thái mất
  // nguồn là thông tin THÊM, không được thay chỗ mốc thời gian: người trực cần cả hai
  // để biết xe im lặng bao lâu rồi VÀ vì sao.
  const moc =
    giay === null ? (
      <span className="nhan xam">Chưa lên sóng</span>
    ) : giay > NGUONG_MAT_LIEN_LAC_GIAY ? (
      <span className="nhan do">{khoangThoiGian(giay)}</span>
    ) : (
      <span className="ghi-chu">{khoangThoiGian(giay)}</span>
    );

  if (!matNguon) return moc;
  return (
    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      {moc}
      <span className="nhan do">Mất nguồn</span>
    </span>
  );
}

export function DanhSachXe({
  danhSach,
  q,
  model,
  /** Truyền vào để kết quả render ổn định trong test và không lệch giữa máy chủ/trình duyệt. */
  bayGio = Date.now(),
}: {
  danhSach: { total: number; items: Xe[] };
  q: string;
  model: string;
  bayGio?: number;
}) {
  return (
    <section className="the" style={{ marginTop: 20 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <h2 style={{ marginBottom: 4 }}>Danh sách xe</h2>
        <span className="ghi-chu">{danhSach.total} xe trong phạm vi của bạn</span>
      </div>

      <BoLocXe q={q} model={model} />

      {danhSach.items.length === 0 ? (
        <p className="ghi-chu">Không có xe nào khớp bộ lọc.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>VIN</th>
                <th>Dòng xe</th>
                <th>SOC</th>
                <th>Odo</th>
                <th>Bảo hành</th>
                <th>Dữ liệu cuối</th>
              </tr>
            </thead>
            <tbody>
              {danhSach.items.map((xe) => (
                <tr key={xe.id}>
                  <td>
                    <strong>{xe.vin}</strong>
                  </td>
                  <td>{xe.model}</td>
                  <td>
                    <NhanSoc soc={xe.soc_pct} />
                  </td>
                  <td>{soKm(xe.odometer_km)}</td>
                  <td>
                    <span
                      className={`nhan ${
                        xe.warranty_state === 'active'
                          ? 'luc'
                          : xe.warranty_state === 'at_risk'
                            ? 'vang'
                            : 'do'
                      }`}
                    >
                      {tenTinhTrangBaoHanh(xe.warranty_state)}
                    </span>
                  </td>
                  <td>
                    <NhanLienLac xe={xe} bayGio={bayGio} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
