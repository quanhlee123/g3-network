// F-C6 · NF-10 — Job đối soát 3 chiều: trụ (OCPP) ↔ xe (telematics) ↔ thanh toán.
// Lệch > ngưỡng (mặc định 1%) thì sinh alert 'reconciliation_mismatch'.
//
// Nguyên tắc:
// - Chiều TRỤ là chuẩn tham chiếu: công tơ trong trụ là thiết bị đo được kiểm định.
// - Thiếu dữ liệu KHÔNG phải là lệch. Xe mất sóng giữa phiên (NF-09) mà báo "lệch kWh"
//   là báo động giả — những phiên đó ghi 'thieu_du_lieu' và được đối soát lại ở lần chạy sau
//   khi dữ liệu bù đã về.
// - Chạy lại nhiều lần trên cùng phiên cho cùng kết quả và KHÔNG nhân đôi alert.
import type { Queryable } from '../../db';
import { kwhTuTelematics, lechPhanTram, socTaiThoiDiem, type DiemSoc } from './soc';

export interface ReconcileOptions {
  /** Ngưỡng NF-10 (%). Lệch lớn hơn giá trị này là bất thường. */
  nguongPct: number;
  /** Hiệu suất sạc lưới → pin (0 < e <= 1). Phase 1 = 1.0, xem ADR-007. */
  hieuSuatSac: number;
  /** Đơn giá điện (VNĐ/kWh) để quy số tiền về kWh. Phase 1 là giá GIẢ. */
  giaVndMoiKwh: number;
  /** Bản ghi telemetry xa mốc phiên quá số giây này thì coi như không có. */
  cuaSoSocGiay: number;
  /** Đối soát lại cả những phiên đã có kết quả 'khop'/'lech'. */
  lamLaiTatCa?: boolean;
  /** Giới hạn số phiên mỗi lần chạy. */
  gioiHan?: number;
  log?: (msg: string) => void;
}

export const RECONCILE_DEFAULTS = {
  nguongPct: 1,
  hieuSuatSac: 1,
  giaVndMoiKwh: 3500,
  cuaSoSocGiay: 60,
} as const;

export type TrangThaiDoiSoat = 'khop' | 'lech' | 'thieu_du_lieu';

export interface KetQuaDoiSoat {
  session_id: string;
  vin: string;
  ma_tram: string;
  kwh_tru: number | null;
  kwh_xe: number | null;
  kwh_thanh_toan: number | null;
  so_tien_vnd: number | null;
  lech_xe_pct: number | null;
  lech_tien_pct: number | null;
  lech_max_pct: number | null;
  status: TrangThaiDoiSoat;
  ghi_chu: string | null;
}

export interface TomTatDoiSoat {
  da_xet: number;
  khop: number;
  lech: number;
  thieu_du_lieu: number;
  /** Số phiên KHÔNG đối soát được vì lỗi kỹ thuật — phải bằng 0 khi hệ khỏe mạnh. */
  loi: number;
  ket_qua: KetQuaDoiSoat[];
}

interface PhienCanXet {
  id: string;
  vehicle_id: string;
  station_id: string;
  vin: string;
  ma_tram: string;
  started_at: Date;
  ended_at: Date | null;
  energy_kwh: number | null;
  capacity_kwh: number | null;
}

