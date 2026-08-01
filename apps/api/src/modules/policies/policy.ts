// F-B1 — Chính sách sạc bảo hành có version (sheet 8: ChargingPolicy).
//
// Hai câu hỏi mà module này trả lời, và chúng KHÁC NHAU:
//   1. "Cấu hình hiện tại của mã chính sách X là gì?"  → version mới nhất
//   2. "Phiên sạc lúc 03:14 ngày 12/06 bị đối chiếu với ngưỡng nào?" → version ĐANG TRỊ VÌ
//      tại đúng thời điểm đó, kể cả khi sau đó chính sách đã đổi 5 lần nữa
//
// Câu 2 mới là câu có giá trị pháp lý (F-B3, NF-11): kết luận vi phạm ghi hôm nay phải
// tái dựng được nguyên vẹn sau 5 năm, khi ngưỡng đã khác hẳn.
import type { Queryable } from '../../db';

/** Một khung giờ được phép sạc, giờ ĐỊA PHƯƠNG. `to` nhỏ hơn `from` = khung qua nửa đêm. */
export interface KhungGio {
  from: string; // "HH:MM"
  to: string; // "HH:MM"
}

export type PhamViChinhSach = 'vehicle' | 'fleet' | 'model';

export interface ChinhSachSac {
  id: string;
  code: string;
  version: number;
  name: string;
  scope_type: PhamViChinhSach;
  vehicle_id: string | null;
  customer_id: string | null;
  vehicle_model: string | null;
  soc_min_pct: number | null;
  soc_max_pct: number | null;
  allowed_hours: KhungGio[] | null;
  max_power_kw: number | null;
  max_duration_minutes: number | null;
  max_sessions_per_day: number | null;
  effective_from: string;
  effective_to: string | null;
  change_note: string | null;
  created_by: string | null;
  supersedes_id: string | null;
  created_at: string;
}

/**
 * Múi giờ dùng để hiểu khung giờ ToU. Khung giờ trong hợp đồng bảo hành là giờ Việt Nam,
 * còn timestamptz trong DB là UTC — thiếu bước quy đổi này thì "cấm sạc 06:00–22:00"
 * lệch đúng 7 tiếng và hệ thống gắn cờ sai toàn bộ. Đổi được qua env APP_TIMEZONE.
 */
export const MUI_GIO_MAC_DINH = 'Asia/Ho_Chi_Minh';

