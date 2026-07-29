// F-A2 — Cảnh báo pin phân cấp 30% (sớm) / 20% (chính) / 10% (nguy cấp).
// Chạy NGAY trong pipeline ingest, không qua hàng đợi trung gian → đạt "cảnh báo ≤30s
// khi chạm ngưỡng" của F-A2 mà không cần job quét định kỳ.
//
// CHỐNG SPAM — QUY TẮC TẠM, xem docs/adr/ADR-006-chong-spam-canh-bao-pin.md:
// D-03 ("định nghĩa CHUYẾN") trong docs/DECISION-LOG.md đang MỞ, nên ở đây KHÔNG dùng
// khái niệm chuyến. Thay vào đó dùng vòng đời của chính cảnh báo:
//   - bắn 1 lần khi SOC chạm ngưỡng, cảnh báo ở trạng thái 'open'
//   - chỉ khi SOC hồi lên trên (ngưỡng + 5%) thì cảnh báo được 'resolved' và ngưỡng đó
//     mới nạp đạn lại → SOC dao động quanh 20.0% không sinh ra hàng chục cảnh báo
// Trạng thái nằm hoàn toàn trong bảng alerts nên sống sót khi ingest khởi động lại.
import type { Queryable } from './pipeline';

export interface NguongPin {
  /** Ngưỡng SOC (%) */
  pct: number;
  type: 'battery_low' | 'battery_critical';
  /** 1 = sớm · 2 = chính · 3 = nguy cấp (cột alerts.severity) */
  severity: 1 | 2 | 3;
  nhan: string;
}

/** Đúng 3 mức của F-A2. Thứ tự giảm dần để log/duyệt đọc tự nhiên. */
export const NGUONG_PIN: readonly NguongPin[] = [
  { pct: 30, type: 'battery_low', severity: 1, nhan: 'sớm' },
  { pct: 20, type: 'battery_low', severity: 2, nhan: 'chính' },
  { pct: 10, type: 'battery_critical', severity: 3, nhan: 'nguy cấp' },
];

/** Biên trễ (%) SOC phải hồi lên trên ngưỡng bao nhiêu thì ngưỡng đó mới nạp đạn lại. */
export const BIEN_TRE_PCT = 5;

export interface QuyetDinhCanhBao {
  /** Ngưỡng cần BẮN cảnh báo mới. */
  can_ban: NguongPin[];
  /** Ngưỡng cần GỠ (đóng cảnh báo cũ) vì SOC đã hồi. */
  can_go: NguongPin[];
}

/**
 * Hàm THUẦN: quyết định bắn/gỡ ngưỡng nào, dựa trên SOC hiện tại và tập ngưỡng đang mở.
 * Không I/O — test không cần database.
 */
export function quyetDinhCanhBao(socPct: number, dangMo: ReadonlySet<number>): QuyetDinhCanhBao {
  const can_ban: NguongPin[] = [];
  const can_go: NguongPin[] = [];
  for (const nguong of NGUONG_PIN) {
    if (socPct <= nguong.pct) {
      if (!dangMo.has(nguong.pct)) can_ban.push(nguong);
    } else if (socPct >= nguong.pct + BIEN_TRE_PCT) {
      if (dangMo.has(nguong.pct)) can_go.push(nguong);
    }
    // Vùng đệm (nguong, nguong+BIEN_TRE): giữ nguyên trạng thái — đây chính là chống rung.
  }
  return { can_ban, can_go };
}

/** Khóa chống trùng của một (xe, ngưỡng). Cảnh báo đã resolved không chặn lần bắn sau. */
export function dedupKey(vehicleId: string, nguongPct: number): string {
  return `F-A2:${vehicleId}:${nguongPct}`;
}

export interface TramGoiY {
  code: string;
  name: string;
  khoang_cach_km: number;
  tru_trong: number;
}

/**
 * F-A2 yêu cầu cảnh báo "kèm gợi ý trạm gần nhất còn trống".
 * Dùng PostGIS đo khoảng cách đường chim bay từ vị trí xe tới các trạm CÓ trụ Available.
 * Phase 1 chưa tính quãng đường theo tuyến (cần nhà cung cấp bản đồ — Q5 đang MỞ).
 */