/** Chạy đối soát cho các phiên sạc thỏa điều kiện. */
export async function chayDoiSoat(
  db: Queryable,
  opts: ReconcileOptions,
  loc: { tuNgay?: string; denNgay?: string; sessionId?: string } = {},
): Promise<TomTatDoiSoat> {
  const log = opts.log ?? (() => {});
  const params: unknown[] = [];
  const dieuKien: string[] = ['cs.ended_at IS NOT NULL'];

  if (loc.sessionId) {
    params.push(loc.sessionId);
    dieuKien.push(`cs.id = $${params.length}`);
  }
  if (loc.tuNgay) {
    params.push(loc.tuNgay);
    dieuKien.push(`cs.started_at >= $${params.length}`);
  }
  if (loc.denNgay) {
    params.push(loc.denNgay);
    dieuKien.push(`cs.started_at <= $${params.length}`);
  }
  if (opts.lamLaiTatCa !== true) {
    // Bỏ qua phiên đã có kết luận; GIỮ LẠI phiên 'thieu_du_lieu' để xét lại khi
    // dữ liệu telemetry bù sau mất sóng đã về (NF-09).
    dieuKien.push(`(r.id IS NULL OR r.status = 'thieu_du_lieu')`);
  }
  params.push(opts.gioiHan ?? 500);

  const phienRes = await db.query(
    `SELECT cs.id, cs.vehicle_id, cs.station_id, v.vin, st.code AS ma_tram,
            cs.started_at, cs.ended_at, cs.energy_kwh::float8 AS energy_kwh,
            b.capacity_kwh::float8 AS capacity_kwh
     FROM charging_sessions cs
     JOIN vehicles v ON v.id = cs.vehicle_id
     JOIN charging_stations st ON st.id = cs.station_id
     LEFT JOIN reconciliation_results r ON r.session_id = cs.id
     LEFT JOIN LATERAL (
       SELECT capacity_kwh FROM batteries b2
       WHERE b2.vehicle_id = cs.vehicle_id ORDER BY b2.created_at DESC LIMIT 1
     ) b ON true
     WHERE ${dieuKien.join(' AND ')}
     ORDER BY cs.started_at
     LIMIT $${params.length}`,
    params,
  );

  const tomTat: TomTatDoiSoat = {
    da_xet: 0,
    khop: 0,
    lech: 0,
    thieu_du_lieu: 0,
    loi: 0,
    ket_qua: [],
  };
  for (const row of phienRes.rows) {
    const phien = row as unknown as PhienCanXet;
    let kq: KetQuaDoiSoat;
    try {
      kq = await doiSoatMotPhien(db, phien, opts);
    } catch (err) {
      // MỘT phiên hỏng KHÔNG được chặn các phiên còn lại: đối soát là hàng rào phát hiện
      // gian lận/hỏng hóc, dừng cả lượt vì một bản ghi xấu là mất luôn hàng rào đó.
      tomTat.loi += 1;
      tomTat.da_xet += 1;
      log(
        `[F-C6] KHÔNG đối soát được phiên ${phien.id} (xe ${phien.vin}): ` +
          `${err instanceof Error ? err.message : String(err)} — bỏ qua, tiếp tục phiên sau`,
      );
      continue;
    }
    tomTat.da_xet += 1;
    tomTat[kq.status] += 1;
    tomTat.ket_qua.push(kq);
    if (kq.status === 'lech') {
      log(
        `[F-C6] LỆCH ${kq.lech_max_pct?.toFixed(2)}% > ${opts.nguongPct}% — phiên ${kq.session_id} ` +
          `(xe ${kq.vin}, trạm ${kq.ma_tram}): trụ ${kq.kwh_tru} kWh · xe ${kq.kwh_xe} kWh · ` +
          `tiền ${kq.kwh_thanh_toan} kWh`,
      );
    }
  }
  return tomTat;
}

