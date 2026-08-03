// F-H1 — Thanh toán phiên sạc (SANDBOX). Luồng: quét QR → RemoteStart → sạc →
// StopTransaction → tạo giao dịch → thanh toán → webhook đối soát.
//
// Toàn bộ module này xoay quanh MỘT sự thật khó chịu về thứ tự thời gian:
//
//     Tiền có thể về TRƯỚC khi phiên sạc được ghi vào DB.
//
// Trụ mất kết nối giữa phiên rồi gửi StopTransaction bù sau (chuyện thường — NF-09, và CSMS
// đã cố ý giữ phiên mở trong tình huống đó), trong khi người dùng đã bấm trả tiền xong.
// Ba cách xử lý sai mà module này tránh:
//   - Từ chối webhook vì "chưa có phiên" → tiền đã trừ của khách mà hệ thống không ghi nhận.
//   - Tạo phiên sạc giả để có chỗ gắn tiền → bịa dữ liệu vào bảng append-only có giá trị
//     pháp lý bảo hành (NF-11). Không bao giờ.
//   - Chờ đồng bộ → webhook timeout, cổng retry, và bài toán trùng lặp nặng hơn.
//
// Cách làm: giao dịch neo vào `ocpp_transaction_id` (có từ lúc trụ mở phiên) chứ không neo
// vào `session_id`. Phiên về muộn thì NỐI LẠI bằng đúng mã đó.
import type { ICsmsCommander, IPaymentGateway, PaymentCallback } from '@g3/contracts';
import { randomUUID } from 'node:crypto';
import type { Queryable } from '../../db';

export interface ThanhToanOptions {
  cong: IPaymentGateway;
  /** Đơn giá điện (VNĐ/kWh). Phase 1 là giá GIẢ, xem ADR-007 & Q3/Q9 (MỞ). */
  giaVndMoiKwh: number;
  csms?: ICsmsCommander;
  returnUrl?: string;
  log?: (msg: string) => void;
}

export interface KetQuaQuetQr {
  trang_thai: 'da_gui_lenh' | 'tru_tu_choi';
  station_code: string;
  connector_id: number;
  vin: string;
  ghi_chu: string;
}

/**
 * Bước 1 — Tài xế quét QR trên trụ, hệ thống bảo trụ mở phiên.
 *
 * KHÔNG tạo giao dịch thanh toán ở bước này: chưa sạc thì chưa biết bao nhiêu kWh, mà tạo
 * lệnh thu tiền theo số ước lượng rồi hoàn lại phần thừa là bài toán khác hẳn (và cần quyết
 * định nghiệp vụ chưa có). Tiền được tính sau khi phiên đóng, theo số kWh thật của công tơ.
 */
export async function quetQrBatDauSac(
  db: Queryable,
  opts: ThanhToanOptions,
  yeuCau: { stationCode: string; connectorId: number; vehicleId: string },
): Promise<KetQuaQuetQr> {
  const log = opts.log ?? (() => {});
  const xe = await db.query(`SELECT vin FROM vehicles WHERE id = $1`, [yeuCau.vehicleId]);
  const vin = xe.rows[0]?.vin as string | undefined;
  if (!vin) throw new Error('Không tìm thấy xe');

  if (!opts.csms) {
    throw new Error('Chưa cấu hình kết nối CSMS — không gửi được lệnh mở phiên');
  }
  // idTag = VIN xe GIẢ ở Phase 1 (ADR-005). D-02 (thẻ RFID) còn MỞ nên chưa có đường thẻ.
  const ketQua = await opts.csms.remoteStart(yeuCau.stationCode, yeuCau.connectorId, vin);
  log(`[F-H1] RemoteStart ${yeuCau.stationCode}#${yeuCau.connectorId} cho ${vin}: ${ketQua}`);

  return {
    trang_thai: ketQua === 'Accepted' ? 'da_gui_lenh' : 'tru_tu_choi',
    station_code: yeuCau.stationCode,
    connector_id: yeuCau.connectorId,
    vin,
    ghi_chu:
      ketQua === 'Accepted'
        ? 'Trụ đã nhận lệnh. Phiên sạc mở khi trụ gửi StartTransaction; tiền tính sau khi sạc xong.'
        : 'Trụ từ chối mở phiên (đang bận hoặc đang lỗi). Thử trụ khác hoặc báo CSKH.',
  };
}

