// F-J1 + F-J3 — Job quét thiết bị "im lặng" và PHÂN LOẠI nguyên nhân.
//
// Câu hỏi nghiệp vụ: xe ngừng gửi dữ liệu — là mất sóng (bình thường, tự hết) hay có người
// tháo thiết bị (phải cử người đi kiểm tra ngay)? Đoán sai theo hướng nào cũng tốn kém:
// báo tamper nhầm thì đội vận hành chạy vô ích, bỏ sót tamper thì mất xe.
//
// BẰNG CHỨNG dùng để phân loại, theo thứ tự tin cậy giảm dần:
//   1. LWT của MQTT (ADR-003) — broker tự phát khi kết nối đứt KHÔNG có DISCONNECT sạch.
//      Đây là bằng chứng mạnh nhất và đã có sẵn ở cột devices.power_status = 'lost'.
//   2. Bản tin CUỐI CÙNG trước khi im lặng (cần schema v2 — migration 0021):
//      · điện áp NGUỒN NUÔI còn bình thường + sóng còn khoẻ, rồi im bặt → NGHI THÁO THIẾT BỊ
//      · sóng đã yếu / bản ghi thưa dần                                → MẤT SÓNG
//      · điện áp nguồn đã tụt sâu                                       → HẾT NGUỒN tự nhiên
//   3. Không có bản ghi v2 nào (thiết bị firmware cũ) → không đủ căn cứ, báo offline thường.
//
// Điểm quan trọng: khi KHÔNG ĐỦ BẰNG CHỨNG thì báo `device_offline`, không báo tamper.
// Cảnh báo tamper kéo theo quy trình thu hồi xe — không được bắn theo phỏng đoán.
import type { INotifier } from '@g3/contracts';
import type { Queryable } from '../../db';

export interface NguongSucKhoe {
  /** Thiết bị im lặng quá số giờ này thì bị coi là "im lặng" (F-J1). */
  imLangGio: number;
  /** Điện áp nguồn nuôi dưới mức này là đang yếu/sắp hết (V). */
  dienApNguonThapV: number;
  /** Sóng yếu hơn (âm hơn) mức này là đang mất sóng dần (dBm). */
  songYeuDbm: number;
}

export const NGUONG_SUC_KHOE_MAC_DINH: NguongSucKhoe = {
  imLangGio: 6,
  dienApNguonThapV: 11,
  songYeuDbm: -95,
};

export type LoaiImLang = 'nghi_thao_thiet_bi' | 'mat_song' | 'het_nguon' | 'khong_ro';

export interface BangChungCuoi {
  power_status: string;
  supply_voltage_v: number | null;
  signal_dbm: number | null;
  /** Khoảng cách (giây) giữa hai bản ghi cuối — thưa dần là dấu hiệu mất sóng. */
  khoang_cach_cuoi_giay: number | null;
}

export interface KetLuan {
  loai: LoaiImLang;
  /** true = sinh alert 'device_tamper'; false = 'device_offline'. */
  la_tamper: boolean;
  ly_do: string;
}

/**
 * Hàm THUẦN — trái tim của F-J3. Không I/O nên test được mọi tổ hợp bằng chứng.
 */
