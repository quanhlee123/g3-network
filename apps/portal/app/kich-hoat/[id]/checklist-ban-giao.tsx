// F-F2 — CHECKLIST BÀN GIAO IN ĐƯỢC.
//
// Đây là tờ giấy tài xế và nhân viên G3 cùng ký lúc nhận xe. Kiểu in nằm ở
// app/globals.css (@media print): ẩn thanh điều hướng và các nút, bỏ khung thẻ, và
// không để một mục bị cắt đôi qua hai trang giấy (.muc-in).
import Link from 'next/link';
import type { PhienKichHoat } from '../../../lib/api-kich-hoat';
import { gioVn } from '../../../lib/dinh-dang';
import { NutIn } from './nut-in';

function Muc({ nhan, giaTri }: { nhan: string; giaTri: React.ReactNode }) {
  return (
    <div
      className="muc-in"
      style={{
        display: 'flex',
        gap: 16,
        padding: '10px 0',
        borderBottom: '1px solid var(--vien)',
      }}
    >
      <div style={{ width: 260, flexShrink: 0, fontWeight: 600 }}>{nhan}</div>
      <div>{giaTri}</div>
    </div>
  );
}

export function ChecklistBanGiao({ phien }: { phien: PhienKichHoat }) {
  return (
    <main className="trang">
      <div className="khong-in" style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <NutIn />
        <Link href="/kich-hoat">
          <button type="button" className="phu">
            Về danh sách kích hoạt
          </button>
        </Link>
      </div>

      <div className="the">
        <h1 style={{ marginBottom: 4 }}>Biên bản bàn giao xe &amp; kích hoạt thiết bị</h1>
        <p className="ghi-chu" style={{ marginTop: 0 }}>
          G3 Network · Phase 1 chạy trên simulator, dữ liệu giả 100%
        </p>

        <h2 style={{ marginTop: 24 }}>1. Xe bàn giao</h2>
        <Muc nhan="Số khung (VIN)" giaTri={<strong>{phien.vin}</strong>} />
        <Muc nhan="Dòng xe" giaTri={phien.model} />
        <Muc nhan="Đơn vị sở hữu" giaTri={phien.customer_name} />

        <h2 style={{ marginTop: 24 }}>2. Thiết bị telematics</h2>
        <Muc nhan="Số sê-ri thiết bị" giaTri={<strong>{phien.device_serial ?? '—'}</strong>} />
        <Muc nhan="Đã gán vào xe" giaTri={phien.device_id ? '✓ Có' : '✗ Chưa'} />

        <h2 style={{ marginTop: 24 }}>3. Đồng ý xử lý dữ liệu cá nhân</h2>
        <Muc nhan="Tài xế nhận xe" giaTri={phien.consent_driver_name ?? '—'} />
        <Muc nhan="Phiên bản văn bản" giaTri={<code>{phien.consent_version ?? '—'}</code>} />
        <Muc nhan="Thời điểm đồng ý" giaTri={phien.consent_at ? gioVn(phien.consent_at) : '—'} />
        {/* Bản nháp thì phải nói ra ngay trên tờ giấy — người ký có quyền biết mình đang
            ký cái gì, và người lưu hồ sơ có quyền biết tờ này chưa đủ căn cứ pháp lý. */}
        {phien.consent_version?.includes('cho-legal') && (
          <p className="loi" style={{ marginTop: 12 }}>
            ⚠️ Văn bản đồng ý đang dùng là BẢN NHÁP (quyết định Q7 chưa chốt). Biên bản này CHƯA có
            giá trị pháp lý về mặt đồng ý xử lý dữ liệu cá nhân — phải thu lại bằng văn bản chính
            thức của bộ phận Legal trước khi vận hành thật.
          </p>
        )}

        <h2 style={{ marginTop: 24 }}>4. Xác nhận dữ liệu thông suốt</h2>
        <Muc
          nhan="Telemetry đã về"
          giaTri={
            phien.telemetry_ok_at ? (
              <>
                ✓ Có — bản ghi đầu lúc {gioVn(phien.telemetry_ok_at)}
                {phien.cho_telemetry_giay !== null && <> (chờ {phien.cho_telemetry_giay} giây)</>}
              </>
            ) : (
              '✗ Chưa'
            )
          }
        />

        <h2 style={{ marginTop: 24 }}>5. Xác nhận</h2>
        <Muc nhan="Nhân viên thực hiện" giaTri={phien.thuc_hien_boi_ten} />
        <Muc nhan="Bắt đầu" giaTri={gioVn(phien.bat_dau_at)} />
        <Muc nhan="Hoàn tất" giaTri={phien.ket_thuc_at ? gioVn(phien.ket_thuc_at) : '—'} />
        <Muc nhan="Mã phiên" giaTri={<code>{phien.id}</code>} />

        <div
          className="muc-in"
          style={{ display: 'flex', gap: 40, marginTop: 48, flexWrap: 'wrap' }}
        >
          <div style={{ flex: '1 1 260px' }}>
            <div style={{ borderTop: '1px solid var(--chu)', paddingTop: 8 }}>
              Tài xế nhận xe (ký, ghi rõ họ tên)
            </div>
          </div>
          <div style={{ flex: '1 1 260px' }}>
            <div style={{ borderTop: '1px solid var(--chu)', paddingTop: 8 }}>
              Nhân viên G3 bàn giao (ký, ghi rõ họ tên)
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