export async function timTramGanNhat(
  db: Queryable,
  lng: number,
  lat: number,
): Promise<TramGoiY | null> {
  const res = await db.query(
    `SELECT s.code, s.name,
            (ST_Distance(s.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) / 1000)::float8
              AS khoang_cach_km,
            count(c.id) FILTER (WHERE c.status = 'Available')::int AS tru_trong
     FROM charging_stations s
     JOIN connectors c ON c.station_id = s.id
     WHERE s.status = 'active'
     GROUP BY s.id
     HAVING count(c.id) FILTER (WHERE c.status = 'Available') > 0
     ORDER BY ST_Distance(s.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography)
     LIMIT 1`,
    [lng, lat],
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    code: row.code as string,
    name: row.name as string,
    khoang_cach_km: Math.round((row.khoang_cach_km as number) * 10) / 10,
    tru_trong: row.tru_trong as number,
  };
}

/**
 * Bộ đánh giá cảnh báo pin cho 1 tiến trình ingest.
 * Nhớ tập ngưỡng đang mở của từng xe trong RAM để không phải hỏi DB mỗi bản ghi;
 * lần đầu gặp một xe thì nạp lại trạng thái từ bảng alerts (chịu được restart).
 */
export class BatteryAlertEvaluator {
  #dangMo = new Map<string, Set<number>>();

  constructor(
    private readonly db: Queryable,
    private readonly log: (msg: string) => void = () => {},
  ) {}

  /** Xử lý 1 bản ghi telemetry. Trả về số cảnh báo vừa bắn (phục vụ log & test). */
  async danhGia(
    vehicleId: string,
    socPct: number | null,
    viTri: { lat: number; lng: number } | null,
    thoiDiem: string,
  ): Promise<number> {
    if (socPct === null || Number.isNaN(socPct)) return 0;
    const dangMo = await this.#napTrangThai(vehicleId);
    const { can_ban, can_go } = quyetDinhCanhBao(socPct, dangMo);

    for (const nguong of can_go) {
      await this.db.query(
        `UPDATE alerts SET status = 'resolved', resolved_at = now()
         WHERE dedup_key = $1 AND status <> 'resolved'`,
        [dedupKey(vehicleId, nguong.pct)],
      );
      dangMo.delete(nguong.pct);
    }

    let daBan = 0;
    for (const nguong of can_ban) {
      const tram = viTri ? await timTramGanNhat(this.db, viTri.lng, viTri.lat) : null;
      const payload = {
        nguong_pct: nguong.pct,
        muc: nguong.nhan,
        soc_pct: socPct,
        do_luc: thoiDiem,
        tram_goi_y: tram, // F-A2: "kèm gợi ý trạm gần nhất còn trống"
      };
      // Chống trùng ở DB chứ không chỉ ở RAM: 2 tiến trình ingest cùng chạy vẫn ra 1 cảnh báo.
      const res = await this.db.query(
        `INSERT INTO alerts (type, vehicle_id, severity, dedup_key, payload, triggered_at)
         SELECT $1, $2, $3, $4, $5, $6
         WHERE NOT EXISTS (
           SELECT 1 FROM alerts WHERE dedup_key = $4 AND status <> 'resolved'
         )`,
        [
          nguong.type,
          vehicleId,
          nguong.severity,
          dedupKey(vehicleId, nguong.pct),
          JSON.stringify(payload),
          thoiDiem,
        ],
      );
      dangMo.add(nguong.pct);
      if ((res.rowCount ?? 0) > 0) {
        daBan += 1;
        this.log(
          `[F-A2] cảnh báo pin ${nguong.nhan} (${nguong.pct}%) — SOC ${socPct.toFixed(1)}%` +
            (tram ? ` · trạm gần nhất ${tram.code} cách ${tram.khoang_cach_km} km` : ''),
        );
      }
    }
    return daBan;
  }

  async #napTrangThai(vehicleId: string): Promise<Set<number>> {
    const daCo = this.#dangMo.get(vehicleId);
    if (daCo) return daCo;
    const res = await this.db.query(
      `SELECT dedup_key FROM alerts
       WHERE vehicle_id = $1 AND status <> 'resolved'
         AND type IN ('battery_low', 'battery_critical')`,
      [vehicleId],
    );
    const set = new Set<number>();
    for (const row of res.rows) {
      const pct = Number((row.dedup_key as string).split(':').at(-1));
      if (Number.isFinite(pct)) set.add(pct);
    }
    this.#dangMo.set(vehicleId, set);
    return set;
  }
}
