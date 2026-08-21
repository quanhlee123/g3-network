// F-E1 — MÀN HÌNH TỔNG QUAN. Đây là trang chủ portal.
//
// Yêu cầu thiết kế của Hành trình 2 bước 1 (sheet 2): "Trang chủ = 1 màn hình tổng quan,
// KHÔNG CẦN CLICK SÂU". Nên mọi thứ quản lý đội cần lúc 8h sáng thứ 2 đều nằm ở đây:
// bản đồ toàn đội · danh sách xe (lọc/tìm) · cảnh báo qua đêm · thiết bị offline.
//
// Phạm vi dữ liệu KHÔNG do màn hình này quyết định — apps/api đã ép theo sheet 9 ngay
// trong câu SQL. Ở đây chỉ xử lý chuyện hiển thị khi vai trò không có quyền xem một khối.
import { redirect } from 'next/navigation';
import { BanDoDoi } from '../../components/ban-do-doi';
import { DanhSachXe } from '../../components/danh-sach-xe';
import { KhoiCanhBao } from '../../components/khoi-canh-bao';
import { ThanhDieuHuong } from '../../components/thanh-dieu-huong';
import {
  goiApi,
  type BanDoDoi as BanDoDoiData,
  type DanhSachCanhBao,
  type DanhSachXe as DanhSachXeData,
  type KetQua,
  type SucKhoeThietBi,
  type ToiLaAi,
} from '../../lib/api';

/** Ngưỡng đưa thiết bị vào khối "mất liên lạc" của màn hình tổng quan. */
const IM_LANG_QUA_GIAY = 900;

/**
 * Lý do truy cập ghi vào audit_logs cho mỗi lần mở bản đồ (quy tắc 5, NF-06).
 * Câu này phải nói ĐÚNG việc đã xảy ra — người đọc nhật ký sau này chỉ có nó để hiểu.
 */
const LY_DO_XEM_BAN_DO = 'Mở màn hình tổng quan portal đội xe';

/**
 * Khối nào vai trò không có quyền thì trả null để màn hình hiện lời giải thích, thay vì
 * làm hỏng cả trang. 401 là chuyện khác hẳn: phiên hết hạn → phải đăng nhập lại.
 */
function khoiTuyChon<T>(kq: KetQua<T>): T | null {
  if (kq.ok) return kq.data;
  if (kq.loi.status === 401) redirect('/dang-nhap');
  return null;
}

export default async function TrangTongQuan({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q : '';
  const model = typeof sp.model === 'string' ? sp.model : '';

  const toiKq = await goiApi<ToiLaAi>('/auth/me');
  if (!toiKq.ok) redirect('/dang-nhap');
  const toi = toiKq.data;

  const thamSoXe = new URLSearchParams({ limit: '200' });
  if (q !== '') thamSoXe.set('q', q);
  if (model !== '') thamSoXe.set('model', model);

  // Gọi song song: màn hình tổng quan mà tải tuần tự thì 8h sáng thứ 2 phải ngồi chờ.
  const [xeKq, banDoKq, canhBaoKq, thietBiKq] = await Promise.all([
    goiApi<DanhSachXeData>(`/vehicles?${thamSoXe.toString()}`),
    goiApi<BanDoDoiData>(`/vehicles/map?reason=${encodeURIComponent(LY_DO_XEM_BAN_DO)}`),
    goiApi<DanhSachCanhBao>('/alerts?limit=50'),
    goiApi<SucKhoeThietBi>(`/devices/health?im_lang_qua_giay=${String(IM_LANG_QUA_GIAY)}`),
  ]);

  if (!xeKq.ok && xeKq.loi.status === 401) redirect('/dang-nhap');

  const xe = khoiTuyChon(xeKq);
  const banDo = khoiTuyChon(banDoKq);
  const canhBao = khoiTuyChon(canhBaoKq);
  const thietBi = khoiTuyChon(thietBiKq);

  const soNguyCap = canhBao?.theo_muc_do['3'] ?? 0;
  const soViPham = canhBao?.theo_loai.charging_violation ?? 0;

  return (
    <>
      <ThanhDieuHuong toi={toi} muc="tong-quan" />
      <main className="trang">
        <h1>Tổng quan đội xe</h1>
        <p className="ghi-chu" style={{ marginTop: 0 }}>
          Dữ liệu simulator, 100% giả. Cập nhật mỗi lần tải lại trang.
        </p>

        {/* ---- Bốn con số phải thấy ngay, không cần cuộn ---- */}
        <div className="hang-o-dem">
          <div className="o-dem tot">
            <div className="so">{xe?.total ?? '—'}</div>
            <div className="nhan">Xe trong phạm vi</div>
          </div>
          <div className={`o-dem ${soNguyCap > 0 ? 'canh-bao' : 'tot'}`}>
            <div className="so">{canhBao ? soNguyCap : '—'}</div>
            <div className="nhan">Cảnh báo nguy cấp</div>
          </div>
          <div className={`o-dem ${soViPham > 0 ? 'chu-y' : 'tot'}`}>
            <div className="so">{canhBao ? soViPham : '—'}</div>
            <div className="nhan">Vi phạm sạc chưa xử lý</div>
          </div>
          <div className={`o-dem ${(thietBi?.total ?? 0) > 0 ? 'chu-y' : 'tot'}`}>
            <div className="so">{thietBi?.total ?? '—'}</div>
            <div className="nhan">Thiết bị mất liên lạc</div>
          </div>
        </div>

        {!xeKq.ok && <div className="loi">Không tải được danh sách xe: {xeKq.loi.message}</div>}

        <div className="luoi-tong-quan">
          <div>
            {banDo === null ? (
              <section className="the">
                <h2>Bản đồ đội xe</h2>
                <p className="ghi-chu">
                  {banDoKq.ok
                    ? 'Chưa có dữ liệu vị trí.'
                    : `Không xem được bản đồ: ${banDoKq.loi.message}`}
                </p>
              </section>
            ) : (
              <BanDoDoi diem={banDo.items} />
            )}

            {xe && <DanhSachXe danhSach={xe} q={q} model={model} />}
          </div>

          <KhoiCanhBao canhBao={canhBao} thietBi={thietBi} />
        </div>
      </main>
    </>
  );
}