export interface GiaoDich {
  id: string;
  reference: string;
  session_id: string | null;
  ocpp_transaction_id: string | null;
  method: string;
  amount_vnd: number;
  energy_kwh: number | null;
  status: string;
  pay_url: string | null;
  gateway_ref: string | null;
  expires_at: string | null;
  paid_at: string | null;
  created_at: string;
}

/**
 * Bước 2 — Phiên sạc đã đóng, tạo lệnh thu tiền.
 *
 * Gọi lại nhiều lần cho CÙNG một phiên KHÔNG tạo giao dịch mới: trả lại giao dịch đang chờ
 * (app mất mạng rồi mở lại là chuyện thường). Chỉ khi giao dịch cũ đã thất bại mới tạo cái
 * mới — người dùng phải trả lại được sau khi thẻ bị từ chối.
 */
export async function taoGiaoDichChoPhien(
  db: Queryable,
  opts: ThanhToanOptions,
  sessionId: string,
  ip?: string,
): Promise<GiaoDich> {
  const phienRes = await db.query(
    `SELECT cs.id, cs.vehicle_id, cs.station_id, cs.ocpp_transaction_id, cs.ended_at,
            cs.energy_kwh::float8 AS energy_kwh, v.vin, st.code AS ma_tram
     FROM charging_sessions cs
     JOIN vehicles v ON v.id = cs.vehicle_id
     JOIN charging_stations st ON st.id = cs.station_id
     WHERE cs.id = $1`,
    [sessionId],
  );
  const phien = phienRes.rows[0];
  if (!phien) throw new LoiThanhToan('khong_tim_thay_phien', 'Không tìm thấy phiên sạc.');
  if (phien.ended_at === null) {
    throw new LoiThanhToan(
      'phien_chua_dong',
      'Phiên sạc chưa kết thúc — chưa chốt được số kWh để tính tiền.',
    );
  }
  const kwh = phien.energy_kwh as number | null;
  if (kwh === null || kwh <= 0) {
    throw new LoiThanhToan(
      'phien_chua_co_kwh',
      'Phiên sạc chưa có số kWh từ công tơ trụ — chưa tính được tiền.',
    );
  }

  // Đã có giao dịch chờ/thành công cho phiên này thì trả lại chính nó (idempotent).
  const daCo = await db.query(
    `SELECT ${COT_GIAO_DICH} FROM payment_transactions
     WHERE session_id = $1 AND status IN ('pending', 'succeeded')
     ORDER BY created_at DESC LIMIT 1`,
    [sessionId],
  );
  if (daCo.rows[0]) return doiRow(daCo.rows[0]);

  const soTien = Math.round(kwh * opts.giaVndMoiKwh);
  const reference = taoMaThamChieu();
  const checkout = await opts.cong.taoThanhToan({
    reference,
    amountVnd: soTien,
    description: `Sac xe ${phien.vin as string} tai tram ${phien.ma_tram as string} - ${kwh.toFixed(3)} kWh`,
    ...(opts.returnUrl ? { returnUrl: opts.returnUrl } : {}),
    ...(ip ? { ipAddress: ip } : {}),
  });

  const res = await db.query(
    `INSERT INTO payment_transactions
       (session_id, vehicle_id, station_id, ocpp_transaction_id, reference, method, amount_vnd,
        energy_kwh, gia_vnd_moi_kwh, status, pay_url, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6::payment_method, $7, $8, $9, 'pending', $10, $11)
     RETURNING ${COT_GIAO_DICH}`,
    [
      sessionId,
      phien.vehicle_id,
      phien.station_id,
      phien.ocpp_transaction_id,
      reference,
      opts.cong.method,
      soTien,
      kwh,
      opts.giaVndMoiKwh,
      checkout.payUrl,
      checkout.expiresAt ?? null,
    ],
  );
  return doiRow(res.rows[0]!);
}

/**
 * Bước 2' — Tạo lệnh thu tiền khi phiên CHƯA được chốt vào charging_sessions.
 *
 * Tài xế rút súng, app hiện số kWh trụ đang báo và người dùng trả tiền ngay tại chỗ; còn
 * StopTransaction của trụ thì có thể về muộn (mất kết nối, retry — CSMS cố ý giữ phiên mở
 * trong tình huống đó). Giao dịch tạo ở đây neo vào `ocpp_transaction_id`, `session_id` để
 * NULL, và được nối lại khi phiên về.
 *
 * Đây là đường mà tình huống "webhook đến trước khi phiên đóng" đi qua — không phải ngoại lệ
 * cần chống đỡ, mà là một luồng hợp lệ của hệ thống.
 */
