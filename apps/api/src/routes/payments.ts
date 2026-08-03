// F-H1 — API thanh toán phiên sạc (SANDBOX ONLY).
//
// Webhook là route CÔNG KHAI có chủ ý: cổng thanh toán không đăng nhập được vào hệ mình.
// Cơ chế xác thực của nó là CHỮ KÝ HMAC, kiểm trong `docWebhook()` của từng cổng
// (@g3/contracts). Đây là ngoại lệ DUY NHẤT của "mặc định TỪ CHỐI" ngoài health/docs/đăng
// nhập, và nó được đánh dấu rõ ở đây để lần review nào cũng nhìn thấy.
//
// KHÔNG CÓ ở đây (mục Ranh giới CLAUDE.md + prompt 08.4):
//   - Bất kỳ trường nào nhận dữ liệu thẻ. Người dùng nhập trên trang của cổng.
//   - Cấu hình production. @g3/payments từ chối khởi động nếu URL không phải sandbox.
//   - Momo — để nhà thầu làm.
import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import type { ICsmsCommander, IPaymentGateway } from '@g3/contracts';
import { requireScopedAuth } from '../auth/guard';
import { vehicleInScope, vehicleScopeClause } from '../auth/scope';
import type { ApiConfig } from '../config';
import type { Queryable } from '../db';
import { AUTH_ERROR_RESPONSES, ErrorSchema, sendError } from '../errors';
import {
  LoiThanhToan,
  phienChuaThu,
  quetQrBatDauSac,
  taoGiaoDichChoPhien,
  taoGiaoDichChoPhienOcpp,
  xuLyWebhook,
  type ThanhToanOptions,
} from '../modules/payments/service';

export interface PaymentRoutesDeps {
  db: Queryable;
  config: ApiConfig;
  cong: IPaymentGateway;
  csms?: ICsmsCommander;
}

const NullableString = Type.Union([Type.String(), Type.Null()]);
const NullableNumber = Type.Union([Type.Number(), Type.Null()]);

const GiaoDichSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  reference: Type.String(),
  session_id: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  ocpp_transaction_id: NullableString,
  method: Type.String(),
  amount_vnd: Type.Number({ description: 'VNĐ (NF-17)' }),
  energy_kwh: NullableNumber,
  status: Type.String({ description: 'pending | succeeded | failed | refunded' }),
  pay_url: NullableString,
  gateway_ref: NullableString,
  expires_at: NullableString,
  paid_at: NullableString,
  created_at: Type.String({ format: 'date-time' }),
});

