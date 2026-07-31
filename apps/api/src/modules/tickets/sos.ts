// F-I2 — Nút SOS: tài xế gặp sự cố/hết pin → tạo ticket ưu tiên CAO cho CSKH.
//
// ⚠️ RANH GIỚI: D-09 (định hướng nghiệp vụ Module I) và Q6 (đơn vị nào trực 24/7) đang MỞ
// trong docs/DECISION-LOG.md. File này dựng KHUNG KỸ THUẬT — nhận SOS, tự đính kèm ngữ cảnh
// xe, đặt hạn SLA, leo thang khi quá hạn. Quy trình gọi lại và cam kết dịch vụ thật là nội
// dung của D-09/Q6, KHÔNG tự quyết ở đây.
import type { INotifier } from '@g3/contracts';
import type { Queryable } from '../../db';

/** Hạn phản hồi SOS: sheet 4 F-I2 ghi "gọi lại ≤5 phút". */
export const SLA_SOS_PHUT = 5;

export interface NguCanhXe {
  vin: string;
  soc_pct: number | null;
  lat: number | null;
  lng: number | null;
  /** Mã lỗi BMS/motor đang hoạt động, lấy từ bản ghi telemetry mới nhất. */
  fault_codes: string[];
  /** Cảnh báo đang mở của xe — CSKH cần thấy ngay "xe này đang có chuyện gì". */
  canh_bao_dang_mo: { type: string; severity: number }[];
  telemetry_luc: string | null;
}

/**
 * Gom ngữ cảnh xe TỪ DB, không tin số liệu do client gửi lên.
 * Tài xế bấm SOS lúc hoảng loạn — app không nên phải tự thu thập mã lỗi, và dữ liệu
 * do client gửi lên thì không dùng làm hồ sơ được.
 */
export async function docNguCanhXe(db: Queryable, vehicleId: string): Promise<NguCanhXe> {
  const xe = await db.query(
    `SELECT v.vin,
            t.soc_pct::float8 AS soc_pct,
            ST_Y(t.position::geometry)::float8 AS lat,
            ST_X(t.position::geometry)::float8 AS lng,
            t.fault_codes,
            t.time
     FROM vehicles v
     LEFT JOIN LATERAL (
       SELECT soc_pct, position, fault_codes, time
       FROM telematics_readings
       WHERE vehicle_id = v.id
       ORDER BY time DESC LIMIT 1
     ) t ON true
     WHERE v.id = $1`,
    [vehicleId],
  );
  const row = xe.rows[0];
  if (!row) throw new Error(`Không tìm thấy xe ${vehicleId}`);

  const canhBao = await db.query(
    `SELECT type::text AS type, severity FROM alerts
     WHERE vehicle_id = $1 AND status <> 'resolved'
     ORDER BY severity DESC, triggered_at DESC
     LIMIT 10`,
    [vehicleId],
  );

  const faultRaw = row.fault_codes;
  return {
    vin: row.vin as string,
    soc_pct: (row.soc_pct as number | null) ?? null,
    lat: (row.lat as number | null) ?? null,
    lng: (row.lng as number | null) ?? null,
    fault_codes: Array.isArray(faultRaw) ? (faultRaw as string[]) : [],
    canh_bao_dang_mo: canhBao.rows.map((r) => ({
      type: r.type as string,
      severity: r.severity as number,
    })),
    telemetry_luc: row.time instanceof Date ? row.time.toISOString() : null,
  };
}

export interface KetQuaSos {
  ticket_id: string;
  alert_id: string | null;
  sla_due_at: string;
  ngu_canh: NguCanhXe;
}

export interface TaoSosOptions {
  db: Queryable;
  vehicleId: string;
  /** Người bấm nút (tài xế hoặc QL đội). */
  userId: string;
  /** Mô tả tài xế nhập thêm (tuỳ chọn — lúc hoảng loạn không ai gõ nhiều). */
  moTa?: string | null;
  /** Toạ độ do app gửi kèm; nếu thiếu thì lấy vị trí cuối cùng từ telemetry. */
  viTri?: { lat: number; lng: number } | null;
  notifier?: INotifier;
  now?: () => Date;
  log?: (msg: string) => void;
}

