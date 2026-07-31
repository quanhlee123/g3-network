// F-A4 — Phát hiện bất thường pin (AN TOÀN CHÁY NỔ — Must, nâng từ Should ở PRD v1.0).
// Ba luật: nhiệt độ pin vượt ngưỡng · sụt áp đột ngột · mã lỗi BMS nghiêm trọng.
// Ngưỡng đọc từ bảng anomaly_rules (migration 0019), ưu tiên XE > ĐỘI > MẶC ĐỊNH.
//
// CHỐNG TRÙNG là BẮT BUỘC ở đây, không phải tuỳ chọn: alert của F-A4 mang severity 3, mà
// ADR-008 quy định severity 3 KHÔNG bao giờ bị rate-limit của khung thông báo chặn. Nếu tầng
// này không chống trùng thì nhiệt độ giữ ở 60°C sẽ bắn thông báo mỗi 10 giây vào điện thoại
// tài xế. Cơ chế: mỗi (xe, loại) tối đa 1 cảnh báo đang mở, chỉ đóng khi điều kiện hết hẳn
// (vượt ngược ngưỡng một biên trễ) — cùng nguyên lý với F-A2/ADR-006.
import type { INotifier } from '@g3/contracts';
import type { Queryable } from './pipeline';

export type LoaiBatThuong = 'nhiet_do_cao' | 'sut_ap_dot_ngot' | 'ma_loi_bms';

export interface LuatBatThuong {
  loai: LoaiBatThuong;
  /** °C với nhiệt độ · số VOLT sụt với sụt áp · không dùng với mã lỗi. */
  nguong_so: number | null;
  /** Điều kiện phải hết hẳn quá biên này thì cảnh báo mới được đóng. */
  bien_tre_so: number;
  /** Chỉ dùng cho sụt áp: khoảng cách tối đa giữa hai bản ghi đem so sánh (giây). */
  cua_so_giay: number | null;
  /** Chỉ dùng cho mã lỗi BMS: danh sách mã coi là nghiêm trọng. */
  ma_loi: string[] | null;
  severity: 1 | 2 | 3;
}

/** Phần dữ liệu pin của một bản ghi telemetry — đủ để chạy cả ba luật. */
export interface BanGhiPin {
  battery_temp_c: number | null;
  battery_voltage_v: number | null;
  fault_codes: string[];
}

/** Bản ghi liền trước của cùng xe — cần cho luật sụt áp. */
export interface BanGhiTruoc {
  battery_voltage_v: number | null;
  tsMs: number;
}

export interface PhatHien {
  loai: LoaiBatThuong;
  severity: 1 | 2 | 3;
  /** Câu tiếng Việt đọc được cho người vận hành (NF-12). */
  ly_do: string;
  /** Số liệu cụ thể để điều tra, lưu vào payload alert. */
  chi_tiet: Record<string, unknown>;
}

const TEN_LOAI: Record<LoaiBatThuong, string> = {
  nhiet_do_cao: 'Nhiệt độ pin cao bất thường',
  sut_ap_dot_ngot: 'Điện áp pin sụt đột ngột',
  ma_loi_bms: 'BMS báo mã lỗi nghiêm trọng',
};

export interface KetQuaDanhGia {
  can_ban: PhatHien[];
  /** Loại cần đóng vì điều kiện đã hết hẳn. */
  can_go: LoaiBatThuong[];
}

/**
 * Hàm THUẦN — không I/O, test không cần database.
 * `dangMo` là tập loại đang có cảnh báo mở của xe đó.
 */
export function danhGiaBatThuong(
  banGhi: BanGhiPin,
  truoc: BanGhiTruoc | null,
  tsMs: number,
  luats: readonly LuatBatThuong[],
  dangMo: ReadonlySet<LoaiBatThuong>,
): KetQuaDanhGia {
  const can_ban: PhatHien[] = [];
  const can_go: LoaiBatThuong[] = [];

  for (const luat of luats) {
    const kq = apDungLuat(luat, banGhi, truoc, tsMs);
    if (kq.vuot) {
      if (!dangMo.has(luat.loai)) {
        can_ban.push({
          loai: luat.loai,
          severity: luat.severity,
          ly_do: kq.ly_do,
          chi_tiet: kq.chi_tiet,
        });
      }
    } else if (kq.het_han) {
      if (dangMo.has(luat.loai)) can_go.push(luat.loai);
    }
    // Ở giữa (đã tụt dưới ngưỡng nhưng chưa qua biên trễ): giữ nguyên — chống rung.
  }
  return { can_ban, can_go };
}