async function doiSoatMotPhien(
  db: Queryable,
  phien: PhienCanXet,
  opts: ReconcileOptions,
): Promise<KetQuaDoiSoat> {
  const ket = (
    status: TrangThaiDoiSoat,
    phan: Partial<KetQuaDoiSoat>,
    ghiChu: string | null,
  ): KetQuaDoiSoat => ({
    session_id: phien.id,
    vin: phien.vin,
    ma_tram: phien.ma_tram,
    kwh_tru: phien.energy_kwh,
    kwh_xe: null,
    kwh_thanh_toan: null,
    so_tien_vnd: null,
    lech_xe_pct: null,
    lech_tien_pct: null,
    lech_max_pct: null,
    ...phan,
    status,
    ghi_chu: ghiChu,
  });

  const luuVaTra = async (kq: KetQuaDoiSoat): Promise<KetQuaDoiSoat> => {
    let alertId: string | null = null;
    if (kq.status === 'lech') {
      alertId = await taoAlertLech(db, phien, kq, opts);
    } else if (kq.status === 'khop') {
      // Kết luận có thể ĐỔI từ 'lech' sang 'khop' (vd giao dịch thanh toán còn thiếu về
      // muộn rồi đối soát lại). Cảnh báo cũ phải được đóng, nếu không CSKH cứ thấy mãi
      // một cảnh báo đã hết vấn đề — cùng nguyên tắc vòng đời với cảnh báo pin (ADR-006).
      await dongAlertLech(db, phien.id);
    }
    await luuKetQua(db, phien, kq, opts, alertId);
    return kq;
  };

  if (phien.energy_kwh === null) {
    return luuVaTra(ket('thieu_du_lieu', {}, 'Phiên chưa có số kWh từ trụ'));
  }
  if (phien.capacity_kwh === null || phien.capacity_kwh <= 0) {
    return luuVaTra(
      ket('thieu_du_lieu', {}, 'Xe chưa khai báo dung lượng pin — không quy đổi được ΔSOC'),
    );
  }

  // ---- Chiều XE (telematics) --------------------------------------------------------
  const batDauMs = phien.started_at.getTime();
  const ketThucMs = phien.ended_at!.getTime();
  const cuaSoMs = opts.cuaSoSocGiay * 1000;
  const docRes = await db.query(
    `SELECT time, soc_pct::float8 AS soc_pct FROM telematics_readings
     WHERE vehicle_id = $1 AND soc_pct IS NOT NULL AND time BETWEEN $2 AND $3
     ORDER BY time`,
    [
      phien.vehicle_id,
      new Date(batDauMs - cuaSoMs).toISOString(),
      new Date(ketThucMs + cuaSoMs).toISOString(),
    ],
  );
  const diem: DiemSoc[] = docRes.rows.map((r) => ({
    timeMs: (r.time as Date).getTime(),
    socPct: r.soc_pct as number,
  }));

  const socDau = socTaiThoiDiem(diem, batDauMs, opts.cuaSoSocGiay);
  const socCuoi = socTaiThoiDiem(diem, ketThucMs, opts.cuaSoSocGiay);
  if (!socDau || !socCuoi) {
    return luuVaTra(
      ket(
        'thieu_du_lieu',
        {},
        `Thiếu telemetry quanh mốc phiên (±${opts.cuaSoSocGiay}s) — có thể xe mất sóng (NF-09), ` +
          'sẽ đối soát lại ở lần chạy sau',
      ),
    );
  }
  const kwhXe = kwhTuTelematics(
    socDau.socPct,
    socCuoi.socPct,
    phien.capacity_kwh,
    opts.hieuSuatSac,
  );

  // ---- Chiều TIỀN (payment_transactions) --------------------------------------------
  const tienRes = await db.query(
    `SELECT coalesce(sum(amount_vnd), 0)::float8 AS tong, count(*)::int AS n
     FROM payment_transactions
     WHERE session_id = $1 AND status = 'succeeded'`,
    [phien.id],
  );
  const soGiaoDich = tienRes.rows[0]!.n as number;
  if (soGiaoDich === 0) {
    return luuVaTra(
      ket(
        'thieu_du_lieu',
        { kwh_xe: lam3(kwhXe) },
        'Phiên chưa có giao dịch thanh toán thành công — chưa đối soát được chiều tiền',
      ),
    );
  }
  const soTien = tienRes.rows[0]!.tong as number;
  const kwhTien = soTien / opts.giaVndMoiKwh;

  // ---- So 3 chiều --------------------------------------------------------------------
  const kwhTru = phien.energy_kwh;
  const lechXe = lechPhanTram(kwhXe, kwhTru);
  const lechTien = lechPhanTram(kwhTien, kwhTru);
  const lechMax = Math.max(lechXe, lechTien);
  const status: TrangThaiDoiSoat = lechMax <= opts.nguongPct ? 'khop' : 'lech';

  return luuVaTra(
    ket(
      status,
      {
        kwh_xe: lam3(kwhXe),
        kwh_thanh_toan: lam3(kwhTien),
        so_tien_vnd: Math.round(soTien),
        lech_xe_pct: lam3(lechXe),
        lech_tien_pct: lam3(lechTien),
        lech_max_pct: lam3(lechMax),
      },
      ghiChuKetLuan(status, lechMax, kwhXe, opts.nguongPct),
    ),
  );
}

/**
 * Diễn giải kết luận. SOC GIẢM trong lúc trụ báo đang sạc là tín hiệu riêng, nặng hơn
 * "lệch số": trụ tính tiền năng lượng mà pin không hề nhận (hoặc giờ thiết bị lệch).
 * Ghi rõ ra để người đọc báo cáo không phải tự suy từ con số âm.
 */