const RE_HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Đổi "HH:MM" thành số phút kể từ 00:00; ném lỗi nếu sai định dạng. */
export function phutTrongNgay(hhmm: string): number {
  const m = RE_HHMM.exec(hhmm);
  if (!m) throw new Error(`Khung giờ "${hhmm}" sai định dạng, cần HH:MM (00:00–23:59)`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Kiểm tra danh sách khung giờ; trả về thông báo lỗi tiếng Việt hoặc null nếu hợp lệ. */
export function kiemTraKhungGio(khung: KhungGio[]): string | null {
  if (khung.length === 0)
    return 'Danh sách khung giờ rỗng — bỏ trống allowed_hours nghĩa là mọi giờ';
  for (const k of khung) {
    let from: number;
    let to: number;
    try {
      from = phutTrongNgay(k.from);
      to = phutTrongNgay(k.to);
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
    if (from === to) {
      return `Khung giờ ${k.from}–${k.to} có điểm đầu trùng điểm cuối (độ dài 0)`;
    }
  }
  return null;
}

/** Số phút kể từ nửa đêm ĐỊA PHƯƠNG của một mốc thời gian. */
export function phutDiaPhuong(at: Date, muiGio: string = MUI_GIO_MAC_DINH): number {
  const dinhDang = new Intl.DateTimeFormat('en-GB', {
    timeZone: muiGio,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  });
  const phan = dinhDang.formatToParts(at);
  const gio = Number(phan.find((p) => p.type === 'hour')?.value ?? '0');
  const phut = Number(phan.find((p) => p.type === 'minute')?.value ?? '0');
  return gio * 60 + phut;
}

/** Mốc thời gian có nằm trong ÍT NHẤT một khung giờ cho phép hay không. */
export function trongKhungGio(
  at: Date,
  khung: KhungGio[],
  muiGio: string = MUI_GIO_MAC_DINH,
): boolean {
  const phut = phutDiaPhuong(at, muiGio);
  return khung.some((k) => {
    const from = phutTrongNgay(k.from);
    const to = phutTrongNgay(k.to);
    // Khung qua nửa đêm (vd 22:00–06:00) là HAI đoạn: [22:00, 24:00) và [00:00, 06:00)
    return from < to ? phut >= from && phut < to : phut >= from || phut < to;
  });
}

/** Mô tả khung giờ cho người đọc — dùng trong nội dung cảnh báo F-B5. */
export function moTaKhungGio(khung: KhungGio[]): string {
  return khung.map((k) => `${k.from}–${k.to}`).join(', ');
}

const COT_CHINH_SACH = `
  p.id, p.code, p.version, p.name, p.scope_type::text AS scope_type,
  p.vehicle_id, p.customer_id, p.vehicle_model::text AS vehicle_model,
  p.soc_min_pct::float8          AS soc_min_pct,
  p.soc_max_pct::float8          AS soc_max_pct,
  p.allowed_hours,
  p.max_power_kw::float8         AS max_power_kw,
  p.max_duration_minutes, p.max_sessions_per_day,
  p.effective_from, p.effective_to, p.change_note, p.created_by, p.supersedes_id, p.created_at`;

/**
 * Chính sách áp cho một xe TẠI MỘT THỜI ĐIỂM.
 *
 * Hai bước, không gộp được:
 *   B1. Với TỪNG mã chính sách khớp phạm vi, chọn version đang trị vì lúc đó
 *       (effective_from lớn nhất mà ≤ thời điểm).
 *   B2. Bỏ version đã ngừng hẳn, rồi lấy phạm vi HẸP NHẤT: xe > đội > dòng xe.
 *
 * Gộp một bước sẽ sai: nếu mã chính sách đã ngừng ở v2 mà v1 còn effective_to NULL,
 * câu truy vấn một bước sẽ tụt về v1 — tức chính sách "đã bỏ" sống lại.
 *
 * Vì sao xe > đội > dòng: phạm vi hẹp hơn là ngoại lệ ký riêng cho xe/đội đó, luôn phải
 * thắng quy định chung của cả dòng xe. Xem docs/adr/ADR-010.
 */
export async function chinhSachHieuLuc(
  db: Queryable,
  vehicleId: string,
  at: Date | string,
): Promise<ChinhSachSac | null> {
  const thoiDiem = at instanceof Date ? at.toISOString() : at;
  const res = await db.query(
    `WITH xe AS (SELECT id, customer_id, model FROM vehicles WHERE id = $1::uuid),
     ap_dung AS (
       SELECT ${COT_CHINH_SACH},
              CASE p.scope_type WHEN 'vehicle' THEN 1 WHEN 'fleet' THEN 2 ELSE 3 END AS uu_tien
       FROM charging_policies p, xe
       WHERE p.effective_from <= $2::timestamptz
         AND ( (p.scope_type = 'vehicle' AND p.vehicle_id    = xe.id)
            OR (p.scope_type = 'fleet'   AND p.customer_id   = xe.customer_id)
            OR (p.scope_type = 'model'   AND p.vehicle_model = xe.model) )
     ),
     dang_tri_vi AS (
       SELECT DISTINCT ON (code) * FROM ap_dung
       ORDER BY code, effective_from DESC, version DESC
     )
     SELECT * FROM dang_tri_vi
     WHERE effective_to IS NULL OR effective_to > $2::timestamptz
     ORDER BY uu_tien, effective_from DESC, version DESC
     LIMIT 1`,
    [vehicleId, thoiDiem],
  );
  const row = res.rows[0];
  return row ? doiRow(row) : null;
}

/** Chuẩn hoá một dòng charging_policies thành object dùng trong TypeScript. */
export function doiRow(row: Record<string, unknown>): ChinhSachSac {
  return {
    ...(row as unknown as ChinhSachSac),
    allowed_hours: (row.allowed_hours as KhungGio[] | null) ?? null,
    effective_from: nhan(row.effective_from),
    effective_to: row.effective_to === null ? null : nhan(row.effective_to),
    created_at: nhan(row.created_at),
  };
}

function nhan(v: unknown): string {
  return v instanceof Date ? v.toISOString() : String(v);
}
