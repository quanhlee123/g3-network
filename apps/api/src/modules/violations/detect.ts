// F-B2 · F-B3 · F-B5 — Đối chiếu phiên sạc ĐÃ ĐÓNG với chính sách, gắn cờ vi phạm kèm
// bằng chứng bất biến, rồi báo cho tài xế/chủ xe.
//
// Vào: phiên sạc do CSMS ghi tại StopTransaction (F-B2, migration 0005 — append-only).
// Ra:  1 dòng violation_checks cho MỌI phiên đã xét (kể cả phiên sạch) + 0..n dòng
//      violations (append-only, NF-11) + cảnh báo F-B5.
//
// Ba nguyên tắc:
//   1. Đối chiếu bằng version chính sách HIỆU LỰC TẠI THỜI ĐIỂM SẠC, không phải bản mới nhất
//      (F-B1, ADR-010). Đây là điều làm cho kết luận còn tái dựng được sau 5 năm.
//   2. Bằng chứng phải tự đứng được: người thứ ba chỉ đọc cột `evidence` là dựng lại được
//      toàn bộ phép so sánh — số của phiên, ngưỡng của chính sách, telemetry quanh phiên,
//      và cách tính. Không ai phải mở lại code hay tra chéo bảng khác.
//   3. Chạy lại nhiều lần cho cùng kết quả và KHÔNG nhân đôi vi phạm. violations không sửa
//      được, nên một dòng thừa là một dòng thừa vĩnh viễn.
//
// KHÔNG LÀM (Q4 trong docs/DECISION-LOG.md còn MỞ): không có chế tài tự động — không trừ
// điểm tuân thủ, không đổi trạng thái bảo hành, không tính phí. Phần mềm chỉ cung cấp bằng
// chứng; chế tài do hợp đồng quyết. Xem docs/adr/ADR-011.
import type { INotifier } from '@g3/contracts';
import type { Queryable } from '../../db';
import {
  chinhSachHieuLuc,
  trongKhungGio,
  MUI_GIO_MAC_DINH,
  type ChinhSachSac,
  type KhungGio,
} from '../policies/policy';
import {
  mucNangCanhBao,
  noiDungCanhBao,
  NGUY_CO_THEO_LOAI,
  type LoaiViPham,
  type SoLieuViPham,
} from './mota';

export type { LoaiViPham } from './mota';

export interface ViPhamOptions {
  /** Múi giờ hiểu khung giờ ToU (F-B1). */
  muiGio: string;
  /** Mặc định toàn hệ cho tiêu chí "thường xuyên" khi chính sách không tự khai. */
  socBreachCount: number;
  socBreachWindowDays: number;
  /** Xét lại cả những phiên đã có kết luận. */
  lamLaiTatCa?: boolean;
  gioiHan?: number;
  /** Số mốc telemetry tối đa nhét vào bằng chứng. */
  soMocTelemetry?: number;
  notifier?: INotifier;
  log?: (msg: string) => void;
}

export const VI_PHAM_DEFAULTS = {
  muiGio: MUI_GIO_MAC_DINH,
  /** ⚠️ CHƯA ai ký hai con số này — xem docs/adr/ADR-011 và Q4 (MỞ). */
  socBreachCount: 3,
  socBreachWindowDays: 30,
  soMocTelemetry: 50,
} as const;

export interface KetQuaKiemTra {
  session_id: string;
  vin: string;
  policy_code: string | null;
  policy_version: number | null;
  vi_pham: LoaiViPham[];
  ghi_chu: string | null;
}

export interface TomTatKiemTra {
  da_xet: number;
  sach: number;
  co_vi_pham: number;
  khong_co_chinh_sach: number;
  /** Phiên không xét được vì lỗi kỹ thuật — phải bằng 0 khi hệ khỏe mạnh. */
  loi: number;
  vi_pham_moi: number;
  ket_qua: KetQuaKiemTra[];
}

interface PhienCanXet {
  id: string;
  vehicle_id: string;
  vin: string;
  ma_tram: string;
  ocpp_connector_id: number;
  ocpp_transaction_id: string | null;
  started_at: Date;
  ended_at: Date;
  energy_kwh: number | null;
  soc_start_pct: number | null;
  soc_end_pct: number | null;
  avg_power_kw: number | null;
  max_power_kw: number | null;
  cost_vnd: number | null;
}