interface KetQuaLuat {
  /** Đang vi phạm. */
  vuot: boolean;
  /** Đã hết hẳn (qua biên trễ) — đủ điều kiện đóng cảnh báo. */
  het_han: boolean;
  ly_do: string;
  chi_tiet: Record<string, unknown>;
}

function apDungLuat(
  luat: LuatBatThuong,
  banGhi: BanGhiPin,
  truoc: BanGhiTruoc | null,
  tsMs: number,
): KetQuaLuat {
  const trong = (chi_tiet: Record<string, unknown> = {}): KetQuaLuat => ({
    vuot: false,
    het_han: false,
    ly_do: '',
    chi_tiet,
  });

  if (luat.loai === 'nhiet_do_cao') {
    const t = banGhi.battery_temp_c;
    const nguong = luat.nguong_so;
    // Thiếu số đo nhiệt độ: KHÔNG kết luận gì — không bắn mà cũng không đóng cảnh báo đang mở
    // (mất cảm biến trong lúc pin đang nóng là lúc cần cảnh báo nhất, không phải lúc gỡ).
    if (t === null || nguong === null) return trong();
    if (t >= nguong) {
      return {
        vuot: true,
        het_han: false,
        ly_do: `${TEN_LOAI.nhiet_do_cao}: ${t}°C (ngưỡng ${nguong}°C)`,
        chi_tiet: { nhiet_do_c: t, nguong_c: nguong },
      };
    }
    return {
      vuot: false,
      het_han: t <= nguong - luat.bien_tre_so,
      ly_do: '',
      chi_tiet: { nhiet_do_c: t },
    };
  }

  if (luat.loai === 'sut_ap_dot_ngot') {
    const v = banGhi.battery_voltage_v;
    const nguong = luat.nguong_so;
    const apTruoc = truoc?.battery_voltage_v ?? null;
    if (v === null || nguong === null || luat.cua_so_giay === null || apTruoc === null) {
      return trong();
    }
    const cachNhauGiay = (tsMs - (truoc?.tsMs ?? 0)) / 1000;
    // Hai bản ghi cách nhau quá xa thì chênh lệch không nói lên "đột ngột" — bỏ qua.
    // Cũng bỏ qua bản ghi đến ngược thứ tự (cachNhauGiay <= 0) sau khi bù dữ liệu mất sóng.
    if (cachNhauGiay <= 0 || cachNhauGiay > luat.cua_so_giay) return trong();
    const sut = apTruoc - v;
    if (sut >= nguong) {
      return {
        vuot: true,
        het_han: false,
        ly_do: `${TEN_LOAI.sut_ap_dot_ngot}: giảm ${sut.toFixed(1)}V trong ${cachNhauGiay.toFixed(0)}s (ngưỡng ${nguong}V)`,
        chi_tiet: {
          dien_ap_truoc_v: apTruoc,
          dien_ap_v: v,
          sut_v: Number(sut.toFixed(1)),
          cach_nhau_giay: Number(cachNhauGiay.toFixed(1)),
          nguong_v: nguong,
        },
      };
    }
    // Sụt áp là SỰ KIỆN tức thời, không phải trạng thái kéo dài: bản ghi kế tiếp không sụt
    // nữa nghĩa là đợt sụt đã qua → đóng cảnh báo, đợt sau lại được bắn.
    return { vuot: false, het_han: true, ly_do: '', chi_tiet: { dien_ap_v: v } };
  }

  const nghiemTrong = (luat.ma_loi ?? []).filter((ma) => banGhi.fault_codes.includes(ma));
  if (nghiemTrong.length > 0) {
    return {
      vuot: true,
      het_han: false,
      ly_do: `${TEN_LOAI.ma_loi_bms}: ${nghiemTrong.join(', ')}`,
      chi_tiet: { ma_loi: nghiemTrong, tat_ca_ma_loi: banGhi.fault_codes },
    };
  }
  return { vuot: false, het_han: true, ly_do: '', chi_tiet: { tat_ca_ma_loi: banGhi.fault_codes } };
}

/** Khoá chống trùng của một (xe, loại bất thường). */
export function dedupKeyBatThuong(vehicleId: string, loai: LoaiBatThuong): string {
  return `F-A4:${vehicleId}:${loai}`;
}