export async function taoGiaoDichChoPhienOcpp(
  db: Queryable,
  opts: ThanhToanOptions,
  transactionId: number,
  ip?: string,
): Promise<GiaoDich> {
  const txRes = await db.query(
    `SELECT t.transaction_id, t.station_id, t.vehicle_id, t.meter_start_wh, t.last_meter_wh,
            t.status::text AS status, v.vin, st.code AS ma_tram
     FROM ocpp_transactions t
     JOIN vehicles v ON v.id = t.vehicle_id
     JOIN charging_stations st ON st.id = t.station_id
     WHERE t.transaction_id = $1`,
    [transactionId],
  );
  const tx = txRes.rows[0];
  if (!tx) throw new LoiThanhToan('khong_tim_thay_phien', 'Không tìm thấy phiên sạc OCPP.');

  const batDau = tx.meter_start_wh as number;
  const hienTai = tx.last_meter_wh as number | null;
  if (hienTai === null) {
    throw new LoiThanhToan(
      'chua_co_so_cong_to',
      'Trụ chưa gửi chỉ số công tơ nào cho phiên này — chưa tính được tiền.',
    );
  }
  const kwh = Math.max(0, (hienTai - batDau) / 1000);
  if (kwh <= 0) {
    throw new LoiThanhToan('chua_sac_duoc_kwh', 'Phiên chưa nạp được kWh nào — chưa thu tiền.');
  }

  const maOcpp = String(transactionId);
  const daCo = await db.query(
    `SELECT ${COT_GIAO_DICH} FROM payment_transactions
     WHERE ocpp_transaction_id = $1 AND status IN ('pending', 'succeeded')
     ORDER BY created_at DESC LIMIT 1`,
    [maOcpp],
  );
  if (daCo.rows[0]) return doiRow(daCo.rows[0]);

  const soTien = Math.round(kwh * opts.giaVndMoiKwh);
  const reference = taoMaThamChieu();
  const checkout = await opts.cong.taoThanhToan({
    reference,
    amountVnd: soTien,
    description: `Sac xe ${tx.vin as string} tai tram ${tx.ma_tram as string} - ${kwh.toFixed(3)} kWh`,
    ...(opts.returnUrl ? { returnUrl: opts.returnUrl } : {}),
    ...(ip ? { ipAddress: ip } : {}),
  });

  // session_id để NULL có chủ ý — phiên chưa được ghi. Ràng buộc payment_transactions_co_neo
  // (migration 0027) cho phép vì đã có `reference`.
  const res = await db.query(
    `INSERT INTO payment_transactions
       (session_id, vehicle_id, station_id, ocpp_transaction_id, reference, method, amount_vnd,
        energy_kwh, gia_vnd_moi_kwh, status, pay_url, expires_at)
     VALUES (NULL, $1, $2, $3, $4, $5::payment_method, $6, $7, $8, 'pending', $9, $10)
     RETURNING ${COT_GIAO_DICH}`,
    [
      tx.vehicle_id,
      tx.station_id,
      maOcpp,
      reference,
      opts.cong.method,
      soTien,
      kwh,
      opts.giaVndMoiKwh,
      checkout.payUrl,
      checkout.expiresAt ?? null,
    ],
  );
  return doiRow(res.rows[0]!);
}

export interface KetQuaWebhook {
  chapNhan: boolean;
  daXuLy: boolean;
  lyDo?: string;
  giao_dich_id?: string;
  da_noi_phien?: boolean;
}