export function phanLoaiImLang(bc: BangChungCuoi, nguong: NguongSucKhoe): KetLuan {
  // 1. LWT: broker khẳng định kết nối đứt đột ngột. Bằng chứng mạnh nhất (ADR-003).
  if (bc.power_status === 'lost') {
    return {
      loai: 'nghi_thao_thiet_bi',
      la_tamper: true,
      ly_do: 'Broker phát LWT: kết nối đứt đột ngột, thiết bị không kịp báo tắt (ADR-003)',
    };
  }

  // 3. Không có dữ liệu v2 → không đủ căn cứ. Báo offline thường, KHÔNG đoán tamper.
  if (bc.supply_voltage_v === null && bc.signal_dbm === null) {
    return {
      loai: 'khong_ro',
      la_tamper: false,
      ly_do: 'Bản tin cuối không có điện áp nguồn/cường độ sóng (thiết bị gửi schema v1)',
    };
  }

  // 2a. Nguồn đã tụt sâu → hết nguồn tự nhiên, không phải bị tháo.
  if (bc.supply_voltage_v !== null && bc.supply_voltage_v < nguong.dienApNguonThapV) {
    return {
      loai: 'het_nguon',
      la_tamper: false,
      ly_do: `Điện áp nguồn nuôi đã tụt còn ${bc.supply_voltage_v}V trước khi im lặng`,
    };
  }

  // 2b. Sóng đã yếu hoặc bản ghi thưa dần → mất sóng.
  if (bc.signal_dbm !== null && bc.signal_dbm <= nguong.songYeuDbm) {
    return {
      loai: 'mat_song',
      la_tamper: false,
      ly_do: `Sóng yếu dần trước khi mất (${bc.signal_dbm} dBm)`,
    };
  }

  // 2c. Nguồn bình thường + sóng còn khoẻ rồi im bặt → NGHI THÁO THIẾT BỊ.
  if (bc.supply_voltage_v !== null && bc.supply_voltage_v >= nguong.dienApNguonThapV) {
    return {
      loai: 'nghi_thao_thiet_bi',
      la_tamper: true,
      ly_do:
        `Bản tin cuối bình thường (nguồn ${bc.supply_voltage_v}V` +
        (bc.signal_dbm === null ? '' : `, sóng ${bc.signal_dbm} dBm`) +
        ') rồi im bặt — không có dấu hiệu suy giảm nào báo trước',
    };
  }

  // Chỉ có sóng, sóng khoẻ, không biết nguồn: nghi ngờ nhưng không đủ chắc để gọi là tamper.
  return {
    loai: 'khong_ro',
    la_tamper: false,
    ly_do: 'Không đủ bằng chứng để phân loại (thiếu số đo điện áp nguồn)',
  };
}

export interface TomTatQuet {
  da_xet: number;
  tamper: number;
  offline: number;
}

export interface QuetOptions {
  nguong?: NguongSucKhoe;
  notifier?: INotifier;
  log?: (msg: string) => void;
  /** Tiêm giờ hiện tại cho test. */
  now?: () => Date;
}

/**
 * Quét toàn bộ thiết bị đang im lặng, phân loại và sinh cảnh báo.
 * Chống trùng: mỗi (thiết bị, đợt im lặng) chỉ 1 cảnh báo mở — dedup_key gắn theo mốc
 * last_seen_at, nên thiết bị liên lạc lại rồi im lần nữa sẽ là một đợt mới.
 */