/** Đọc luật áp dụng cho một xe: XE > ĐỘI > MẶC ĐỊNH toàn hệ (giống F-A2). */
export async function docLuatBatThuong(db: Queryable, vehicleId: string): Promise<LuatBatThuong[]> {
  const res = await db.query(
    `SELECT DISTINCT ON (r.kind)
            r.kind, r.nguong_so::float8 AS nguong_so, r.bien_tre_so::float8 AS bien_tre_so,
            r.cua_so_giay, r.ma_loi, r.severity
     FROM anomaly_rules r
     LEFT JOIN vehicles v ON v.id = $1
     WHERE r.enabled
       AND (r.vehicle_id = $1
            OR (r.customer_id IS NOT NULL AND r.customer_id = v.customer_id)
            OR (r.vehicle_id IS NULL AND r.customer_id IS NULL))
     ORDER BY r.kind, (r.vehicle_id IS NOT NULL) DESC, (r.customer_id IS NOT NULL) DESC`,
    [vehicleId],
  );
  return res.rows.map((r) => ({
    loai: r.kind as LoaiBatThuong,
    nguong_so: (r.nguong_so as number | null) ?? null,
    bien_tre_so: (r.bien_tre_so as number | null) ?? 0,
    cua_so_giay: (r.cua_so_giay as number | null) ?? null,
    ma_loi: (r.ma_loi as string[] | null) ?? null,
    severity: r.severity as 1 | 2 | 3,
  }));
}

/** Số bản ghi tối đa nhét vào snapshot (10s/bản ghi × 5 phút ≈ 30; để rộng cho xe gửi dày). */
const SNAPSHOT_MAX_DONG = 200;

export interface DongSnapshot {
  time: string;
  soc_pct: number | null;
  battery_voltage_v: number | null;
  battery_temp_c: number | null;
  speed_kmh: number | null;
  fault_codes: unknown;
}

/**
 * Snapshot 5 phút dữ liệu QUANH sự kiện (F-A4: "log kèm snapshot dữ liệu").
 *
 * Thực tế là 5 phút TRƯỚC sự kiện: tại thời điểm phát hiện, dữ liệu sau sự kiện chưa tồn tại.
 * Phần trước mới là phần trả lời được câu hỏi điều tra "pin nóng lên từ lúc nào, nhanh cỡ nào".
 * Nếu sau này cần cả phần sau, phải làm job bổ sung snapshot chứ không chặn cảnh báo để chờ —
 * chờ 5 phút với cảnh báo cháy nổ là không chấp nhận được.
 */
export async function chupSnapshot(
  db: Queryable,
  vehicleId: string,
  thoiDiem: string,
  phut = 5,
): Promise<DongSnapshot[]> {
  const res = await db.query(
    `SELECT time, soc_pct::float8 AS soc_pct, battery_voltage_v::float8 AS battery_voltage_v,
            battery_temp_c::float8 AS battery_temp_c, speed_kmh::float8 AS speed_kmh, fault_codes
     FROM telematics_readings
     WHERE vehicle_id = $1
       AND time > $2::timestamptz - ($3::int * interval '1 minute')
       AND time <= $2::timestamptz
     ORDER BY time
     LIMIT ${SNAPSHOT_MAX_DONG}`,
    [vehicleId, thoiDiem, phut],
  );
  return res.rows.map((r) => ({
    time: (r.time as Date).toISOString(),
    soc_pct: (r.soc_pct as number | null) ?? null,
    battery_voltage_v: (r.battery_voltage_v as number | null) ?? null,
    battery_temp_c: (r.battery_temp_c as number | null) ?? null,
    speed_kmh: (r.speed_kmh as number | null) ?? null,
    fault_codes: r.fault_codes ?? null,
  }));
}

/**
 * Bộ đánh giá bất thường cho 1 tiến trình ingest.
 * Nhớ luật + trạng thái mở + bản ghi trước của từng xe trong RAM; trạng thái mở nạp lại
 * từ bảng alerts khi gặp xe lần đầu (chịu được restart).
 */
export class AnomalyEvaluator {
  #luat = new Map<string, LuatBatThuong[]>();
  #dangMo = new Map<string, Set<LoaiBatThuong>>();
  #truoc = new Map<string, BanGhiTruoc>();

  constructor(
    private readonly db: Queryable,
    private readonly log: (msg: string) => void = () => {},
    private readonly notifier?: INotifier,
  ) {}