/** Kiểm tra vi phạm cho các phiên sạc đã đóng. */
export async function kiemTraViPham(
  db: Queryable,
  opts: ViPhamOptions,
  loc: { tuNgay?: string; denNgay?: string; sessionId?: string } = {},
): Promise<TomTatKiemTra> {
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
    dieuKien.push('vc.session_id IS NULL');
  }
  params.push(opts.gioiHan ?? 500);

  const res = await db.query(
    `SELECT cs.id, cs.vehicle_id, v.vin, st.code AS ma_tram, cn.ocpp_connector_id,
            cs.ocpp_transaction_id, cs.started_at, cs.ended_at,
            cs.energy_kwh::float8    AS energy_kwh,
            cs.soc_start_pct::float8 AS soc_start_pct,
            cs.soc_end_pct::float8   AS soc_end_pct,
            cs.avg_power_kw::float8  AS avg_power_kw,
            cs.max_power_kw::float8  AS max_power_kw,
            cs.cost_vnd::float8      AS cost_vnd
     FROM charging_sessions cs
     JOIN vehicles v ON v.id = cs.vehicle_id
     JOIN charging_stations st ON st.id = cs.station_id
     JOIN connectors cn ON cn.id = cs.connector_id
     LEFT JOIN violation_checks vc ON vc.session_id = cs.id
     WHERE ${dieuKien.join(' AND ')}
     ORDER BY cs.started_at
     LIMIT $${params.length}`,
    params,
  );

  const tomTat: TomTatKiemTra = {
    da_xet: 0,
    sach: 0,
    co_vi_pham: 0,
    khong_co_chinh_sach: 0,
    loi: 0,
    vi_pham_moi: 0,
    ket_qua: [],
  };

  for (const row of res.rows) {
    const phien = row as unknown as PhienCanXet;
    tomTat.da_xet += 1;
    try {
      const kq = await xetMotPhien(db, phien, opts);
      tomTat.ket_qua.push(kq.ket_qua);
      tomTat.vi_pham_moi += kq.vi_pham_moi;
      if (kq.ket_qua.policy_code === null) tomTat.khong_co_chinh_sach += 1;
      else if (kq.ket_qua.vi_pham.length > 0) tomTat.co_vi_pham += 1;
      else tomTat.sach += 1;
    } catch (err) {
      // Một phiên hỏng KHÔNG được chặn các phiên còn lại — cùng lý do như job đối soát
      // F-C6: đây là hàng rào phát hiện, dừng cả lượt vì một bản ghi xấu là mất hàng rào.
      tomTat.loi += 1;
      log(
        `[F-B3] KHÔNG xét được phiên ${phien.id} (xe ${phien.vin}): ` +
          `${err instanceof Error ? err.message : String(err)} — bỏ qua, tiếp tục phiên sau`,
      );
    }
  }
  return tomTat;
}

