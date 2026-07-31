// F-A2 — Cảnh báo pin phân cấp: sớm / chính / nguy cấp (mặc định 30% / 20% / 10%).
// Chạy NGAY trong pipeline ingest, không qua hàng đợi trung gian → đạt "cảnh báo ≤30s
// khi chạm ngưỡng" (NF-01) mà không cần job quét định kỳ.
//
// NGƯỠNG do bảng battery_alert_thresholds quyết định (migration 0018), ưu tiên
// XE > ĐỘI > MẶC ĐỊNH toàn hệ. Không còn hằng số cứng nào trong file này.
//
// CHỐNG SPAM — D-03 ĐÃ CHỐT ngày 2026-07-29, xem docs/adr/ADR-006:
// F-A2 **bỏ hẳn** khái niệm "chuyến". Chống spam dựa trên vòng đời của chính cảnh báo:
//   - bắn 1 lần khi SOC chạm ngưỡng, cảnh báo ở trạng thái 'open'
//   - chỉ khi SOC hồi lên trên (ngưỡng + biên trễ) thì cảnh báo được 'resolved' và mức đó
//     mới nạp đạn lại → SOC dao động quanh 20.0% không sinh ra hàng chục cảnh báo
// Trạng thái nằm hoàn toàn trong bảng alerts nên sống sót khi ingest khởi động lại.
import type { INotifier } from '@g3/contracts';
import type { Queryable } from './pipeline';

/** Ba mức của F-A2. Chỉ ba mức này — con số ngưỡng thì cấu hình được, tên mức thì không. */
export type MucPin = 'som' | 'chinh' | 'nguy_cap';

interface DacTaMuc {
  type: 'battery_low' | 'battery_critical';
  /** Cột alerts.severity: 1 = sớm · 2 = chính · 3 = nguy cấp. */
  severity: 1 | 2 | 3;
  nhan: string;
}

export const DAC_TA_MUC: Record<MucPin, DacTaMuc> = {
  som: { type: 'battery_low', severity: 1, nhan: 'sớm' },
  chinh: { type: 'battery_low', severity: 2, nhan: 'chính' },
  nguy_cap: { type: 'battery_critical', severity: 3, nhan: 'nguy cấp' },
};

export interface NguongPin extends DacTaMuc {
  muc: MucPin;
  /** Ngưỡng SOC (%) đọc từ battery_alert_thresholds. */
  pct: number;
  /** SOC phải hồi lên trên pct + bien_tre_pct thì mức này mới nạp đạn lại (ADR-006). */
  bien_tre_pct: number;
}

export interface QuyetDinhCanhBao {
  /** Mức cần BẮN cảnh báo mới. */
  can_ban: NguongPin[];
  /** Mức cần GỠ (đóng cảnh báo cũ) vì SOC đã hồi. */
  can_go: NguongPin[];
}

/**
 * Hàm THUẦN: quyết định bắn/gỡ mức nào, dựa trên SOC hiện tại và tập mức đang mở.
 * Không I/O — test không cần database.
 */
export function quyetDinhCanhBao(
  socPct: number,
  nguongs: readonly NguongPin[],
  dangMo: ReadonlySet<MucPin>,
): QuyetDinhCanhBao {
  const can_ban: NguongPin[] = [];
  const can_go: NguongPin[] = [];
  for (const nguong of nguongs) {
    if (socPct <= nguong.pct) {
      if (!dangMo.has(nguong.muc)) can_ban.push(nguong);
    } else if (socPct >= nguong.pct + nguong.bien_tre_pct) {
      if (dangMo.has(nguong.muc)) can_go.push(nguong);
    }
    // Vùng đệm (pct, pct + biên trễ): giữ nguyên trạng thái — đây chính là chống rung.
  }
  return { can_ban, can_go };
}

