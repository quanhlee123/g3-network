// F-E1 — Bản đồ vị trí toàn đội.
//
// ⚠️ CHƯA CÓ NỀN BẢN ĐỒ: quyết định Q5 (VietMap vs Google vs Mapbox) đang MỞ. Vẽ tile của
// một nhà cung cấp lúc này là tự chốt Q5 bằng code (CLAUDE.md cấm) và làm portal phải gọi
// ra Internet (quy tắc 12). Nên lớp nền chỉ là lưới toạ độ tự dựng.
//
// KHI Q5 CHỐT: thay đúng phần <rect> + lưới bên dưới bằng lớp tile của nhà cung cấp được
// chọn; phép chiếu (lib/ban-do.ts) và các ký hiệu xe giữ nguyên.
import type { DiemXe } from '../lib/api';
import { chieuDiem, doTuoiViTri, tinhKhungNhin } from '../lib/ban-do';
import { khoangThoiGian, phanTram } from '../lib/dinh-dang';

const RONG = 800;
const CAO = 460;

const MAU_THEO_TUOI = {
  moi: { to: '#0f7a3d', vien: '#ffffff' },
  cham: { to: '#8a5a00', vien: '#ffffff' },
  cu: { to: '#b3261e', vien: '#ffffff' },
} as const;

const NHAN_THEO_TUOI = {
  moi: 'Đang gửi dữ liệu',
  cham: 'Trễ (sóng yếu?)',
  cu: 'Mất liên lạc >15 phút',
} as const;

export function BanDoDoi({ diem }: { diem: DiemXe[] }) {
  const khung = tinhKhungNhin(diem);
  const demTheoTuoi = { moi: 0, cham: 0, cu: 0 };
  for (const d of diem) demTheoTuoi[doTuoiViTri(d.cu_giay)]++;

  return (
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
        <h2 style={{ marginBottom: 4 }}>Bản đồ đội xe</h2>
        <span className="ghi-chu">{diem.length} xe có vị trí</span>
      </div>

      {diem.length === 0 ? (
        <p className="ghi-chu">
          Chưa xe nào gửi vị trí. Chạy <code>npm run sim:vehicles -- --count 20</code> để bơm dữ
          liệu simulator.
        </p>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${String(RONG)} ${String(CAO)}`}
            style={{ width: '100%', height: 'auto', display: 'block' }}
            role="img"
            aria-label={`Bản đồ ${String(diem.length)} xe trong đội`}
          >
            {/* ---- Lớp nền tạm (thay bằng tile khi Q5 chốt) ---- */}
            <rect x={0} y={0} width={RONG} height={CAO} fill="#eef2f6" rx={8} />
            {Array.from({ length: 9 }, (_, i) => (
              <line
                key={`doc-${String(i)}`}
                x1={(RONG / 8) * i}
                y1={0}
                x2={(RONG / 8) * i}
                y2={CAO}
                stroke="#d6dde5"
                strokeWidth={1}
              />
            ))}
            {Array.from({ length: 6 }, (_, i) => (
              <line
                key={`ngang-${String(i)}`}
                x1={0}
                y1={(CAO / 5) * i}
                x2={RONG}
                y2={(CAO / 5) * i}
                stroke="#d6dde5"
                strokeWidth={1}
              />
            ))}

            {/* ---- Ký hiệu xe ---- */}
            {diem.map((d) => {
              const { x, y } = chieuDiem(d, khung, RONG, CAO);
              const tuoi = doTuoiViTri(d.cu_giay);
              const mau = MAU_THEO_TUOI[tuoi];
              return (
                <g key={d.vehicle_id}>
                  <circle cx={x} cy={y} r={11} fill={mau.to} stroke={mau.vien} strokeWidth={3} />
                  {/* Nhãn VIN ngay cạnh chấm: quản lý đội nhìn màn hình là đọc được xe nào,
                      không phải rê chuột từng chấm (NF-12 — tác vụ chính ≤3 chạm). */}
                  <text
                    x={x + 16}
                    y={y + 5}
                    fontSize={13}
                    fontWeight={600}
                    fill="#111418"
                    stroke="#ffffff"
                    strokeWidth={3}
                    paintOrder="stroke"
                  >
                    {d.vin}
                  </text>
                  <title>
                    {`${d.vin} · SOC ${phanTram(d.soc_pct)} · ${khoangThoiGian(d.cu_giay)}`}
                  </title>
                </g>
              );
            })}

            {/* ---- Nhắc rằng đây chưa phải bản đồ thật ---- */}
            <text x={12} y={CAO - 12} fontSize={12} fill="#5b6570">
              Lưới toạ độ — nền bản đồ chờ quyết định Q5 (nhà cung cấp bản đồ)
            </text>
          </svg>

          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 12 }}>
            {(['moi', 'cham', 'cu'] as const).map((tuoi) => (
              <span
                key={tuoi}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: '0.95rem',
                }}
              >
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: MAU_THEO_TUOI[tuoi].to,
                    display: 'inline-block',
                  }}
                />
                {NHAN_THEO_TUOI[tuoi]}: <strong>{demTheoTuoi[tuoi]}</strong>
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