async function xetMotPhien(
  db: Queryable,
  phien: PhienCanXet,
  opts: ViPhamOptions,
): Promise<{ ket_qua: KetQuaKiemTra; vi_pham_moi: number }> {
  const log = opts.log ?? (() => {});
  const chinhSach = await chinhSachHieuLuc(db, phien.vehicle_id, phien.started_at);

  if (!chinhSach) {
    await ghiHoSoXet(
      db,
      phien,
      null,
      0,
      false,
      false,
      'Không có chính sách áp dụng tại thời điểm sạc',
    );
    return {
      ket_qua: {
        session_id: phien.id,
        vin: phien.vin,
        policy_code: null,
        policy_version: null,
        vi_pham: [],
        ghi_chu: 'Không có chính sách áp dụng tại thời điểm sạc',
      },
      vi_pham_moi: 0,
    };
  }

  // ---- Sự kiện của RIÊNG phiên này, đối chiếu với version đang hiệu lực lúc đó ----------
  const phutNgoaiKhung = chinhSach.allowed_hours
    ? phutNgoaiKhungGio(phien.started_at, phien.ended_at, chinhSach.allowed_hours, opts.muiGio)
    : 0;
  // Công suất đỉnh do trụ báo qua MeterValues; trụ không gửi Power thì lùi về công suất
  // trung bình — thấp hơn đỉnh thật, tức là kết luận NGHIÊNG VỀ PHÍA CÓ LỢI cho chủ xe.
  const congSuat = phien.max_power_kw ?? phien.avg_power_kw;
  const thoiLuongPhut = (phien.ended_at.getTime() - phien.started_at.getTime()) / 60_000;
  const socTrenMax =
    phien.soc_end_pct !== null &&
    chinhSach.soc_max_pct !== null &&
    phien.soc_end_pct > chinhSach.soc_max_pct;
  const socDuoiMin =
    phien.soc_start_pct !== null &&
    chinhSach.soc_min_pct !== null &&
    phien.soc_start_pct < chinhSach.soc_min_pct;

  // Ghi hồ sơ xét TRƯỚC khi đếm "thường xuyên": phiên hiện tại phải nằm trong phép đếm,
  // nếu không thì lần chạm ngưỡng thứ N không bao giờ kích hoạt được kết luận.
  await ghiHoSoXet(db, phien, chinhSach.id, 0, socTrenMax, socDuoiMin, null);

  const canGanCo: { loai: LoaiViPham; soLieu: SoLieuViPham }[] = [];

  if (phutNgoaiKhung > 0 && chinhSach.allowed_hours) {
    canGanCo.push({
      loai: 'outside_hours',
      soLieu: { khung_gio: chinhSach.allowed_hours, so_phut_ngoai_khung: phutNgoaiKhung },
    });
  }
  if (congSuat !== null && chinhSach.max_power_kw !== null && congSuat > chinhSach.max_power_kw) {
    canGanCo.push({
      loai: 'overpower',
      soLieu: { cong_suat_kw: congSuat, cong_suat_nguong_kw: chinhSach.max_power_kw },
    });
  }
  if (chinhSach.max_duration_minutes !== null && thoiLuongPhut > chinhSach.max_duration_minutes) {
    canGanCo.push({
      loai: 'duration_exceeded',
      soLieu: {
        thoi_luong_phut: thoiLuongPhut,
        thoi_luong_nguong_phut: chinhSach.max_duration_minutes,
      },
    });
  }

  // ---- Tiêu chí "THƯỜNG XUYÊN" (F-B3) --------------------------------------------------
  // Một lần sạc quá 90% KHÔNG phải vi phạm — sheet 4 viết rõ "thường xuyên >90% hoặc <20%".
  // Gắn cờ ngay lần đầu là kết tội oan; chỉ đếm khi hành vi lặp lại mới đúng ý PRD.
  const soLan = soLanNguong(chinhSach, opts);
  const soNgay = soNgayCuaSo(chinhSach, opts);
  for (const [co, loai, socPhien, nguong] of [
    [socTrenMax, 'soc_above_max' as const, phien.soc_end_pct, chinhSach.soc_max_pct],
    [socDuoiMin, 'soc_below_min' as const, phien.soc_start_pct, chinhSach.soc_min_pct],
  ] as const) {
    if (!co) continue;
    const dem = await demLanChamNguong(db, phien, loai, soNgay);
    if (dem < soLan) continue;
    canGanCo.push({
      loai,
      soLieu: {
        soc_pct: socPhien ?? undefined,
        soc_nguong_pct: nguong ?? undefined,
        so_lan: dem,
        so_lan_nguong: soLan,
        so_ngay_cua_so: soNgay,
      },
    });
  }

  // ---- Ghi vi phạm + báo cho người (F-B5) ----------------------------------------------
  let viPhamMoi = 0;
  for (const { loai, soLieu } of canGanCo) {
    const daGhi = await ghiViPham(db, phien, chinhSach, loai, soLieu, opts);
    if (daGhi) {
      viPhamMoi += 1;
      log(
        `[F-B3] xe ${phien.vin} vi phạm "${loai}" tại phiên ${phien.id} ` +
          `(chính sách ${chinhSach.code} v${chinhSach.version})`,
      );
    }
  }

  await capNhatSoViPham(db, phien.id, canGanCo.length);

  return {
    ket_qua: {
      session_id: phien.id,
      vin: phien.vin,
      policy_code: chinhSach.code,
      policy_version: chinhSach.version,
      vi_pham: canGanCo.map((v) => v.loai),
      ghi_chu: null,
    },
    vi_pham_moi: viPhamMoi,
  };
}

