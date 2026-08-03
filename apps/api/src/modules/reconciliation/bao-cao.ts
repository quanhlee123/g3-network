// F-C6 · NF-10 — Hai báo cáo dựng trên cùng bộ dữ liệu phiên sạc:
//
//   1. SẢN LƯỢNG kWh theo khách hàng / theo phiên — phục vụ hoá đơn (F-H3) và đối soát
//      với khách (sheet 4 F-C6: "kWh theo khách/phiên phục vụ hóa đơn & đối soát").
//   2. BÁO CÁO LỆCH THEO NGÀY — nâng cấp job đối soát của Prompt 06: trước đây chỉ có kết
//      quả từng phiên, nên câu hỏi vận hành thật sự ("hôm qua có ngày nào bất thường không")
//      phải tự cộng bằng tay.
//
// Hai báo cáo dùng CHUNG một định nghĩa "phiên thuộc kỳ nào": theo `ended_at`, tức phiên
// kết thúc lúc 00:30 ngày 2 thuộc về ngày 2 dù bắt đầu từ ngày 1. Kế toán chốt sổ theo lúc
// điện đã bán xong, không theo lúc bắt đầu bơm.
import type { Queryable } from '../../db';

/** Một dòng sản lượng theo khách hàng. */
export interface DongSanLuong {
  customer_id: string | null;
  ten_khach: string | null;
  so_hop_dong: string | null;
  so_phien: number;
  kwh: number;
  so_tien_vnd: number;
  so_xe: number;
}

/** Một dòng sản lượng theo phiên (mức chi tiết nhất — đính kèm hoá đơn). */
export interface DongSanLuongPhien {
  session_id: string;
  vin: string;
  customer_id: string | null;
  ten_khach: string | null;
  ma_tram: string;
  ended_at: string;
  kwh: number;
  so_tien_vnd: number;
  trang_thai_doi_soat: string | null;
  lech_max_pct: number | null;
}

export interface BaoCaoSanLuong {
  tu_ngay: string | null;
  den_ngay: string | null;
  tong_kwh: number;
  tong_tien_vnd: number;
  tong_phien: number;
  theo_khach: DongSanLuong[];
}

/**
 * Sản lượng theo khách hàng.
 *
 * Số tiền lấy từ giao dịch đã `succeeded`, KHÔNG lấy từ `charging_sessions.cost_vnd`:
 * cột đó là giá tạm tính lúc đóng phiên, còn cái đưa vào hoá đơn phải là tiền thực thu.
 * Hai số này lệch nhau chính là thứ mà đối soát 3 chiều sinh ra để phát hiện.
 */
export async function sanLuongTheoKhach(db: Queryable, loc: LocKy): Promise<BaoCaoSanLuong> {
  const { where, params } = dieuKienKy(loc);
  const res = await db.query(
    `SELECT v.customer_id,
            kh.name        AS ten_khach,
            kh.contract_no AS so_hop_dong,
            count(DISTINCT cs.id)::int         AS so_phien,
            count(DISTINCT cs.vehicle_id)::int AS so_xe,
            coalesce(sum(cs.energy_kwh), 0)::float8 AS kwh,
            coalesce(sum(tt.tien), 0)::float8       AS so_tien_vnd
     FROM charging_sessions cs
     JOIN vehicles v ON v.id = cs.vehicle_id
     LEFT JOIN customers kh ON kh.id = v.customer_id
     LEFT JOIN LATERAL (
       SELECT coalesce(sum(p.amount_vnd), 0) AS tien
       FROM payment_transactions p
       WHERE p.session_id = cs.id AND p.status = 'succeeded'
     ) tt ON true
     WHERE ${where}
     GROUP BY v.customer_id, kh.name, kh.contract_no
     ORDER BY kwh DESC`,
    params,
  );

  const theoKhach = res.rows.map((r) => ({
    customer_id: (r.customer_id as string | null) ?? null,
    ten_khach: (r.ten_khach as string | null) ?? null,
    so_hop_dong: (r.so_hop_dong as string | null) ?? null,
    so_phien: r.so_phien as number,
    so_xe: r.so_xe as number,
    kwh: lam3(r.kwh as number),
    so_tien_vnd: Math.round(r.so_tien_vnd as number),
  }));

  return {
    tu_ngay: loc.tuNgay ?? null,
    den_ngay: loc.denNgay ?? null,
    tong_kwh: lam3(theoKhach.reduce((t, d) => t + d.kwh, 0)),
    tong_tien_vnd: theoKhach.reduce((t, d) => t + d.so_tien_vnd, 0),
    tong_phien: theoKhach.reduce((t, d) => t + d.so_phien, 0),
    theo_khach: theoKhach,
  };
}