export async function quetSucKhoeThietBi(
  db: Queryable,
  opts: QuetOptions = {},
): Promise<TomTatQuet> {
  const nguong = opts.nguong ?? NGUONG_SUC_KHOE_MAC_DINH;
  const log = opts.log ?? (() => {});
  const tomTat: TomTatQuet = { da_xet: 0, tamper: 0, offline: 0 };

  // Thiết bị im lặng + bằng chứng từ hai bản ghi telemetry cuối cùng của xe nó gắn.
  const res = await db.query(
    `WITH im_lang AS (
       SELECT d.id AS device_id, d.device_serial, d.vehicle_id, d.last_seen_at,
              d.power_status::text AS power_status, v.vin
       FROM devices d
       JOIN vehicles v ON v.id = d.vehicle_id
       WHERE d.revoked_at IS NULL
         AND d.last_seen_at IS NOT NULL
         AND d.last_seen_at < now() - ($1::numeric * interval '1 hour')
     )
     SELECT i.*, c.supply_voltage_v, c.signal_dbm, c.khoang_cach_cuoi_giay
     FROM im_lang i
     -- Gộp HAI bản ghi telemetry cuối cùng thành một dòng bằng chứng:
     -- giá trị của bản ghi cuối + khoảng cách giữa hai bản cuối (thưa dần = mất sóng).
     LEFT JOIN LATERAL (
       SELECT (array_agg(t.supply_voltage_v ORDER BY t.time DESC))[1]::float8 AS supply_voltage_v,
              (array_agg(t.signal_dbm ORDER BY t.time DESC))[1]              AS signal_dbm,
              EXTRACT(EPOCH FROM (
                (array_agg(t.time ORDER BY t.time DESC))[1]
                - (array_agg(t.time ORDER BY t.time DESC))[2]
              ))::float8 AS khoang_cach_cuoi_giay
       FROM (
         SELECT time, supply_voltage_v, signal_dbm
         FROM telematics_readings
         WHERE vehicle_id = i.vehicle_id
         ORDER BY time DESC
         LIMIT 2
       ) t
     ) c ON true`,
    [nguong.imLangGio],
  );

  for (const row of res.rows) {
    tomTat.da_xet += 1;
    const lastSeen = row.last_seen_at as Date;
    const ketLuan = phanLoaiImLang(
      {
        power_status: row.power_status as string,
        supply_voltage_v: (row.supply_voltage_v as number | null) ?? null,
        signal_dbm: (row.signal_dbm as number | null) ?? null,
        khoang_cach_cuoi_giay: (row.khoang_cach_cuoi_giay as number | null) ?? null,
      },
      nguong,
    );

    const loaiAlert = ketLuan.la_tamper ? 'device_tamper' : 'device_offline';
    // Mốc last_seen_at nằm trong khoá → thiết bị liên lạc lại rồi im lần nữa là ĐỢT MỚI.
    const dedup = `F-J3:${row.device_id as string}:${lastSeen.toISOString()}`;
    const imLangGio = ((opts.now?.() ?? new Date()).getTime() - lastSeen.getTime()) / 3_600_000;

    const payload = {
      loai: ketLuan.loai,
      ly_do: ketLuan.ly_do,
      device_serial: row.device_serial as string,
      vin: row.vin as string,
      last_seen_at: lastSeen.toISOString(),
      im_lang_gio: Math.round(imLangGio * 10) / 10,
      bang_chung: {
        power_status: row.power_status as string,
        supply_voltage_v: (row.supply_voltage_v as number | null) ?? null,
        signal_dbm: (row.signal_dbm as number | null) ?? null,
      },
    };

    const ins = await db.query(
      `INSERT INTO alerts (type, vehicle_id, device_id, severity, dedup_key, payload)
       SELECT $1::alert_type, $2, $3, $4, $5, $6
       WHERE NOT EXISTS (SELECT 1 FROM alerts WHERE dedup_key = $5)
       RETURNING id`,
      [
        loaiAlert,
        row.vehicle_id as string,
        row.device_id as string,
        ketLuan.la_tamper ? 3 : 2,
        dedup,
        JSON.stringify(payload),
      ],
    );
    const alertId = ins.rows[0]?.id as string | undefined;
    if (alertId === undefined) continue; // đợt im lặng này đã báo rồi

    if (ketLuan.la_tamper) tomTat.tamper += 1;
    else tomTat.offline += 1;
    log(
      `[F-J3] ${row.vin as string}: ${ketLuan.loai} — ${ketLuan.ly_do} ` +
        `(im lặng ${payload.im_lang_gio}h)`,
    );

    if (opts.notifier) {
      try {
        await opts.notifier.notify({
          alert_type: loaiAlert,
          severity: ketLuan.la_tamper ? 3 : 2,
          title: ketLuan.la_tamper
            ? `Nghi tháo thiết bị: xe ${row.vin as string}`
            : `Thiết bị mất liên lạc: xe ${row.vin as string}`,
          body: `${ketLuan.ly_do}. Im lặng ${payload.im_lang_gio} giờ.`,
          vehicle_id: row.vehicle_id as string,
          alert_id: alertId,
          data: payload,
        });
      } catch (err) {
        log(`[F-J3] gửi thông báo thất bại: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return tomTat;
}