/**
 * Khoá chống trùng của một (xe, MỨC). Cố ý dùng tên mức chứ KHÔNG dùng con số ngưỡng:
 * ngưỡng cấu hình được, nên khoá nhúng con số sẽ mồ côi khi vận hành đổi ngưỡng
 * (xem phần giải thích trong migration 0018).
 */
export function dedupKey(vehicleId: string, muc: MucPin): string {
  return `F-A2:${vehicleId}:${muc}`;
}

/**
 * Đọc ngưỡng áp dụng cho một xe: XE cụ thể > ĐỘI của xe > MẶC ĐỊNH toàn hệ.
 * Trả về theo thứ tự ngưỡng giảm dần để log/duyệt đọc tự nhiên (30 → 20 → 10).
 */
export async function docNguongPin(db: Queryable, vehicleId: string): Promise<NguongPin[]> {
  const res = await db.query(
    `SELECT DISTINCT ON (t.muc)
            t.muc, t.nguong_pct::float8 AS nguong_pct, t.bien_tre_pct::float8 AS bien_tre_pct
     FROM battery_alert_thresholds t
     LEFT JOIN vehicles v ON v.id = $1
     WHERE t.vehicle_id = $1
        OR (t.customer_id IS NOT NULL AND t.customer_id = v.customer_id)
        OR (t.vehicle_id IS NULL AND t.customer_id IS NULL)
     -- Ưu tiên: dòng gắn XE trước, rồi dòng gắn ĐỘI, cuối cùng là dòng mặc định
     ORDER BY t.muc, (t.vehicle_id IS NOT NULL) DESC, (t.customer_id IS NOT NULL) DESC`,
    [vehicleId],
  );

  return res.rows
    .map((r) => {
      const muc = r.muc as MucPin;
      return {
        muc,
        ...DAC_TA_MUC[muc],
        pct: r.nguong_pct as number,
        bien_tre_pct: r.bien_tre_pct as number,
      };
    })
    .sort((a, b) => b.pct - a.pct);
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
 * Nhớ tập mức đang mở + ngưỡng của từng xe trong RAM để không phải hỏi DB mỗi bản ghi;
 * lần đầu gặp một xe thì nạp lại trạng thái từ bảng alerts (chịu được restart).
 */
export class BatteryAlertEvaluator {
  #dangMo = new Map<string, Set<MucPin>>();
  #nguong = new Map<string, NguongPin[]>();

  constructor(
    private readonly db: Queryable,
    private readonly log: (msg: string) => void = () => {},
    /** F-F3: cổng thông báo. Không truyền = chỉ ghi alerts (dùng trong test cũ). */
    private readonly notifier?: INotifier,
  ) {}

  /**
   * Bỏ ngưỡng đã nhớ của một xe (hoặc tất cả) — gọi khi vận hành vừa đổi cấu hình.
   * Không có cơ chế tự làm mới định kỳ ở Phase 1: đổi ngưỡng là việc hiếm, và tiến trình
   * ingest khởi động lại là nạp lại.
   */
  quenNguong(vehicleId?: string): void {
    if (vehicleId === undefined) this.#nguong.clear();
    else this.#nguong.delete(vehicleId);
  }

  /** Xử lý 1 bản ghi telemetry. Trả về số cảnh báo vừa bắn (phục vụ log & test). */
  async danhGia(
    vehicleId: string,
    socPct: number | null,
    viTri: { lat: number; lng: number } | null,
    thoiDiem: string,
  ): Promise<number> {
    if (socPct === null || Number.isNaN(socPct)) return 0;
    const nguongs = await this.#napNguong(vehicleId);
    const dangMo = await this.#napTrangThai(vehicleId);
    const { can_ban, can_go } = quyetDinhCanhBao(socPct, nguongs, dangMo);

    for (const nguong of can_go) {
      await this.db.query(
        `UPDATE alerts SET status = 'resolved', resolved_at = now()
         WHERE dedup_key = $1 AND status <> 'resolved'`,
        [dedupKey(vehicleId, nguong.muc)],
      );
      dangMo.delete(nguong.muc);
    }

    let daBan = 0;
    for (const nguong of can_ban) {
      const tram = viTri ? await timTramGanNhat(this.db, viTri.lng, viTri.lat) : null;
      const payload = {
        muc: nguong.muc,
        nguong_pct: nguong.pct,
        nhan: nguong.nhan,
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
         )
         RETURNING id`,
        [
          nguong.type,
          vehicleId,
          nguong.severity,
          dedupKey(vehicleId, nguong.muc),
          JSON.stringify(payload),
          thoiDiem,
        ],
      );
      dangMo.add(nguong.muc);
      const alertId = res.rows[0]?.id as string | undefined;
      if (alertId !== undefined) {
        daBan += 1;
        this.log(
          `[F-A2] cảnh báo pin ${nguong.nhan} (${nguong.pct}%) — SOC ${socPct.toFixed(1)}%` +
            (tram ? ` · trạm gần nhất ${tram.code} cách ${tram.khoang_cach_km} km` : ''),
        );
        await this.#baoNguoi(vehicleId, alertId, nguong, socPct, tram);
      }
    }
    return daBan;
  }

  /**
   * F-F3: đưa cảnh báo tới người qua INotifier. Ai nhận kênh nào là việc của cấu hình
   * notification_prefs — ở đây KHÔNG chọn người nhận (đó là cách "quản lý đội nhận từ 20%"
   * được thể hiện: dòng cấu hình của fleet_manager có min_severity = 2).
   *
   * notify() theo hợp đồng không ném lỗi, nhưng vẫn bọc try/catch: cảnh báo pin đã ghi vào
   * alerts rồi, một bản cài đặt INotifier lỗi tuyệt đối không được làm hỏng pipeline ingest.
   */
  async #baoNguoi(
    vehicleId: string,
    alertId: string,
    nguong: NguongPin,
    socPct: number,
    tram: TramGoiY | null,
  ): Promise<void> {
    if (!this.notifier) return;
    const than = tram
      ? `Trạm gần nhất ${tram.name} (${tram.code}) cách ${tram.khoang_cach_km} km, còn ${tram.tru_trong} trụ trống.`
      : 'Chưa tìm được trạm còn trụ trống gần đây.';
    try {
      await this.notifier.notify({
        alert_type: nguong.type,
        severity: nguong.severity,
        title: `Pin còn ${socPct.toFixed(0)}%`,
        body: than,
        vehicle_id: vehicleId,
        alert_id: alertId,
        data: {
          muc: nguong.muc,
          nguong_pct: nguong.pct,
          soc_pct: socPct,
          tram_goi_y: tram,
        },
      });
    } catch (err) {
      this.log(
        `[F-A2] gửi thông báo thất bại: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async #napNguong(vehicleId: string): Promise<NguongPin[]> {
    const daCo = this.#nguong.get(vehicleId);
    if (daCo) return daCo;
    const nguongs = await docNguongPin(this.db, vehicleId);
    this.#nguong.set(vehicleId, nguongs);
    return nguongs;
  }

  async #napTrangThai(vehicleId: string): Promise<Set<MucPin>> {
    const daCo = this.#dangMo.get(vehicleId);
    if (daCo) return daCo;
    const res = await this.db.query(
      `SELECT dedup_key FROM alerts
       WHERE vehicle_id = $1 AND status <> 'resolved'
         AND type IN ('battery_low', 'battery_critical')`,
      [vehicleId],
    );
    const set = new Set<MucPin>();
    for (const row of res.rows) {
      const muc = (row.dedup_key as string).split(':').at(-1);
      if (muc === 'som' || muc === 'chinh' || muc === 'nguy_cap') set.add(muc);
    }
    this.#dangMo.set(vehicleId, set);
    return set;
  }
}