/** Sản lượng chi tiết theo từng phiên, kèm kết luận đối soát của phiên đó. */
export async function sanLuongTheoPhien(
  db: Queryable,
  loc: LocKy,
  gioiHan = 500,
): Promise<DongSanLuongPhien[]> {
  const { where, params } = dieuKienKy(loc);
  const res = await db.query(
    `SELECT cs.id AS session_id, v.vin, v.customer_id, kh.name AS ten_khach,
            st.code AS ma_tram, cs.ended_at,
            cs.energy_kwh::float8 AS kwh,
            coalesce(tt.tien, 0)::float8 AS so_tien_vnd,
            r.status::text AS trang_thai_doi_soat,
            r.lech_max_pct::float8 AS lech_max_pct
     FROM charging_sessions cs
     JOIN vehicles v ON v.id = cs.vehicle_id
     JOIN charging_stations st ON st.id = cs.station_id
     LEFT JOIN customers kh ON kh.id = v.customer_id
     LEFT JOIN reconciliation_results r ON r.session_id = cs.id
     LEFT JOIN LATERAL (
       SELECT coalesce(sum(p.amount_vnd), 0) AS tien
       FROM payment_transactions p
       WHERE p.session_id = cs.id AND p.status = 'succeeded'
     ) tt ON true
     WHERE ${where}
     ORDER BY cs.ended_at DESC
     LIMIT $${params.length + 1}`,
    [...params, gioiHan],
  );
  return res.rows.map((r) => ({
    session_id: r.session_id as string,
    vin: r.vin as string,
    customer_id: (r.customer_id as string | null) ?? null,
    ten_khach: (r.ten_khach as string | null) ?? null,
    ma_tram: r.ma_tram as string,
    ended_at: (r.ended_at as Date).toISOString(),
    kwh: lam3((r.kwh as number | null) ?? 0),
    so_tien_vnd: Math.round(r.so_tien_vnd as number),
    trang_thai_doi_soat: (r.trang_thai_doi_soat as string | null) ?? null,
    lech_max_pct: (r.lech_max_pct as number | null) ?? null,
  }));
}

export interface DongLechNgay {
  ngay: string;
  so_phien: number;
  khop: number;
  lech: number;
  thieu_du_lieu: number;
  chua_doi_soat: number;
  kwh_tru: number;
  kwh_xe: number;
  kwh_thanh_toan: number;
  /** Lệch của TỔNG trong ngày (%) — khác với lệch lớn nhất của một phiên. */
  lech_tong_pct: number | null;
  lech_max_phien_pct: number | null;
  /** Ngày này có cần người xem không: có phiên lệch, hoặc tổng ngày vượt ngưỡng. */
  can_xem_lai: boolean;
}

/**
 * Báo cáo lệch THEO NGÀY (nâng cấp job đối soát của Prompt 06).
 *
 * Vì sao có cả `lech_tong_pct` lẫn `lech_max_phien_pct`: hai con số bắt hai loại vấn đề
 * khác nhau và không thay thế được cho nhau.
 *   - `lech_max_phien_pct` bắt SỰ CỐ ĐƠN LẺ: một phiên lệch 40% giữa 200 phiên khớp.
 *   - `lech_tong_pct` bắt SAI LỆCH HỆ THỐNG: mọi phiên lệch 0,9% (dưới ngưỡng, không phiên
 *     nào bị gắn cờ) nhưng cùng một chiều, cộng cả ngày thành khoản tiền thật. Công tơ lệch
 *     chuẩn hay hệ số hiệu suất sai (ADR-007) trông đúng như thế này.
 */