/**
 * Số phút của phiên nằm NGOÀI mọi khung giờ cho phép.
 *
 * Duyệt từng phút thay vì tính giao khoảng: khung giờ có thể qua nửa đêm, có thể nhiều khung
 * rời nhau, và phiên có thể kéo qua nhiều ngày — công thức giao khoảng cho ba thứ đó cùng lúc
 * dễ sai ở biên hơn nhiều so với một vòng lặp đọc phát hiểu ngay. Phiên dài nhất thực tế là
 * vài giờ, trần 48h chỉ để chặn dữ liệu rác không làm treo job.
 */
export function phutNgoaiKhungGio(
  batDau: Date,
  ketThuc: Date,
  khung: KhungGio[],
  muiGio: string,
  tranPhut = 48 * 60,
): number {
  const tongPhut = Math.min(Math.ceil((ketThuc.getTime() - batDau.getTime()) / 60_000), tranPhut);
  let ngoai = 0;
  for (let i = 0; i < tongPhut; i++) {
    if (!trongKhungGio(new Date(batDau.getTime() + i * 60_000), khung, muiGio)) ngoai += 1;
  }
  return ngoai;
}

/** Ngưỡng "thường xuyên": chính sách tự khai thì theo hợp đồng, không thì theo mặc định hệ. */
function soLanNguong(cs: ChinhSachSac, opts: ViPhamOptions): number {
  return cs.soc_breach_count ?? opts.socBreachCount;
}
function soNgayCuaSo(cs: ChinhSachSac, opts: ViPhamOptions): number {
  return cs.soc_breach_window_days ?? opts.socBreachWindowDays;
}

/** Đếm số phiên của xe CHẠM cùng loại ngưỡng SOC trong cửa sổ, tính tới hết phiên đang xét. */
async function demLanChamNguong(
  db: Queryable,
  phien: PhienCanXet,
  loai: 'soc_above_max' | 'soc_below_min',
  soNgay: number,
): Promise<number> {
  const cot = loai === 'soc_above_max' ? 'soc_tren_max' : 'soc_duoi_min';
  const res = await db.query(
    `SELECT count(*)::int AS n FROM violation_checks
     WHERE vehicle_id = $1 AND ${cot}
       AND started_at <= $2::timestamptz
       AND started_at > $2::timestamptz - ($3::int * interval '1 day')`,
    [phien.vehicle_id, phien.started_at.toISOString(), soNgay],
  );
  return res.rows[0]!.n as number;
}

/**
 * Ghi 1 dòng vi phạm + cảnh báo F-B5. Trả về false nếu vi phạm này đã được ghi trước đó
 * (chạy lại job), hoặc nếu loại "thường xuyên" đã được kết luận trong cửa sổ.
 */