/**
 * Bước 3 — Cổng báo kết quả về.
 *
 * BA tình huống bắt buộc xử lý đúng, và cả ba đều là chuyện thường ngày chứ không phải lỗi:
 *
 *   a) Webhook đến HAI LẦN (cổng retry vì không nhận được phản hồi lần đầu).
 *      → `gateway_webhook_id` là cột UNIQUE ở DB. Lần hai bị chính DB chặn, không dựa vào
 *        việc tầng ứng dụng nhớ kiểm tra trước. Kết quả: đúng 1 giao dịch thành công.
 *
 *   b) Webhook đến TRƯỚC khi phiên sạc được ghi (trụ gửi StopTransaction muộn).
 *      → Ghi nhận tiền theo `reference`, để `session_id` NULL, rồi nối lại sau bằng
 *        `ocpp_transaction_id`. Không từ chối, không bịa phiên.
 *
 *   c) Số tiền cổng báo KHÁC số tiền đã yêu cầu.
 *      → Từ chối, giữ nguyên trạng thái cũ. Đây là dấu hiệu hoặc bị can thiệp, hoặc cấu
 *        hình sai — cả hai đều không được ghi nhận thành doanh thu.
 */
export async function xuLyWebhook(
  db: Queryable,
  opts: ThanhToanOptions,
  duLieu: Record<string, string>,
): Promise<KetQuaWebhook> {
  const log = opts.log ?? (() => {});

  let cb: PaymentCallback;
  try {
    // Chữ ký là cơ chế xác thực DUY NHẤT của endpoint này (không có token đăng nhập).
    cb = opts.cong.docWebhook(duLieu);
  } catch (err) {
    log(`[F-H1] TỪ CHỐI webhook: ${err instanceof Error ? err.message : String(err)}`);
    return { chapNhan: false, daXuLy: false, lyDo: 'chu_ky_khong_hop_le' };
  }
  if (cb.webhookId === '') {
    return { chapNhan: false, daXuLy: false, lyDo: 'thieu_dinh_danh_webhook' };
  }

  const gdRes = await db.query(
    `SELECT ${COT_GIAO_DICH} FROM payment_transactions WHERE reference = $1`,
    [cb.reference],
  );
  const gd = gdRes.rows[0];
  if (!gd) {
    log(`[F-H1] webhook cho mã tham chiếu lạ: ${cb.reference}`);
    return { chapNhan: false, daXuLy: false, lyDo: 'khong_tim_thay_giao_dich' };
  }
  const giaoDich = doiRow(gd);

  if (Math.round(cb.amountVnd) !== Math.round(giaoDich.amount_vnd)) {
    log(
      `[F-H1] TỪ CHỐI webhook ${cb.reference}: cổng báo ${cb.amountVnd} VNĐ ` +
        `nhưng yêu cầu là ${giaoDich.amount_vnd} VNĐ`,
    );
    return { chapNhan: false, daXuLy: false, lyDo: 'so_tien_khong_khop' };
  }

  // Chốt chặn chống trùng nằm ở DB: UPDATE chỉ ăn khi gateway_webhook_id còn trống.
  // Lần webhook thứ hai (cùng webhookId) không khớp điều kiện → 0 dòng bị sửa.
  const capNhat = await db.query(
    `UPDATE payment_transactions
     SET status = $2::payment_status,
         gateway_ref = coalesce($3, gateway_ref),
         gateway_webhook_id = $4,
         paid_at = CASE WHEN $2 = 'succeeded' THEN now() ELSE paid_at END,
         webhook_payload = $5::jsonb,
         updated_at = now()
     WHERE id = $1 AND gateway_webhook_id IS NULL
     RETURNING id`,
    [
      giaoDich.id,
      cb.status,
      cb.gatewayRef === '' ? null : cb.gatewayRef,
      cb.webhookId,
      JSON.stringify(duLieu),
    ],
  );

  if ((capNhat.rowCount ?? 0) === 0) {
    // Đã xử lý trước đó. Trả 'daXuLy' để cổng biết là NHẬN RỒI và ngừng retry —
    // trả lỗi ở đây sẽ khiến cổng gọi lại mãi.
    log(`[F-H1] webhook ${cb.reference} đã xử lý trước đó — bỏ qua, không ghi trùng`);
    return { chapNhan: true, daXuLy: true, giao_dich_id: giaoDich.id };
  }

  const daNoi = await noiPhienChoGiaoDich(db, giaoDich.id);
  log(
    `[F-H1] webhook ${cb.reference}: ${cb.status} · ${cb.amountVnd} VNĐ` +
      (daNoi ? ' · đã nối được phiên sạc' : ''),
  );
  return { chapNhan: true, daXuLy: false, giao_dich_id: giaoDich.id, da_noi_phien: daNoi };
}

/**
 * Nối một giao dịch mồ côi với phiên sạc của nó qua `ocpp_transaction_id`.
 * Trả về true nếu nối được. Không nối được KHÔNG phải lỗi — phiên có thể còn đang về.
 */
