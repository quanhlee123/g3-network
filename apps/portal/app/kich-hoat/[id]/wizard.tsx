// F-F2 — Wizard 4 bước, chạy tại chỗ lúc bàn giao xe.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { danhDauHong, ganThietBi, ghiConsent, hoanTat, kiemTraTelemetry } from '../actions';
import {
  CHO_TELEMETRY_TOI_DA_GIAY,
  type PhienKichHoat,
  type VanBanConsent,
} from '../../../lib/api-kich-hoat';

interface TaiXe {
  driver_id: string;
  full_name: string;
  phone: string | null;
  consent_version: string | null;
}

/** Nhịp hỏi lại API xem telemetry về chưa. 3 giây là đủ nhanh để cảm giác "đang chạy". */
const NHIP_HOI_MS = 3000;

function DauTick({ xong }: { xong: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        borderRadius: '50%',
        flexShrink: 0,
        background: xong ? 'var(--luc)' : 'var(--nen-phu)',
        color: xong ? '#fff' : 'var(--chu-phu)',
        border: xong ? 'none' : '2px solid var(--vien)',
        fontWeight: 700,
      }}
    >
      {xong ? '✓' : ''}
    </span>
  );
}

function Buoc({
  so,
  ten,
  xong,
  dangLam,
  children,
}: {
  so: number;
  ten: string;
  xong: boolean;
  dangLam: boolean;
  children?: React.ReactNode;
}) {
  return (
    <section className="the" style={{ marginBottom: 16, opacity: !xong && !dangLam ? 0.55 : 1 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <DauTick xong={xong} />
        <h2 style={{ margin: 0 }}>
          Bước {so}. {ten}
        </h2>
      </div>
      {dangLam && children ? <div style={{ marginTop: 16 }}>{children}</div> : null}
    </section>
  );
}

export function Wizard({
  phienBanDau,
  vanBan,
  taiXe,
}: {
  phienBanDau: PhienKichHoat;
  vanBan: VanBanConsent | null;
  taiXe: TaiXe[];
}) {
  const router = useRouter();
  const [phien, setPhien] = useState(phienBanDau);
  const [loi, setLoi] = useState<string | null>(null);
  const [ghiChu, setGhiChu] = useState<string | null>(null);
  const [dangChay, setDangChay] = useState(false);

  const daGanThietBi = phien.device_id !== null;
  const daConsent = phien.consent_at !== null;
  const daCoTelemetry = phien.telemetry_ok_at !== null;

  // ---- Bước 4: hỏi lại tới khi có dữ liệu hoặc quá 60 giây --------------------------
  const [choGiay, setChoGiay] = useState(0);
  const [quaHan, setQuaHan] = useState(false);
  const dangHoi = useRef(false);

  const hoiTelemetry = useCallback(async () => {
    if (dangHoi.current) return;
    dangHoi.current = true;
    try {
      const kq = await kiemTraTelemetry(phien.id);
      if (kq.ok && kq.data) {
        setChoGiay(kq.data.cho_giay);
        setQuaHan(kq.data.qua_han);
        if (kq.data.da_ve) {
          setPhien((p) => ({ ...p, telemetry_ok_at: kq.data!.ban_ghi_dau_at }));
        }
      }
    } finally {
      dangHoi.current = false;
    }
  }, [phien.id]);

  useEffect(() => {
    // Chỉ hỏi khi đã tới bước 4 và chưa có dữ liệu.
    if (!daConsent || daCoTelemetry) return;
    void hoiTelemetry();
    const t = setInterval(() => {
      void hoiTelemetry();
    }, NHIP_HOI_MS);
    return () => {
      clearInterval(t);
    };
  }, [daConsent, daCoTelemetry, hoiTelemetry]);

  async function chay(viec: () => Promise<{ ok: boolean; message: string; data?: PhienKichHoat }>) {
    setDangChay(true);
    setLoi(null);
    setGhiChu(null);
    try {
      const kq = await viec();
      if (!kq.ok) {
        setLoi(kq.message);
        return;
      }
      if (kq.data) setPhien(kq.data);
      if (kq.message) setGhiChu(kq.message);
    } finally {
      setDangChay(false);
    }
  }

  return (
    <>
      {loi && <div className="loi">{loi}</div>}
      {ghiChu && <div className="thanh-cong">{ghiChu}</div>}

      <Buoc so={1} ten="Nhận VIN" xong dangLam={false} />

      <Buoc
        so={2}
        ten={daGanThietBi ? `Đã gán thiết bị ${phien.device_serial ?? ''}` : 'Gán thiết bị'}
        xong={daGanThietBi}
        dangLam={!daGanThietBi}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            void chay(() =>
              ganThietBi(
                phien.id,
                String(d.get('serial') ?? '').trim(),
                String(d.get('firmware') ?? ''),
                String(d.get('iccid') ?? ''),
              ),
            );
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 16,
            }}
          >
            <div>
              <label htmlFor="serial">Số sê-ri thiết bị (trên tem)</label>
              <input id="serial" name="serial" type="text" required placeholder="G3-DEV-0123" />
            </div>
            <div>
              <label htmlFor="firmware">Phiên bản firmware</label>
              <input id="firmware" name="firmware" type="text" placeholder="1.2.0" />
            </div>
            <div>
              <label htmlFor="iccid">ICCID SIM (số giả)</label>
              <input id="iccid" name="iccid" type="text" placeholder="8984..." />
            </div>
          </div>
          <button type="submit" disabled={dangChay} style={{ marginTop: 16 }}>
            {dangChay ? 'Đang gán…' : 'Gán thiết bị'}
          </button>
        </form>
      </Buoc>

      <Buoc
        so={3}
        ten={
          daConsent
            ? `Tài xế ${phien.consent_driver_name ?? ''} đã đồng ý`
            : 'Tài xế đồng ý xử lý dữ liệu cá nhân'
        }
        xong={daConsent}
        dangLam={daGanThietBi && !daConsent}
      >
        {vanBan === null ? (
          <div className="loi">Không tải được văn bản đồng ý.</div>
        ) : (
          <>
            {vanBan.la_ban_nhap && (
              <div className="loi">
                ⚠️ Đây là <strong>BẢN NHÁP</strong> (quyết định Q7 chưa chốt). Chữ ký thu theo bản
                này <strong>chưa có giá trị pháp lý</strong> và phải thu lại bằng văn bản chính thức
                của Legal trước pilot. Chỉ dùng để chạy thử quy trình trên simulator.
              </div>
            )}
            <h3 style={{ marginBottom: 8 }}>{vanBan.tieu_de}</h3>
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                fontFamily: 'inherit',
                fontSize: '0.95rem',
                background: 'var(--nen-phu)',
                border: '1px solid var(--vien)',
                borderRadius: 8,
                padding: 16,
                maxHeight: 260,
                overflowY: 'auto',
              }}
            >
              {vanBan.noi_dung}
            </pre>
            <p className="ghi-chu">
              Phiên bản văn bản: <code>{vanBan.version}</code>
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const d = new FormData(e.currentTarget);
                void chay(() =>
                  ghiConsent(phien.id, String(d.get('driver_id') ?? ''), vanBan.version),
                );
              }}
            >
              <label htmlFor="driver_id">Tài xế nhận xe</label>
              {taiXe.length === 0 ? (
                <p className="ghi-chu">
                  Đội xe này chưa có tài khoản tài xế nào. Mời tài xế ở màn hình{' '}
                  <strong>Tài khoản</strong> trước, rồi quay lại bước này.
                </p>
              ) : (
                <>
                  <select id="driver_id" name="driver_id" required defaultValue="">
                    <option value="" disabled>
                      — Chọn tài xế —
                    </option>
                    {taiXe.map((t) => (
                      <option key={t.driver_id} value={t.driver_id}>
                        {t.full_name}
                        {t.phone ? ` · ${t.phone}` : ''}
                      </option>
                    ))}
                  </select>
                  <button type="submit" disabled={dangChay} style={{ marginTop: 16 }}>
                    {dangChay ? 'Đang ghi…' : 'Tài xế đã đọc và đồng ý'}
                  </button>
                </>
              )}
            </form>
          </>
        )}
      </Buoc>

      <Buoc
        so={4}
        ten={daCoTelemetry ? 'Dữ liệu telemetry đã về' : 'Chờ dữ liệu telemetry'}
        xong={daCoTelemetry}
        dangLam={daConsent && !daCoTelemetry}
      >
        <p>
          Đang chờ thiết bị gửi bản ghi đầu tiên… <strong>{choGiay}s</strong> / tối đa{' '}
          {CHO_TELEMETRY_TOI_DA_GIAY}s
        </p>
        <div
          style={{
            height: 12,
            background: 'var(--nen-phu)',
            borderRadius: 999,
            overflow: 'hidden',
            border: '1px solid var(--vien)',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${String(Math.min(100, (choGiay / CHO_TELEMETRY_TOI_DA_GIAY) * 100))}%`,
              background: quaHan ? 'var(--do)' : 'var(--xanh)',
            }}
          />
        </div>
        {quaHan && (
          <div className="loi" style={{ marginTop: 16 }}>
            Quá {CHO_TELEMETRY_TOI_DA_GIAY} giây chưa nhận được dữ liệu. Kiểm tra nguồn điện thiết
            bị, ăng-ten và SIM. Không khắc phục được thì ghi nhận thất bại để còn thống kê được
            nguyên nhân.
          </div>
        )}
        <p className="ghi-chu" style={{ marginTop: 12 }}>
          Chỉ tính bản ghi sinh <strong>sau</strong> khi phiên này bắt đầu — dữ liệu cũ của xe không
          làm nên tick xanh.
        </p>
      </Buoc>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 24 }}>
        <button
          type="button"
          disabled={dangChay || !daCoTelemetry || !daConsent || !daGanThietBi}
          onClick={() => {
            void chay(() => hoanTat(phien.id)).then(() => {
              router.refresh();
            });
          }}
        >
          Hoàn tất &amp; in checklist bàn giao
        </button>

        <button
          type="button"
          className="nguy-hiem"
          disabled={dangChay}
          onClick={() => {
            const lyDo = window.prompt(
              'Vì sao kích hoạt thất bại? (ghi lại để thống kê được nguyên nhân)',
            );
            if (lyDo && lyDo.trim().length >= 5) {
              void chay(() => danhDauHong(phien.id, lyDo.trim(), false)).then(() => {
                router.refresh();
              });
            }
          }}
        >
          Ghi nhận thất bại
        </button>

        <button
          type="button"
          className="phu"
          disabled={dangChay}
          onClick={() => {
            const lyDo = window.prompt('Lý do huỷ phiên (vd quét nhầm xe):');
            if (lyDo && lyDo.trim().length >= 5) {
              void chay(() => danhDauHong(phien.id, lyDo.trim(), true)).then(() => {
                router.refresh();
              });
            }
          }}
        >
          Huỷ phiên
        </button>
      </div>
    </>
  );
}
