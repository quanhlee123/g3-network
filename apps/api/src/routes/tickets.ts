// F-I2 — Nút SOS + danh sách ticket + nhận ticket (đồng hồ SLA).
//
// Ràng buộc quan trọng nhất của luồng này KHÔNG nằm ở đây mà ở permissions.ts:
// CSKH chỉ xem được vị trí xe khi có ticket ĐANG MỞ (sheet 9). Ticket SOS chính là thứ
// mở quyền đó ra — và đóng ticket là đóng quyền lại. Có test riêng cho vòng đời này.
import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import type { INotifier } from '@g3/contracts';
import { requireScopedAuth } from '../auth/guard';
import { vehicleInScope, vehicleScopeClause } from '../auth/scope';
import type { Queryable } from '../db';
import { AUTH_ERROR_RESPONSES, ErrorSchema, sendError } from '../errors';
import { taoSos } from '../modules/tickets/sos';

export interface TicketRoutesDeps {
  db: Queryable;
  notifier?: INotifier;
}

const NullableString = Type.Union([Type.String(), Type.Null()]);

export async function ticketRoutes(app: FastifyInstance, deps: TicketRoutesDeps): Promise<void> {
  const { db } = deps;

  app.post(
    '/sos',
    {
      config: { permission: 'ticket.create' },
      schema: {
        tags: ['cskh'],
        summary: 'Tài xế bấm nút cứu hộ / CSKH (F-I2)',
        description:
          'Chỉ cần gửi VIN (và toạ độ nếu app có). Mã lỗi, SOC, vị trí cuối và các cảnh báo ' +
          'đang mở được hệ thống TỰ ĐÍNH KÈM từ DB — tài xế đang mắc kẹt không phải nhập gì. ' +
          'Tạo ticket ưu tiên CAO, hạn phản hồi 5 phút, báo ngay cho CSKH.',
        body: Type.Object({
          vin: Type.String({ minLength: 3, maxLength: 64 }),
          lat: Type.Optional(Type.Number({ minimum: -90, maximum: 90 })),
          lng: Type.Optional(Type.Number({ minimum: -180, maximum: 180 })),
          mo_ta: Type.Optional(Type.String({ maxLength: 500 })),
        }),
        response: {
          201: Type.Object({
            ticket_id: Type.String({ format: 'uuid' }),
            sla_due_at: Type.String({ format: 'date-time' }),
            vin: Type.String(),
            soc_pct: Type.Union([Type.Number(), Type.Null()]),
            fault_codes: Type.Array(Type.String()),
            so_canh_bao_dang_mo: Type.Integer(),
          }),
          404: ErrorSchema,
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async (request, reply) => {
      const auth = requireScopedAuth(request);
      const body = request.body as { vin: string; lat?: number; lng?: number; mo_ta?: string };

      const xe = await db.query(`SELECT id FROM vehicles WHERE vin = $1`, [body.vin]);
      const vehicleId = xe.rows[0]?.id as string | undefined;
      // Cùng một câu trả lời cho "không tồn tại" và "ngoài phạm vi" — không lộ xe đội khác.
      if (vehicleId === undefined || !(await vehicleInScope(db, auth, vehicleId))) {
        return sendError(
          reply,
          404,
          'khong_tim_thay_xe',
          'Không tìm thấy xe trong phạm vi của bạn.',
        );
      }

      const kq = await taoSos({
        db,
        vehicleId,
        userId: auth.userId,
        moTa: body.mo_ta ?? null,
        viTri:
          body.lat !== undefined && body.lng !== undefined
            ? { lat: body.lat, lng: body.lng }
            : null,
        ...(deps.notifier ? { notifier: deps.notifier } : {}),
        log: (m) => app.log.info(m),
      });

      return reply.code(201).send({
        ticket_id: kq.ticket_id,
        sla_due_at: kq.sla_due_at,
        vin: kq.ngu_canh.vin,
        soc_pct: kq.ngu_canh.soc_pct,
        fault_codes: kq.ngu_canh.fault_codes,
        so_canh_bao_dang_mo: kq.ngu_canh.canh_bao_dang_mo.length,
      });
    },
  );

  app.get(
    '/tickets',
    {
      config: { permission: 'ticket.read' },
      schema: {
        tags: ['cskh'],
        summary: 'Danh sách ticket trong phạm vi của người gọi (F-I1/F-I2)',
        querystring: Type.Object({
          trang_thai: Type.Optional(
            Type.Union([
              Type.Literal('open'),
              Type.Literal('in_progress'),
              Type.Literal('resolved'),
              Type.Literal('closed'),
            ]),
          ),
          chua_nhan: Type.Optional(Type.Boolean({ description: 'Chỉ ticket chưa ai nhận' })),
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200, default: 50 })),
        }),
        response: {
          200: Type.Object({
            total: Type.Integer(),
            items: Type.Array(
              Type.Object({
                id: Type.String({ format: 'uuid' }),
                channel: Type.String(),
                status: Type.String(),
                priority: Type.String(),
                title: Type.String(),
                vin: NullableString,
                sla_due_at: NullableString,
                acknowledged_at: NullableString,
                escalated_at: NullableString,
                created_at: Type.String(),
              }),
            ),
          }),
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async (request) => {
      const auth = requireScopedAuth(request);
      const q = request.query as { trang_thai?: string; chua_nhan?: boolean; limit?: number };

      // Ticket KHÔNG gắn xe (vd hỏi đáp chung) chỉ vai trò phạm vi 'all' mới thấy —
      // với tài xế/QL đội thì không có xe nghĩa là không thuộc phạm vi nào của họ.
      const scope = vehicleScopeClause(auth, 'v', 1);
      const params: unknown[] = [...scope.params];
      const filters = [
        auth.grant.scope === 'all' ? `(${scope.sql} OR t.vehicle_id IS NULL)` : scope.sql,
      ];
      if (q.trang_thai !== undefined) {
        params.push(q.trang_thai);
        filters.push(`t.status = $${params.length}::ticket_status`);
      }
      if (q.chua_nhan === true) filters.push('t.acknowledged_at IS NULL');
      params.push(q.limit ?? 50);

      const res = await db.query(
        `SELECT t.id, t.channel::text AS channel, t.status::text AS status,
                t.priority::text AS priority, t.title, v.vin,
                t.sla_due_at, t.acknowledged_at, t.escalated_at, t.created_at
         FROM tickets t
         LEFT JOIN vehicles v ON v.id = t.vehicle_id
         WHERE ${filters.join(' AND ')}
         ORDER BY t.created_at DESC
         LIMIT $${params.length}`,
        params,
      );

      return {
        total: res.rows.length,
        items: res.rows.map((r) => ({
          ...r,
          sla_due_at: r.sla_due_at instanceof Date ? r.sla_due_at.toISOString() : null,
          acknowledged_at:
            r.acknowledged_at instanceof Date ? r.acknowledged_at.toISOString() : null,
          escalated_at: r.escalated_at instanceof Date ? r.escalated_at.toISOString() : null,
          created_at: (r.created_at as Date).toISOString(),
        })),
      };
    },
  );

  app.post(
    '/tickets/:id/nhan',
    {
      config: { permission: 'ticket.handle' },
      schema: {
        tags: ['cskh'],
        summary: 'CSKH nhận xử lý ticket — dừng đồng hồ SLA (F-I2)',
        description:
          'Đồng hồ SLA của F-I2 đo tới lúc CÓ NGƯỜI NHẬN, không phải lúc xong việc: ' +
          'cam kết là "gọi lại ≤5 phút", không phải "sửa xong trong 5 phút".',
        params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
        response: {
          200: Type.Object({
            id: Type.String({ format: 'uuid' }),
            status: Type.String(),
            acknowledged_at: Type.String({ format: 'date-time' }),
            tre_han: Type.Boolean(),
          }),
          404: ErrorSchema,
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async (request, reply) => {
      const auth = requireScopedAuth(request);
      const { id } = request.params as { id: string };

      // COALESCE: nhận lần hai không dời mốc — hồ sơ SLA phải giữ lần nhận ĐẦU TIÊN.
      const res = await db.query(
        `UPDATE tickets
         SET acknowledged_at = COALESCE(acknowledged_at, now()),
             acknowledged_by = COALESCE(acknowledged_by, $2),
             status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END
         WHERE id = $1 AND status IN ('open', 'in_progress')
         RETURNING id, status::text AS status, acknowledged_at, sla_due_at`,
        [id, auth.userId],
      );
      const row = res.rows[0];
      if (!row) {
        return sendError(
          reply,
          404,
          'khong_tim_thay_ticket',
          'Không có ticket đang mở với mã này.',
        );
      }
      const nhanLuc = row.acknowledged_at as Date;
      const han = row.sla_due_at as Date | null;
      return {
        id: row.id as string,
        status: row.status as string,
        acknowledged_at: nhanLuc.toISOString(),
        tre_han: han !== null && nhanLuc.getTime() > han.getTime(),
      };
    },
  );
}