async function ghiViPham(
  db: Queryable,
  phien: PhienCanXet,
  chinhSach: ChinhSachSac,
  loai: LoaiViPham,
  soLieu: SoLieuViPham,
  opts: ViPhamOptions,
): Promise<boolean> {
  // Vi phạm theo TẦN SUẤT nói về một GIAI ĐOẠN, không phải về một phiên. Nếu mỗi phiên tiếp
  // theo trong cửa sổ lại đẻ thêm một dòng thì hồ sơ bảo hành đầy bản sao của cùng một kết
  // luận, và tài xế bị bắn cảnh báo mỗi lần sạc. Chốt 1 lần / xe / loại / cửa sổ — cùng
  // nguyên tắc vòng đời cảnh báo của ADR-006.
  if (loai === 'soc_above_max' || loai === 'soc_below_min') {
    const soNgay = soNgayCuaSo(chinhSach, opts);
    const daCo = await db.query(
      `SELECT 1 FROM violations
       WHERE vehicle_id = $1 AND type = $2::violation_type
         AND detected_at > $3::timestamptz - ($4::int * interval '1 day')
       LIMIT 1`,
      [phien.vehicle_id, loai, phien.started_at.toISOString(), soNgay],
    );
    if ((daCo.rowCount ?? 0) > 0) return false;
  }

  const noiDung = noiDungCanhBao(loai, soLieu, phien.vin);
  const evidence = await dungBangChung(db, phien, chinhSach, loai, soLieu, noiDung, opts);

  const res = await db.query(
    `INSERT INTO violations (vehicle_id, policy_id, session_id, type, evidence, risk_level, detected_at)
     SELECT $1, $2, $3, $4::violation_type, $5::jsonb, $6::risk_level, now()
     WHERE NOT EXISTS (
       SELECT 1 FROM violations WHERE session_id = $3 AND type = $4::violation_type
     )
     RETURNING id`,
    [
      phien.vehicle_id,
      chinhSach.id,
      phien.id,
      loai,
      JSON.stringify(evidence),
      NGUY_CO_THEO_LOAI[loai],
    ],
  );
  const violationId = res.rows[0]?.id as string | undefined;
  if (!violationId) return false; // đã ghi ở lượt chạy trước

  const severity = mucNangCanhBao(loai);
  const alertRes = await db.query(
    `INSERT INTO alerts (type, vehicle_id, severity, dedup_key, payload)
     SELECT 'charging_violation', $1, $2, $3, $4::jsonb
     WHERE NOT EXISTS (SELECT 1 FROM alerts WHERE dedup_key = $3)
     RETURNING id`,
    [
      phien.vehicle_id,
      severity,
      `F-B5:${phien.id}:${loai}`,
      JSON.stringify({
        violation_id: violationId,
        session_id: phien.id,
        vin: phien.vin,
        loai,
        chinh_sach: `${chinhSach.code} v${chinhSach.version}`,
        hanh_vi: noiDung.hanh_vi,
        khac_phuc: noiDung.khac_phuc,
      }),
    ],
  );
  const alertId = (alertRes.rows[0]?.id as string | undefined) ?? null;

  if (opts.notifier) {
    // notify() có hợp đồng KHÔNG ĐƯỢC NÉM LỖI (contracts/notifier.ts) — nhà cung cấp push
    // chết cũng không được làm hỏng việc đã ghi vi phạm vào hồ sơ.
    await opts.notifier.notify({
      alert_type: 'charging_violation',
      severity,
      title: noiDung.tieu_de,
      body: `${noiDung.hanh_vi} ${noiDung.khac_phuc}`,
      vehicle_id: phien.vehicle_id,
      alert_id: alertId,
      data: {
        violation_id: violationId,
        session_id: phien.id,
        loai,
        khac_phuc: noiDung.khac_phuc,
      },
    });
  }
  return true;
}

/**
 * Bằng chứng BẤT BIẾN (NF-11) — đủ để người thứ ba dựng lại kết luận mà không cần mở code,
 * không cần tra bảng khác, và không phụ thuộc vào việc chính sách sau này có đổi hay không.
 *
 * Vì sao chép cả ngưỡng chính sách vào đây trong khi đã có policy_id: khoá ngoại chỉ chứng
 * minh "đã trỏ tới version nào", còn bản sao ngưỡng chứng minh "lúc kết luận, ngưỡng đọc ra
 * đúng là con số này". Hai điều đó chỉ khác nhau khi có tranh chấp — tức là đúng lúc cần.
 */