export async function paymentRoutes(app: FastifyInstance, deps: PaymentRoutesDeps): Promise<void> {
  const { db, config, cong } = deps;
  const opts: ThanhToanOptions = {
    cong,
    giaVndMoiKwh: config.reconcile.giaVndMoiKwh,
    ...(deps.csms ? { csms: deps.csms } : {}),
    ...(config.thanhToan.returnUrl ? { returnUrl: config.thanhToan.returnUrl } : {}),
    log: (m) => app.log.info(m),
  };

  app.post(
    '/payments/qr/start',
    {
      config: { permission: 'payment.start' },
      schema: {
        tags: ['thanh-toan'],
        summary: 'Quét QR trên trụ để bắt đầu sạc (F-H1, bước 1/3)',
        description:
          'Mã QR trên trụ chứa mã trạm + số trụ. Hệ thống gửi RemoteStart qua CSMS (OCPP 1.6J). ' +
          '"Đã gửi lệnh" KHÔNG có nghĩa phiên đã mở — trụ mở phiên xong mới gửi StartTransaction. ' +
          'CHƯA tính tiền ở bước này: chưa sạc thì chưa biết bao nhiêu kWh.',
        body: Type.Object({
          station_code: Type.String({ minLength: 1, maxLength: 64 }),
          connector_id: Type.Integer({ minimum: 1 }),
          vehicle_id: Type.String({ format: 'uuid' }),
        }),
        response: {
          200: Type.Object({
            trang_thai: Type.String({ description: 'da_gui_lenh | tru_tu_choi' }),
            station_code: Type.String(),
            connector_id: Type.Integer(),
            vin: Type.String(),
            ghi_chu: Type.String(),
          }),
          404: ErrorSchema,
          503: ErrorSchema,
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async (request, reply) => {
      const auth = requireScopedAuth(request);
      const b = request.body as {
        station_code: string;
        connector_id: number;
        vehicle_id: string;
      };

      if (!(await vehicleInScope(db, auth, b.vehicle_id))) {
        return sendError(
          reply,
          404,
          'khong_tim_thay_xe',
          'Không tìm thấy xe trong phạm vi của bạn.',
        );
      }
      const tram = await db.query(
        `SELECT 1 FROM charging_stations s
         JOIN connectors c ON c.station_id = s.id
         WHERE s.code = $1 AND c.ocpp_connector_id = $2`,
        [b.station_code, b.connector_id],
      );
      if ((tram.rowCount ?? 0) === 0) {
        return sendError(
          reply,
          404,
          'khong_tim_thay_tru',
          `Không tìm thấy trụ số ${b.connector_id} tại trạm "${b.station_code}".`,
        );
      }

      try {
        return await quetQrBatDauSac(db, opts, {
          stationCode: b.station_code,
          connectorId: b.connector_id,
          vehicleId: b.vehicle_id,
        });
      } catch (err) {
        // CSMS chết KHÔNG được báo thành lỗi hệ thống chung chung — tài xế đang đứng ở trụ
        // cần biết là thử lại được hay phải gọi CSKH.
        request.log.error({ err }, 'F-H1: không gửi được RemoteStart');
        return sendError(
          reply,
          503,
          'khong_ket_noi_duoc_tru',
          'Chưa gửi được lệnh tới trụ sạc. Thử lại sau ít phút hoặc bấm SOS để được hỗ trợ.',
        );
      }
    },
  );

  app.post(
    '/payments/session/:id',
    {
      config: { permission: 'payment.start' },
      schema: {
        tags: ['thanh-toan'],
        summary: 'Tạo lệnh thanh toán cho phiên sạc đã kết thúc (F-H1, bước 2/3)',
        description:
          'Tiền = kWh công tơ trụ × đơn giá. Gọi lại nhiều lần cho cùng phiên KHÔNG tạo giao ' +
          'dịch mới — trả lại giao dịch đang chờ (app mất mạng rồi mở lại là chuyện thường). ' +
          'App mở `pay_url` hoặc dựng QR từ nó.',
        params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
        response: {
          200: GiaoDichSchema,
          400: ErrorSchema,
          404: ErrorSchema,
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async (request, reply) => {
      const auth = requireScopedAuth(request);
      const { id } = request.params as { id: string };

      const scope = vehicleScopeClause(auth, 'v', 2);
      const trongPhamVi = await db.query(
        `SELECT 1 FROM charging_sessions cs
         JOIN vehicles v ON v.id = cs.vehicle_id
         WHERE cs.id = $1 AND (${scope.sql})`,
        [id, ...scope.params],
      );
      if ((trongPhamVi.rowCount ?? 0) === 0) {
        return sendError(reply, 404, 'khong_tim_thay_phien', 'Không tìm thấy phiên sạc.');
      }

      try {
        return await taoGiaoDichChoPhien(db, opts, id, request.ip);
      } catch (err) {
        if (err instanceof LoiThanhToan) return sendError(reply, 400, err.ma, err.message);
        throw err;
      }
    },
  );

  app.post(
    '/payments/ocpp-transaction/:transactionId',
    {
      config: { permission: 'payment.start' },
      schema: {
        tags: ['thanh-toan'],
        summary: 'Tạo lệnh thanh toán khi phiên CHƯA kịp chốt (F-H1)',
        description:
          'Dùng khi tài xế rút súng và trả tiền ngay tại trụ, còn StopTransaction của trụ về ' +
          'muộn (mất kết nối, retry — NF-09). Giao dịch neo vào mã phiên OCPP; `session_id` để ' +
          'trống và được NỐI LẠI khi phiên sạc về. Tiền tính theo chỉ số công tơ trụ báo gần nhất.',
        params: Type.Object({ transactionId: Type.Integer({ minimum: 1 }) }),
        response: {
          200: GiaoDichSchema,
          400: ErrorSchema,
          404: ErrorSchema,
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async (request, reply) => {
      const auth = requireScopedAuth(request);
      const { transactionId } = request.params as { transactionId: number };

      const scope = vehicleScopeClause(auth, 'v', 2);
      const trongPhamVi = await db.query(
        `SELECT 1 FROM ocpp_transactions t
         JOIN vehicles v ON v.id = t.vehicle_id
         WHERE t.transaction_id = $1 AND (${scope.sql})`,
        [transactionId, ...scope.params],
      );
      if ((trongPhamVi.rowCount ?? 0) === 0) {
        return sendError(reply, 404, 'khong_tim_thay_phien', 'Không tìm thấy phiên sạc.');
      }

      try {
        return await taoGiaoDichChoPhienOcpp(db, opts, transactionId, request.ip);
      } catch (err) {
        if (err instanceof LoiThanhToan) return sendError(reply, 400, err.ma, err.message);
        throw err;
      }
    },
  );

  app.get(
    '/payments',
    {
      config: { permission: 'payment.read' },
      schema: {
        tags: ['thanh-toan'],
        summary: 'Danh sách giao dịch thanh toán theo quyền (F-H1)',
        querystring: Type.Object({
          session_id: Type.Optional(Type.String({ format: 'uuid' })),
          status: Type.Optional(Type.String()),
          chua_noi_phien: Type.Optional(
            Type.Boolean({ description: 'Chỉ giao dịch đã thu tiền mà chưa nối được phiên sạc' }),
          ),
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 500, default: 50 })),
        }),
        response: {
          200: Type.Object({ total: Type.Integer(), items: Type.Array(GiaoDichSchema) }),
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async (request) => {
      const auth = requireScopedAuth(request);
      const q = request.query as {
        session_id?: string;
        status?: string;
        chua_noi_phien?: boolean;
        limit?: number;
      };

      const scope = vehicleScopeClause(auth, 'v', 1);
      const params: unknown[] = [...scope.params];
      // Giao dịch chưa nối phiên vẫn có vehicle_id nên phạm vi vai trò vẫn áp được.
      const dieuKien = [scope.sql];
      if (q.session_id) {
        params.push(q.session_id);
        dieuKien.push(`p.session_id = $${params.length}`);
      }
      if (q.status) {
        params.push(q.status);
        dieuKien.push(`p.status = $${params.length}::payment_status`);
      }
      if (q.chua_noi_phien === true) {
        dieuKien.push(`p.session_id IS NULL AND p.status = 'succeeded'`);
      }

      const res = await db.query(
        `SELECT p.id, p.reference, p.session_id, p.ocpp_transaction_id, p.method::text AS method,
                p.amount_vnd::float8 AS amount_vnd, p.energy_kwh::float8 AS energy_kwh,
                p.status::text AS status, p.pay_url, p.gateway_ref, p.expires_at, p.paid_at,
                p.created_at
         FROM payment_transactions p
         LEFT JOIN vehicles v ON v.id = p.vehicle_id
         WHERE ${dieuKien.join(' AND ')}
         ORDER BY p.created_at DESC
         LIMIT $${params.length + 1}`,
        [...params, q.limit ?? 50],
      );
      return {
        total: res.rows.length,
        items: res.rows.map((r) => ({
          ...r,
          expires_at: iso(r.expires_at),
          paid_at: iso(r.paid_at),
          created_at: iso(r.created_at) ?? '',
        })),
      };
    },
  );

  app.get(
    '/payments/chua-thu',
    {
      config: { permission: 'payment.read' },
      schema: {
        tags: ['thanh-toan'],
        summary: 'Phiên sạc đã kết thúc nhưng CHƯA thu được tiền (F-H1 — "thu sau")',
        description:
          'Hiện thực hoá tiêu chí F-H1 "hoạt động khi sóng yếu (giữ phiên, thu sau)": xe sạc ở ' +
          'vùng không sóng, phiên vẫn đóng đúng, tiền thu khi kết nối trở lại. Danh sách này là ' +
          'việc cần làm của vận hành, không phải lỗi hệ thống.',
        querystring: Type.Object({
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 500, default: 100 })),
        }),
        response: {
          200: Type.Object({
            total: Type.Integer(),
            items: Type.Array(
              Type.Object({
                session_id: Type.String({ format: 'uuid' }),
                vin: Type.String(),
                ma_tram: Type.String(),
                energy_kwh: NullableNumber,
              }),
            ),
          }),
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async (request) => {
      const q = request.query as { limit?: number };
      const items = await phienChuaThu(db, q.limit ?? 100);
      return { total: items.length, items };
    },
  );

  // -----------------------------------------------------------------------------------
  // WEBHOOK — route CÔNG KHAI có chủ ý. Xác thực bằng CHỮ KÝ, không bằng token.
  // -----------------------------------------------------------------------------------
  app.post(
    '/payments/webhook/:cong',
    {
      config: { public: true },
      schema: {
        tags: ['thanh-toan'],
        summary: 'Webhook đối soát của cổng thanh toán (F-H1, bước 3/3)',
        description:
          'CÔNG KHAI vì cổng thanh toán không đăng nhập được — xác thực bằng CHỮ KÝ HMAC, ' +
          'chữ ký sai thì từ chối. IDEMPOTENT: cổng gọi lại cùng một giao dịch (retry khi ' +
          'không nhận được phản hồi) chỉ ghi nhận MỘT lần, chốt chặn là cột UNIQUE ' +
          '`gateway_webhook_id` ở DB. Webhook đến trước khi phiên sạc được ghi vẫn nhận, và ' +
          'nối phiên lại sau.',
        params: Type.Object({ cong: Type.String() }),
        response: {
          200: Type.Record(Type.String(), Type.String()),
          400: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { cong: tenCong } = request.params as { cong: string };
      if (tenCong !== cong.method && tenCong !== 'mock') {
        return sendError(
          reply,
          404,
          'cong_khong_dung',
          `Cổng "${tenCong}" không được cấu hình trên hệ thống này.`,
        );
      }

      // Cổng có thể gửi qua query string (VNPay IPN) hoặc body.
      const duLieu: Record<string, string> = {
        ...chuoiHoa(request.query as Record<string, unknown>),
        ...chuoiHoa((request.body ?? {}) as Record<string, unknown>),
      };

      const ketQua = await xuLyWebhook(db, opts, duLieu);
      const ack = cong.phanHoiWebhook({
        chapNhan: ketQua.chapNhan,
        ...(ketQua.daXuLy ? { daXuLy: true } : {}),
        ...(ketQua.lyDo ? { lyDo: ketQua.lyDo } : {}),
      });
      // HTTP luôn 200 — xem WebhookAck trong @g3/contracts: cổng báo kết quả bằng body,
      // trả 4xx/5xx sẽ bị hiểu là "chưa nhận" và cổng retry mãi.
      return reply.status(200).send(ack.body);
    },
  );
}

/** Chuẩn hoá mọi giá trị về chuỗi — cổng gửi form-urlencoded nên số cũng là chuỗi. */
function chuoiHoa(o: Record<string, unknown>): Record<string, string> {
  const ra: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === null || v === undefined) continue;
    ra[k] = String(v);
  }
  return ra;
}

function iso(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}
