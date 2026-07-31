// F-A5 — Cảnh báo ra/vào vùng geofence, chạy trên dòng telemetry (không job quét).
//
// Điểm dễ sai nhất của tính năng này: phân biệt "đang ở trong vùng" với "VỪA VÀO vùng".
// Chỉ CHUYỂN TIẾP mới sinh cảnh báo. Vì vậy trạng thái trong/ngoài nằm ở bảng
// geofence_states (DB), không phải RAM: ingest khởi động lại giữa chuyến thì xe đang trong
// vùng vẫn là "đang trong", không bị coi là vừa đi vào.
//
// Lần đầu tiên thấy một (vùng, xe) thì CHỈ ghi nhận trạng thái, KHÔNG cảnh báo — nếu không,
// mọi xe đang chạy trong vùng sẽ đồng loạt báo "vừa vào" ngay khi vùng được tạo.
import type { INotifier } from '@g3/contracts';
import type { Queryable } from './pipeline';

export type HuongVuot = 'vao' | 'ra';

export interface ChuyenTiep {
  geofence_id: string;
  code: string;
  name: string;
  huong: HuongVuot;
}

interface DongVung {
  geofence_id: string;
  code: string;
  name: string;
  canh_bao_vao: boolean;
  canh_bao_ra: boolean;
  ben_trong: boolean;
  /** null = chưa từng ghi nhận trạng thái của (vùng, xe) này. */
  truoc: boolean | null;
}

/**
 * Hàm THUẦN: từ trạng thái trước và trạng thái hiện tại, suy ra chuyển tiếp cần báo.
 * Tách riêng để test không cần PostGIS.
 */
export function suyRaChuyenTiep(vung: DongVung): ChuyenTiep | null {
  if (vung.truoc === null) return null; // lần đầu ghi nhận — không phải chuyển tiếp
  if (vung.truoc === vung.ben_trong) return null; // không đổi trạng thái
  const huong: HuongVuot = vung.ben_trong ? 'vao' : 'ra';
  if (huong === 'vao' && !vung.canh_bao_vao) return null;
  if (huong === 'ra' && !vung.canh_bao_ra) return null;
  return { geofence_id: vung.geofence_id, code: vung.code, name: vung.name, huong };
}

/** Khoá chống trùng: gắn cả thời điểm nên xử lý lại đúng bản ghi đó không sinh alert thứ hai. */
export function dedupKeyGeofence(
  vehicleId: string,
  geofenceId: string,
  huong: HuongVuot,
  thoiDiem: string,
): string {
  return `F-A5:${vehicleId}:${geofenceId}:${huong}:${thoiDiem}`;
}

export class GeofenceEvaluator {
  constructor(
    private readonly db: Queryable,
    private readonly log: (msg: string) => void = () => {},
    private readonly notifier?: INotifier,
  ) {}

  /** Xử lý 1 bản ghi telemetry có toạ độ. Trả về số cảnh báo vừa bắn. */
  async danhGia(
    vehicleId: string,
    viTri: { lat: number; lng: number } | null,
    thoiDiem: string,
  ): Promise<number> {
    if (!viTri) return 0;

    // MỘT truy vấn: vùng áp dụng + đang trong hay ngoài + trạng thái lần trước.
    const res = await this.db.query(
      `SELECT g.id AS geofence_id, g.code, g.name, g.canh_bao_vao, g.canh_bao_ra,
              ST_Covers(g.vung, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography) AS ben_trong,
              s.ben_trong AS truoc
       FROM geofences g
       LEFT JOIN vehicles v ON v.id = $1
       LEFT JOIN geofence_states s ON s.geofence_id = g.id AND s.vehicle_id = $1
       WHERE g.enabled
         AND (g.vehicle_id = $1
              OR (g.customer_id IS NOT NULL AND g.customer_id = v.customer_id)
              OR (g.vehicle_id IS NULL AND g.customer_id IS NULL))`,
      [vehicleId, viTri.lng, viTri.lat],
    );

    let daBan = 0;
    for (const row of res.rows) {
      const vung: DongVung = {
        geofence_id: row.geofence_id as string,
        code: row.code as string,
        name: row.name as string,
        canh_bao_vao: row.canh_bao_vao as boolean,
        canh_bao_ra: row.canh_bao_ra as boolean,
        ben_trong: row.ben_trong as boolean,
        truoc: (row.truoc as boolean | null) ?? null,
      };
      const chuyenTiep = suyRaChuyenTiep(vung);

      // Ghi trạng thái TRƯỚC khi bắn cảnh báo: nếu tiến trình chết giữa chừng thì thà mất
      // một cảnh báo còn hơn bắn lại cảnh báo đó mãi ở mỗi bản ghi tiếp theo.
      await this.db.query(
        `INSERT INTO geofence_states (geofence_id, vehicle_id, ben_trong, cap_nhat_luc)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (geofence_id, vehicle_id)
         DO UPDATE SET ben_trong = EXCLUDED.ben_trong, cap_nhat_luc = EXCLUDED.cap_nhat_luc`,
        [vung.geofence_id, vehicleId, vung.ben_trong, thoiDiem],
      );

      if (!chuyenTiep) continue;
      daBan += await this.#ghiCanhBao(vehicleId, chuyenTiep, viTri, thoiDiem);
    }
    return daBan;
  }

  async #ghiCanhBao(
    vehicleId: string,
    ct: ChuyenTiep,
    viTri: { lat: number; lng: number },
    thoiDiem: string,
  ): Promise<number> {
    const nhan = ct.huong === 'vao' ? 'đi VÀO' : 'rời KHỎI';
    const payload = {
      geofence_id: ct.geofence_id,
      geofence_code: ct.code,
      geofence_name: ct.name,
      huong: ct.huong,
      lat: viTri.lat,
      lng: viTri.lng,
      do_luc: thoiDiem,
    };
    const dedup = dedupKeyGeofence(vehicleId, ct.geofence_id, ct.huong, thoiDiem);
    const res = await this.db.query(
      `INSERT INTO alerts (type, vehicle_id, severity, dedup_key, payload, triggered_at)
       SELECT 'geofence', $1, 2, $2, $3, $4
       WHERE NOT EXISTS (SELECT 1 FROM alerts WHERE dedup_key = $2)
       RETURNING id`,
      [vehicleId, dedup, JSON.stringify(payload), thoiDiem],
    );
    const alertId = res.rows[0]?.id as string | undefined;
    if (alertId === undefined) return 0;

    this.log(`[F-A5] xe ${nhan} vùng ${ct.code} (${ct.name})`);
    if (this.notifier) {
      try {
        await this.notifier.notify({
          alert_type: 'geofence',
          severity: 2,
          title: `Xe ${nhan} vùng ${ct.name}`,
          body: `Vùng ${ct.code} · toạ độ ${viTri.lat.toFixed(5)}, ${viTri.lng.toFixed(5)}`,
          vehicle_id: vehicleId,
          alert_id: alertId,
          data: payload,
        });
      } catch (err) {
        this.log(
          `[F-A5] gửi thông báo thất bại: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return 1;
  }
}