async function dungBangChung(
  db: Queryable,
  phien: PhienCanXet,
  chinhSach: ChinhSachSac,
  loai: LoaiViPham,
  soLieu: SoLieuViPham,
  noiDung: { tieu_de: string; hanh_vi: string; khac_phuc: string },
  opts: ViPhamOptions,
): Promise<Record<string, unknown>> {
  const telemetry = await telemetryQuanhPhien(db, phien, opts.soMocTelemetry ?? 50);
  return {
    ket_luan: {
      loai,
      mo_ta: noiDung.hanh_vi,
      khuyen_nghi: noiDung.khac_phuc,
      muc_nguy_co: NGUY_CO_THEO_LOAI[loai],
      so_lieu: soLieu,
    },
    phien_sac: {
      id: phien.id,
      vin: phien.vin,
      ma_tram: phien.ma_tram,
      ocpp_connector_id: phien.ocpp_connector_id,
      ocpp_transaction_id: phien.ocpp_transaction_id,
      started_at: phien.started_at.toISOString(),
      ended_at: phien.ended_at.toISOString(),
      thoi_luong_phut:
        Math.round(((phien.ended_at.getTime() - phien.started_at.getTime()) / 60_000) * 10) / 10,
      energy_kwh: phien.energy_kwh,
      soc_start_pct: phien.soc_start_pct,
      soc_end_pct: phien.soc_end_pct,
      avg_power_kw: phien.avg_power_kw,
      max_power_kw: phien.max_power_kw,
      cost_vnd: phien.cost_vnd,
    },
    chinh_sach: {
      id: chinhSach.id,
      code: chinhSach.code,
      version: chinhSach.version,
      name: chinhSach.name,
      scope_type: chinhSach.scope_type,
      effective_from: chinhSach.effective_from,
      allowed_hours: chinhSach.allowed_hours,
      soc_min_pct: chinhSach.soc_min_pct,
      soc_max_pct: chinhSach.soc_max_pct,
      max_power_kw: chinhSach.max_power_kw,
      max_duration_minutes: chinhSach.max_duration_minutes,
    },
    telemetry_lien_quan: telemetry,
    cach_tinh: {
      mui_gio_khung_gio: opts.muiGio,
      nguon_cong_suat: phien.max_power_kw !== null ? 'max_power_kw (MeterValues)' : 'avg_power_kw',
      so_lan_nguong: soLieu.so_lan_nguong ?? null,
      so_ngay_cua_so: soLieu.so_ngay_cua_so ?? null,
      ghi_chu:
        'Chính sách được chọn theo thời điểm BẮT ĐẦU phiên sạc, dùng version hiệu lực lúc đó (F-B1).',
    },
    ghi_nhan_luc: new Date().toISOString(),
  };
}

/** Mốc SOC trong phiên, lấy thưa đều để bằng chứng đọc được mà vẫn dựng lại được đường SOC. */
async function telemetryQuanhPhien(
  db: Queryable,
  phien: PhienCanXet,
  soMoc: number,
): Promise<{ time: string; soc_pct: number | null }[]> {
  const res = await db.query(
    `SELECT time, soc_pct::float8 AS soc_pct FROM telematics_readings
     WHERE vehicle_id = $1 AND time BETWEEN $2 AND $3
     ORDER BY time`,
    [phien.vehicle_id, phien.started_at.toISOString(), phien.ended_at.toISOString()],
  );
  const rows = res.rows;
  if (rows.length <= soMoc) {
    return rows.map((r) => ({
      time: (r.time as Date).toISOString(),
      soc_pct: r.soc_pct as number | null,
    }));
  }
  const buoc = (rows.length - 1) / (soMoc - 1);
  const ra: { time: string; soc_pct: number | null }[] = [];
  for (let i = 0; i < soMoc; i++) {
    const r = rows[Math.round(i * buoc)]!;
    ra.push({ time: (r.time as Date).toISOString(), soc_pct: r.soc_pct as number | null });
  }
  return ra;
}

async function ghiHoSoXet(
  db: Queryable,
  phien: PhienCanXet,
  policyId: string | null,
  soViPham: number,
  socTrenMax: boolean,
  socDuoiMin: boolean,
  ghiChu: string | null,
): Promise<void> {
  await db.query(
    `INSERT INTO violation_checks
       (session_id, vehicle_id, policy_id, started_at, so_vi_pham, soc_tren_max, soc_duoi_min, ghi_chu, checked_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
     ON CONFLICT (session_id) DO UPDATE SET
       policy_id = EXCLUDED.policy_id, so_vi_pham = EXCLUDED.so_vi_pham,
       soc_tren_max = EXCLUDED.soc_tren_max, soc_duoi_min = EXCLUDED.soc_duoi_min,
       ghi_chu = EXCLUDED.ghi_chu, checked_at = now()`,
    [
      phien.id,
      phien.vehicle_id,
      policyId,
      phien.started_at.toISOString(),
      soViPham,
      socTrenMax,
      socDuoiMin,
      ghiChu,
    ],
  );
}

async function capNhatSoViPham(db: Queryable, sessionId: string, soViPham: number): Promise<void> {
  await db.query(`UPDATE violation_checks SET so_vi_pham = $2 WHERE session_id = $1`, [
    sessionId,
    soViPham,
  ]);
}