function ghiChuKetLuan(
  status: TrangThaiDoiSoat,
  lechMax: number,
  kwhXe: number,
  nguongPct: number,
): string | null {
  if (status !== 'lech') return null;
  const co_ban = `Lệch ${lechMax.toFixed(2)}% vượt ngưỡng ${nguongPct}% (NF-10)`;
  if (kwhXe < 0) {
    return `${co_ban}. SOC xe GIẢM trong khoảng thời gian trụ báo đang sạc — kiểm tra công tơ trụ và giờ thiết bị.`;
  }
  return co_ban;
}

/** Alert cho phiên lệch. Dedup theo phiên: chạy job 10 lần vẫn chỉ 1 cảnh báo. */
async function taoAlertLech(
  db: Queryable,
  phien: PhienCanXet,
  kq: KetQuaDoiSoat,
  opts: ReconcileOptions,
): Promise<string | null> {
  const key = `F-C6:reconcile:${phien.id}`;
  const res = await db.query(
    `INSERT INTO alerts (type, vehicle_id, severity, dedup_key, payload)
     SELECT 'reconciliation_mismatch', $1, 2, $2, $3
     WHERE NOT EXISTS (SELECT 1 FROM alerts WHERE dedup_key = $2)
     RETURNING id`,
    [
      phien.vehicle_id,
      key,
      JSON.stringify({
        session_id: phien.id,
        vin: phien.vin,
        ma_tram: phien.ma_tram,
        kwh_tru: kq.kwh_tru,
        kwh_xe: kq.kwh_xe,
        kwh_thanh_toan: kq.kwh_thanh_toan,
        so_tien_vnd: kq.so_tien_vnd,
        lech_max_pct: kq.lech_max_pct,
        nguong_pct: opts.nguongPct,
      }),
    ],
  );
  if (res.rows[0]) return res.rows[0].id as string;
  const cu = await db.query(`SELECT id FROM alerts WHERE dedup_key = $1`, [key]);
  return (cu.rows[0]?.id as string | undefined) ?? null;
}

/** Đóng cảnh báo lệch của một phiên khi lượt đối soát sau kết luận là khớp. */
async function dongAlertLech(db: Queryable, sessionId: string): Promise<void> {
  await db.query(
    `UPDATE alerts SET status = 'resolved', resolved_at = now()
     WHERE dedup_key = $1 AND status <> 'resolved'`,
    [`F-C6:reconcile:${sessionId}`],
  );
}

async function luuKetQua(
  db: Queryable,
  phien: PhienCanXet,
  kq: KetQuaDoiSoat,
  opts: ReconcileOptions,
  alertId: string | null,
): Promise<void> {
  await db.query(
    `INSERT INTO reconciliation_results
       (session_id, vehicle_id, station_id, kwh_tru, kwh_xe, kwh_thanh_toan, so_tien_vnd,
        lech_xe_pct, lech_tien_pct, lech_max_pct, nguong_pct, status, ghi_chu, alert_id, checked_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now())
     ON CONFLICT (session_id) DO UPDATE SET
       kwh_tru = EXCLUDED.kwh_tru, kwh_xe = EXCLUDED.kwh_xe,
       kwh_thanh_toan = EXCLUDED.kwh_thanh_toan, so_tien_vnd = EXCLUDED.so_tien_vnd,
       lech_xe_pct = EXCLUDED.lech_xe_pct, lech_tien_pct = EXCLUDED.lech_tien_pct,
       lech_max_pct = EXCLUDED.lech_max_pct, nguong_pct = EXCLUDED.nguong_pct,
       status = EXCLUDED.status, ghi_chu = EXCLUDED.ghi_chu,
       alert_id = coalesce(EXCLUDED.alert_id, reconciliation_results.alert_id),
       checked_at = now()`,
    [
      phien.id,
      phien.vehicle_id,
      phien.station_id,
      kq.kwh_tru,
      kq.kwh_xe,
      kq.kwh_thanh_toan,
      kq.so_tien_vnd,
      finite(kq.lech_xe_pct),
      finite(kq.lech_tien_pct),
      finite(kq.lech_max_pct),
      opts.nguongPct,
      kq.status,
      kq.ghi_chu,
      alertId,
    ],
  );
}

function lam3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** numeric của PostgreSQL không nhận Infinity/NaN — quy về NULL (không có số liệu). */
function finite(v: number | null): number | null {
  return v !== null && Number.isFinite(v) ? v : null;
}