  /** Xử lý 1 bản ghi telemetry. Trả về số cảnh báo vừa bắn. */
  async danhGia(vehicleId: string, banGhi: BanGhiPin, thoiDiem: string): Promise<number> {
    const tsMs = Date.parse(thoiDiem);
    if (Number.isNaN(tsMs)) return 0;

    const luats = await this.#napLuat(vehicleId);
    const dangMo = await this.#napTrangThai(vehicleId);
    const truoc = this.#truoc.get(vehicleId) ?? null;
    const { can_ban, can_go } = danhGiaBatThuong(banGhi, truoc, tsMs, luats, dangMo);

    // Cập nhật bản ghi trước NGAY, kể cả khi có phát hiện: cửa sổ sụt áp luôn so với
    // bản ghi liền kề gần nhất.
    this.#truoc.set(vehicleId, { battery_voltage_v: banGhi.battery_voltage_v, tsMs });

    for (const loai of can_go) {
      await this.db.query(
        `UPDATE alerts SET status = 'resolved', resolved_at = now()
         WHERE dedup_key = $1 AND status <> 'resolved'`,
        [dedupKeyBatThuong(vehicleId, loai)],
      );
      dangMo.delete(loai);
    }

    let daBan = 0;
    for (const phat of can_ban) {
      const snapshot = await chupSnapshot(this.db, vehicleId, thoiDiem);
      const payload = {
        loai: phat.loai,
        ly_do: phat.ly_do,
        do_luc: thoiDiem,
        chi_tiet: phat.chi_tiet,
        // F-A4: "log kèm snapshot dữ liệu" — bằng chứng điều tra sau sự cố
        snapshot_5_phut: snapshot,
        snapshot_so_dong: snapshot.length,
      };
      const res = await this.db.query(
        `INSERT INTO alerts (type, vehicle_id, severity, dedup_key, payload, triggered_at)
         SELECT 'battery_anomaly', $1, $2, $3, $4, $5
         WHERE NOT EXISTS (
           SELECT 1 FROM alerts WHERE dedup_key = $3 AND status <> 'resolved'
         )
         RETURNING id`,
        [
          vehicleId,
          phat.severity,
          dedupKeyBatThuong(vehicleId, phat.loai),
          JSON.stringify(payload),
          thoiDiem,
        ],
      );
      dangMo.add(phat.loai);
      const alertId = res.rows[0]?.id as string | undefined;
      if (alertId !== undefined) {
        daBan += 1;
        this.log(`[F-A4] ${phat.ly_do} — snapshot ${snapshot.length} bản ghi`);
        await this.#baoNguoi(vehicleId, alertId, phat);
      }
    }
    return daBan;
  }

  async #baoNguoi(vehicleId: string, alertId: string, phat: PhatHien): Promise<void> {
    if (!this.notifier) return;
    try {
      await this.notifier.notify({
        alert_type: 'battery_anomaly',
        severity: phat.severity,
        title: TEN_LOAI[phat.loai],
        body: `${phat.ly_do}. Dừng xe ở nơi an toàn và liên hệ CSKH.`,
        vehicle_id: vehicleId,
        alert_id: alertId,
        data: { loai: phat.loai, ...phat.chi_tiet },
      });
    } catch (err) {
      this.log(
        `[F-A4] gửi thông báo thất bại: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async #napLuat(vehicleId: string): Promise<LuatBatThuong[]> {
    const daCo = this.#luat.get(vehicleId);
    if (daCo) return daCo;
    const luats = await docLuatBatThuong(this.db, vehicleId);
    this.#luat.set(vehicleId, luats);
    return luats;
  }

  async #napTrangThai(vehicleId: string): Promise<Set<LoaiBatThuong>> {
    const daCo = this.#dangMo.get(vehicleId);
    if (daCo) return daCo;
    const res = await this.db.query(
      `SELECT dedup_key FROM alerts
       WHERE vehicle_id = $1 AND status <> 'resolved' AND type = 'battery_anomaly'`,
      [vehicleId],
    );
    const set = new Set<LoaiBatThuong>();
    for (const row of res.rows) {
      const loai = (row.dedup_key as string).split(':').at(-1);
      if (loai === 'nhiet_do_cao' || loai === 'sut_ap_dot_ngot' || loai === 'ma_loi_bms') {
        set.add(loai);
      }
    }
    this.#dangMo.set(vehicleId, set);
    return set;
  }
}