export async function noiPhienChoGiaoDich(db: Queryable, paymentId: string): Promise<boolean> {
  const res = await db.query(
    `UPDATE payment_transactions p
     SET session_id = cs.id, updated_at = now()
     FROM charging_sessions cs
     WHERE p.id = $1
       AND p.session_id IS NULL
       AND p.ocpp_transaction_id IS NOT NULL
       AND cs.ocpp_transaction_id = p.ocpp_transaction_id
     RETURNING p.id`,
    [paymentId],
  );
  return (res.rowCount ?? 0) > 0;
}

/**
 * Quét toàn bộ giao dịch mồ côi và nối với phiên đã về.
 * Chạy định kỳ: phiên sạc về muộn hàng giờ sau khi tiền đã thu (NF-09).
 */
export async function noiCacGiaoDichMoCoi(db: Queryable): Promise<number> {
  const res = await db.query(
    `UPDATE payment_transactions p
     SET session_id = cs.id, updated_at = now()
     FROM charging_sessions cs
     WHERE p.session_id IS NULL
       AND p.ocpp_transaction_id IS NOT NULL
       AND cs.ocpp_transaction_id = p.ocpp_transaction_id
     RETURNING p.id`,
  );
  return res.rowCount ?? 0;
}

/**
 * "Thu tiền sau" — các phiên đã đóng mà chưa có giao dịch thành công nào.
 *
 * Đây là danh sách hiện thực hoá tiêu chí F-H1 "hoạt động khi sóng yếu (giữ phiên, thu
 * sau)": xe sạc ở vùng không có sóng, phiên vẫn đóng đúng, tiền thu khi kết nối trở lại.
 */
export async function phienChuaThu(
  db: Queryable,
  gioiHan = 100,
): Promise<{ session_id: string; vin: string; ma_tram: string; energy_kwh: number | null }[]> {
  const res = await db.query(
    `SELECT cs.id AS session_id, v.vin, st.code AS ma_tram, cs.energy_kwh::float8 AS energy_kwh
     FROM charging_sessions cs
     JOIN vehicles v ON v.id = cs.vehicle_id
     JOIN charging_stations st ON st.id = cs.station_id
     WHERE cs.ended_at IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM payment_transactions p
         WHERE p.session_id = cs.id AND p.status = 'succeeded'
       )
     ORDER BY cs.ended_at DESC
     LIMIT $1`,
    [gioiHan],
  );
  return res.rows as unknown as {
    session_id: string;
    vin: string;
    ma_tram: string;
    energy_kwh: number | null;
  }[];
}

/** Lỗi nghiệp vụ có mã máy đọc được — route đổi thẳng thành phản hồi HTTP. */
export class LoiThanhToan extends Error {
  constructor(
    readonly ma: string,
    message: string,
  ) {
    super(message);
    this.name = 'LoiThanhToan';
  }
}

/** Mã tham chiếu gửi sang cổng. Không nhúng thông tin cá nhân — nó đi qua bên thứ ba. */
export function taoMaThamChieu(): string {
  return `G3${Date.now().toString(36).toUpperCase()}${randomUUID().slice(0, 8).toUpperCase()}`;
}

const COT_GIAO_DICH = `
  id, reference, session_id, ocpp_transaction_id, method::text AS method,
  amount_vnd::float8 AS amount_vnd, energy_kwh::float8 AS energy_kwh,
  status::text AS status, pay_url, gateway_ref, expires_at, paid_at, created_at`;

function doiRow(r: Record<string, unknown>): GiaoDich {
  return {
    id: r.id as string,
    reference: (r.reference as string | null) ?? '',
    session_id: (r.session_id as string | null) ?? null,
    ocpp_transaction_id: (r.ocpp_transaction_id as string | null) ?? null,
    method: r.method as string,
    amount_vnd: r.amount_vnd as number,
    energy_kwh: (r.energy_kwh as number | null) ?? null,
    status: r.status as string,
    pay_url: (r.pay_url as string | null) ?? null,
    gateway_ref: (r.gateway_ref as string | null) ?? null,
    expires_at: nhan(r.expires_at),
    paid_at: nhan(r.paid_at),
    created_at: nhan(r.created_at) ?? '',
  };
}

function nhan(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}
