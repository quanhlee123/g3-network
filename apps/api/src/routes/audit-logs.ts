// F-F1 · QUY TẮC 5 / NF-06 — Đọc nhật ký truy cập dữ liệu vị trí xe.
//
// Ghi nhật ký (audit.ts) mà không ai đọc được thì chỉ là bảng chết. Nghị định 13/2023 cho
// chủ thể dữ liệu quyền biết ai đã xem dữ liệu của mình — muốn trả lời được câu đó thì
// phải có màn hình tra cứu, đây là API cho nó.
//
// Quyền: sheet 9 dòng "Quản trị dữ liệu & audit log" — Vận hành V, Bảo hành V, Admin ✓.
import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import type { Queryable } from '../db';
import { AUTH_ERROR_RESPONSES } from '../errors';

export interface AuditLogRoutesDeps {
  db: Queryable;
}

const NullableString = Type.Union([Type.String(), Type.Null()]);

export async function auditLogRoutes(
  app: FastifyInstance,
  deps: AuditLogRoutesDeps,
): Promise<void> {
  const { db } = deps;

  app.get(
    '/audit-logs',
    {
      config: { permission: 'audit.read' },
      schema: {
        tags: ['tai-khoan'],
        summary: 'Nhật ký truy cập dữ liệu vị trí xe (F-F1, NF-06)',
        description:
          'Mỗi dòng trả lời 4 câu của quy tắc 5: AI · LÚC NÀO · XE NÀO · LÝ DO.\n\n' +
          'Hai hành động: `vehicle_location.read` (đã xem được) và `vehicle_location.denied` ' +
          '(bị từ chối — vẫn ghi, vì "ai đã CỐ xem vị trí tài xế" cũng là hồ sơ điều tra).\n\n' +
          'Dòng của BẢN ĐỒ TOÀN ĐỘI có `vehicle_id` rỗng: một lần xem bản đồ là một hành vi ' +
          'truy cập nhiều xe, danh sách xe nằm ở `so_xe` / `metadata.vehicle_ids` ' +
          '(xem docs/architecture/rbac-matrix.md R-13).',
        querystring: Type.Object({
          user_id: Type.Optional(Type.String({ format: 'uuid' })),
          vehicle_id: Type.Optional(Type.String({ format: 'uuid' })),
          action: Type.Optional(
            Type.Union([
              Type.Literal('vehicle_location.read'),
              Type.Literal('vehicle_location.denied'),
            ]),
          ),
          from: Type.Optional(Type.String({ format: 'date-time' })),
          to: Type.Optional(Type.String({ format: 'date-time' })),
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 500, default: 100 })),
          offset: Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
        }),
        response: {
          200: Type.Object({
            total: Type.Integer({ description: 'Tổng số dòng khớp bộ lọc (không chỉ trang này)' }),
            limit: Type.Integer(),
            offset: Type.Integer(),
            items: Type.Array(
              Type.Object({
                id: Type.Integer(),
                occurred_at: Type.String({ format: 'date-time' }),
                action: Type.String(),
                user_id: Type.String({ format: 'uuid' }),
                user_name: Type.String(),
                user_role: Type.String(),
                vehicle_id: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
                vin: NullableString,
                reason: Type.String(),
                ticket_id: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
                /** Số xe đã hiện trong một lần xem bản đồ; null với truy cập một xe. */
                so_xe: Type.Union([Type.Integer(), Type.Null()]),
                metadata: Type.Unknown(),
              }),
            ),
          }),
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async (request) => {
      // Không gọi requireScopedAuth: cả ba vai trò có `audit.read` đều ở phạm vi `all`
      // (sheet 9 cho "V"/"✓" toàn bộ, không có dấu \*), nên không có gì để lọc theo đội.
      // Guard đã chặn mọi vai trò khác trước khi tới đây.
      const q = request.query as {
        user_id?: string;
        vehicle_id?: string;
        action?: string;
        from?: string;
        to?: string;
        limit?: number;
        offset?: number;
      };
      const limit = q.limit ?? 100;
      const offset = q.offset ?? 0;

      const params: unknown[] = [];
      const filters: string[] = [];
      if (q.user_id) {
        params.push(q.user_id);
        filters.push(`a.user_id = $${String(params.length)}`);
      }
      if (q.vehicle_id) {
        params.push(q.vehicle_id);
        // Xe có thể nằm ở cột vehicle_id (xem 1 xe) HOẶC trong metadata.vehicle_ids
        // (xem bản đồ đội). Tra cứu "ai đã xem vị trí xe này" mà bỏ sót vế sau thì
        // trả lời sai cho chính câu hỏi mà Nghị định 13/2023 cho phép chủ thể dữ liệu hỏi.
        filters.push(
          `(a.vehicle_id = $${String(params.length)}
            OR a.metadata -> 'vehicle_ids' @> to_jsonb($${String(params.length)}::text))`,
        );
      }
      if (q.action) {
        params.push(q.action);
        filters.push(`a.action = $${String(params.length)}`);
      }
      if (q.from) {
        params.push(q.from);
        filters.push(`a.occurred_at >= $${String(params.length)}`);
      }
      if (q.to) {
        params.push(q.to);
        filters.push(`a.occurred_at <= $${String(params.length)}`);
      }
      const where = filters.length > 0 ? filters.join(' AND ') : 'true';

      const tongRes = await db.query(
        `SELECT count(*)::int AS n FROM audit_logs a WHERE ${where}`,
        params,
      );

      const res = await db.query(
        `SELECT a.id, a.occurred_at, a.action, a.user_id,
                u.full_name AS user_name, u.role::text AS user_role,
                a.vehicle_id, v.vin, a.reason, a.ticket_id,
                (a.metadata ->> 'so_xe')::int AS so_xe,
                a.metadata
         FROM audit_logs a
         JOIN users u ON u.id = a.user_id
         LEFT JOIN vehicles v ON v.id = a.vehicle_id
         WHERE ${where}
         ORDER BY a.occurred_at DESC, a.id DESC
         LIMIT $${String(params.length + 1)} OFFSET $${String(params.length + 2)}`,
        [...params, limit, offset],
      );

      return {
        total: tongRes.rows[0]!.n as number,
        limit,
        offset,
        items: res.rows.map((r) => ({
          ...r,
          id: Number(r.id),
          occurred_at: (r.occurred_at as Date).toISOString(),
          so_xe: r.so_xe === null ? null : Number(r.so_xe),
        })),
      };
    },
  );

  // Đọc nhật ký KHÔNG tự ghi thêm một dòng nhật ký: quy tắc 5 nói về truy cập dữ liệu
  // VỊ TRÍ XE, mà bảng audit_logs không chứa toạ độ — chỉ chứa việc ai đã xem. Nếu Legal
  // yêu cầu meta-audit thì thêm ở đây và ghi vào docs/architecture/rbac-matrix.md.
}