export async function baoCaoLechTheoNgay(
  db: Queryable,
  opts: LocKy & { nguongPct: number },
): Promise<DongLechNgay[]> {
  const { where, params } = dieuKienKy(opts);
  const res = await db.query(
    `SELECT to_char(date_trunc('day', cs.ended_at), 'YYYY-MM-DD') AS ngay,
            count(*)::int                                              AS so_phien,
            count(*) FILTER (WHERE r.status = 'khop')::int              AS khop,
            count(*) FILTER (WHERE r.status = 'lech')::int              AS lech,
            count(*) FILTER (WHERE r.status = 'thieu_du_lieu')::int     AS thieu_du_lieu,
            count(*) FILTER (WHERE r.id IS NULL)::int                   AS chua_doi_soat,
            coalesce(sum(r.kwh_tru), 0)::float8         AS kwh_tru,
            coalesce(sum(r.kwh_xe), 0)::float8          AS kwh_xe,
            coalesce(sum(r.kwh_thanh_toan), 0)::float8  AS kwh_thanh_toan,
            max(r.lech_max_pct)::float8                 AS lech_max_phien_pct
     FROM charging_sessions cs
     JOIN vehicles v ON v.id = cs.vehicle_id
     LEFT JOIN reconciliation_results r ON r.session_id = cs.id
     WHERE ${where}
     GROUP BY 1
     ORDER BY 1 DESC`,
    params,
  );

  return res.rows.map((r) => {
    const kwhTru = r.kwh_tru as number;
    const kwhXe = r.kwh_xe as number;
    const kwhTien = r.kwh_thanh_toan as number;
    const lechTong =
      kwhTru > 0
        ? Math.max(
            (Math.abs(kwhXe - kwhTru) / kwhTru) * 100,
            (Math.abs(kwhTien - kwhTru) / kwhTru) * 100,
          )
        : null;
    const lechMaxPhien = (r.lech_max_phien_pct as number | null) ?? null;
    return {
      ngay: r.ngay as string,
      so_phien: r.so_phien as number,
      khop: r.khop as number,
      lech: r.lech as number,
      thieu_du_lieu: r.thieu_du_lieu as number,
      chua_doi_soat: r.chua_doi_soat as number,
      kwh_tru: lam3(kwhTru),
      kwh_xe: lam3(kwhXe),
      kwh_thanh_toan: lam3(kwhTien),
      lech_tong_pct: lechTong === null ? null : lam3(lechTong),
      lech_max_phien_pct: lechMaxPhien === null ? null : lam3(lechMaxPhien),
      can_xem_lai: (r.lech as number) > 0 || (lechTong !== null && lechTong > opts.nguongPct),
    };
  });
}

/** Phạm vi dữ liệu theo vai trò, đã tham số hoá sẵn (xem auth/scope.ts). */
export interface PhamViBaoCao {
  sql: string;
  params: unknown[];
}

export interface LocKy {
  tuNgay?: string;
  denNgay?: string;
  customerId?: string;
  /**
   * Mệnh đề phạm vi ĐÃ THAM SỐ HOÁ, dựng bằng `vehicleScopeClause(auth, 'v', 1)` — tham số
   * của nó luôn đứng ĐẦU danh sách. Không nhận chuỗi SQL tự do ở đây: báo cáo sản lượng
   * chạm dữ liệu doanh thu của nhiều khách hàng cùng lúc, nên chỗ ghép câu phải là chỗ
   * không thể nhét thêm điều kiện từ ngoài vào.
   */
  phamVi?: PhamViBaoCao;
}

/**
 * Điều kiện chọn phiên của một kỳ. Chỉ tính phiên ĐÃ ĐÓNG: phiên đang sạc chưa có kWh
 * cuối cùng, đưa vào báo cáo là báo doanh thu của điện chưa bán xong.
 */
function dieuKienKy(loc: LocKy): { where: string; params: unknown[] } {
  const params: unknown[] = [...(loc.phamVi?.params ?? [])];
  const dieuKien = ['cs.ended_at IS NOT NULL'];
  if (loc.phamVi) dieuKien.push(`(${loc.phamVi.sql})`);
  if (loc.tuNgay) {
    params.push(loc.tuNgay);
    dieuKien.push(`cs.ended_at >= $${params.length}`);
  }
  if (loc.denNgay) {
    params.push(loc.denNgay);
    dieuKien.push(`cs.ended_at <= $${params.length}`);
  }
  if (loc.customerId) {
    params.push(loc.customerId);
    dieuKien.push(`v.customer_id = $${params.length}`);
  }
  return { where: dieuKien.join(' AND '), params };
}

function lam3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