export async function taoSos(opts: TaoSosOptions): Promise<KetQuaSos> {
  const { db, vehicleId, userId } = opts;
  const bayGio = opts.now?.() ?? new Date();
  const log = opts.log ?? (() => {});

  const nguCanh = await docNguCanhXe(db, vehicleId);
  // Toạ độ app gửi được ưu tiên (mới hơn telemetry), nhưng vẫn giữ cả hai trong hồ sơ.
  const lat = opts.viTri?.lat ?? nguCanh.lat;
  const lng = opts.viTri?.lng ?? nguCanh.lng;
  const slaDueAt = new Date(bayGio.getTime() + SLA_SOS_PHUT * 60_000);

  const ticket = await db.query(
    `INSERT INTO tickets (channel, status, priority, title, description, created_by,
                          vehicle_id, vehicle_context, sla_due_at, created_at)
     VALUES ('sos', 'open', 'cao', $1, $2, $3, $4, $5::jsonb, $6, $7)
     RETURNING id`,
    [
      `SOS: xe ${nguCanh.vin}`,
      opts.moTa ?? null,
      userId,
      vehicleId,
      JSON.stringify({
        ...nguCanh,
        lat_bao_cao: opts.viTri?.lat ?? null,
        lng_bao_cao: opts.viTri?.lng ?? null,
        sla_phut: SLA_SOS_PHUT,
      }),
      slaDueAt.toISOString(),
      bayGio.toISOString(),
    ],
  );
  const ticketId = ticket.rows[0]!.id as string;

  const alert = await db.query(
    `INSERT INTO alerts (type, vehicle_id, severity, dedup_key, payload, triggered_at)
     VALUES ('sos', $1, 3, $2, $3::jsonb, $4)
     RETURNING id`,
    [
      vehicleId,
      `F-I2:${ticketId}`, // 1 alert/ticket — mỗi lần bấm SOS là một sự kiện riêng
      JSON.stringify({ ticket_id: ticketId, ...nguCanh, lat, lng }),
      bayGio.toISOString(),
    ],
  );
  const alertId = (alert.rows[0]?.id as string | undefined) ?? null;

  const moTaLoi =
    nguCanh.fault_codes.length > 0 ? ` Mã lỗi: ${nguCanh.fault_codes.join(', ')}.` : '';
  const moTaSoc = nguCanh.soc_pct === null ? '' : ` SOC ${nguCanh.soc_pct.toFixed(0)}%.`;
  log(`[F-I2] SOS xe ${nguCanh.vin} → ticket ${ticketId} (hạn ${SLA_SOS_PHUT} phút)`);

  if (opts.notifier) {
    try {
      await opts.notifier.notify({
        alert_type: 'sos',
        severity: 3,
        title: `SOS: xe ${nguCanh.vin} cần hỗ trợ`,
        body:
          `Tài xế bấm nút cứu hộ.${moTaSoc}${moTaLoi}` +
          (lat === null || lng === null
            ? ' Chưa có vị trí.'
            : ` Vị trí ${lat.toFixed(5)}, ${lng.toFixed(5)}.`) +
          ` Hạn phản hồi ${SLA_SOS_PHUT} phút.`,
        vehicle_id: vehicleId,
        ticket_id: ticketId,
        alert_id: alertId,
        data: { ticket_id: ticketId, vin: nguCanh.vin, lat, lng },
      });
    } catch (err) {
      log(`[F-I2] gửi thông báo SOS thất bại: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    ticket_id: ticketId,
    alert_id: alertId,
    sla_due_at: slaDueAt.toISOString(),
    ngu_canh: nguCanh,
  };
}

export interface TomTatSla {
  qua_han: number;
}

/**
 * Đồng hồ SLA: ticket CHƯA AI NHẬN quá hạn → sinh cảnh báo leo thang.
 *
 * Đo tới mốc `acknowledged_at` (có người nhận việc) chứ không phải `resolved_at` (xong việc):
 * cam kết của F-I2 là "gọi lại ≤5 phút", không phải "sửa xong trong 5 phút".
 * Cột `escalated_at` bảo đảm mỗi ticket chỉ leo thang một lần dù job chạy nhiều vòng.
 */
export async function quetSlaTicket(
  db: Queryable,
  opts: { notifier?: INotifier; log?: (msg: string) => void; now?: () => Date } = {},
): Promise<TomTatSla> {
  const log = opts.log ?? (() => {});
  const bayGio = opts.now?.() ?? new Date();

  const res = await db.query(
    `UPDATE tickets SET escalated_at = $1
     WHERE status IN ('open', 'in_progress')
       AND acknowledged_at IS NULL
       AND escalated_at IS NULL
       AND sla_due_at IS NOT NULL
       AND sla_due_at < $1
     RETURNING id, title, vehicle_id, sla_due_at, channel::text AS channel`,
    [bayGio.toISOString()],
  );

  for (const row of res.rows) {
    const ticketId = row.id as string;
    const treGiay = Math.round((bayGio.getTime() - (row.sla_due_at as Date).getTime()) / 1000);
    const payload = {
      ticket_id: ticketId,
      tieu_de: row.title as string,
      kenh: row.channel as string,
      qua_han_giay: treGiay,
      sla_due_at: (row.sla_due_at as Date).toISOString(),
    };
    const alert = await db.query(
      `INSERT INTO alerts (type, vehicle_id, severity, dedup_key, payload)
       VALUES ('sla_breach', $1, 3, $2, $3::jsonb)
       RETURNING id`,
      [row.vehicle_id as string | null, `F-I2:sla:${ticketId}`, JSON.stringify(payload)],
    );
    log(`[F-I2] ticket ${ticketId} quá hạn SLA ${treGiay}s mà chưa ai nhận — leo thang`);

    if (opts.notifier) {
      try {
        await opts.notifier.notify({
          alert_type: 'sla_breach',
          severity: 3,
          title: 'Ticket quá hạn chưa ai nhận',
          body: `${row.title as string} — quá hạn ${Math.round(treGiay / 60)} phút. Cần người tiếp nhận ngay.`,
          vehicle_id: (row.vehicle_id as string | null) ?? null,
          ticket_id: ticketId,
          alert_id: (alert.rows[0]?.id as string | undefined) ?? null,
          data: payload,
        });
      } catch (err) {
        log(
          `[F-I2] gửi thông báo leo thang thất bại: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  return { qua_han: res.rows.length };
}
