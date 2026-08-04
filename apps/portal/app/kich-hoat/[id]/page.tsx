// F-F2 — Wizard kích hoạt một xe + checklist bàn giao in được.
import { redirect } from 'next/navigation';
import { ThanhDieuHuong } from '../../../components/thanh-dieu-huong';
import { goiApi, type ToiLaAi } from '../../../lib/api';
import type { PhienKichHoat, VanBanConsent } from '../../../lib/api-kich-hoat';
import { ChecklistBanGiao } from './checklist-ban-giao';
import { Wizard } from './wizard';

interface DanhSachTaiXe {
  total: number;
  items: {
    driver_id: string;
    full_name: string;
    phone: string | null;
    consent_version: string | null;
  }[];
}

export default async function TrangPhienKichHoat({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const toiKq = await goiApi<ToiLaAi>('/auth/me');
  if (!toiKq.ok) redirect('/dang-nhap');

  const phienKq = await goiApi<PhienKichHoat>(`/provisioning/${id}`);
  if (!phienKq.ok) {
    if (phienKq.loi.status === 401) redirect('/dang-nhap');
    return (
      <>
        <ThanhDieuHuong toi={toiKq.data} muc="kich-hoat" />
        <main className="trang">
          <div className="loi">{phienKq.loi.message}</div>
        </main>
      </>
    );
  }
  const phien = phienKq.data;

  // Phiên đã xong thì màn hình này CHÍNH LÀ checklist bàn giao — không bày lại wizard.
  if (phien.status === 'thanh_cong') {
    return (
      <>
        <ThanhDieuHuong toi={toiKq.data} muc="kich-hoat" />
        <ChecklistBanGiao phien={phien} />
      </>
    );
  }

  const [vbKq, txKq] = await Promise.all([
    goiApi<VanBanConsent>('/provisioning/consent'),
    goiApi<DanhSachTaiXe>(`/provisioning/${id}/tai-xe`),
  ]);

  return (
    <>
      <ThanhDieuHuong toi={toiKq.data} muc="kich-hoat" />
      <main className="trang">
        <h1>Kích hoạt xe {phien.vin}</h1>
        <p className="ghi-chu" style={{ marginTop: 0 }}>
          {phien.model} · {phien.customer_name} · người thực hiện: {phien.thuc_hien_boi_ten}
        </p>

        {phien.status !== 'dang_lam' ? (
          <div className="loi">
            Phiên này đã kết thúc ({phien.status === 'huy' ? 'đã huỷ' : 'thất bại'}).
            {phien.ly_do_that_bai && <> Lý do: {phien.ly_do_that_bai}</>}
          </div>
        ) : (
          <Wizard
            phienBanDau={phien}
            vanBan={vbKq.ok ? vbKq.data : null}
            taiXe={txKq.ok ? txKq.data.items : []}
          />
        )}
      </main>
    </>
  );
}
