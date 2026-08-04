// F-E1 — Danh sách CẢNH BÁO của đội xe, phục vụ khối "cảnh báo qua đêm" trên màn hình
// tổng quan (Hành trình 2 bước 1: "Mở portal: bản đồ toàn đội, xe offline, cảnh báo qua đêm").
//
// Khác GET /notifications: đó là HỘP THƯ của một người (F-F3 — đã gửi cho ai, đã đọc chưa),
// còn đây là SỰ KIỆN gắn với xe. Quản lý đội phải thấy được cảnh báo pin bắn cho TÀI XẾ
// của mình, chứ không chỉ những gì hệ thống gửi cho chính họ.
//
// Quyền: sheet 9 dòng "Nhận cảnh báo pin / bất thường" → xem alert.read trong permissions.ts.
import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { requireScopedAuth } from '../auth/guard';
import { vehicleScopeClause } from '../auth/scope';
import type { Queryable } from '../db';
import { AUTH_ERROR_RESPONSES } from '../errors';

export interface AlertRoutesDeps {
  db: Queryable;
}

const NullableString = Type.Union([Type.String(), Type.Null()]);

/**
 * TOÀN BỘ enum alert_type. Thiếu một giá trị ở đây thì lọc theo loại đó trả 400 chứ không
 * phải trả rỗng — lỗi khó thấy vì màn hình mặc định không lọc. Gồm 8 giá trị gốc của
 * migration 0008, cộng `data_quality` (0011), `reconciliation_mismatch` (0014),
 * `sos` (0022) và `sla_breach` (0023).
 * Thêm giá trị mới vào enum ở migration nào thì thêm vào đây trong cùng PR.
 */
const LoaiCanhBaoSchema = Type.Union([
  Type.Literal('battery_low'),
  Type.Literal('battery_critical'),
  Type.Literal('battery_anomaly'),
  Type.Literal('charging_violation'),
  Type.Literal('device_offline'),
  Type.Literal('device_tamper'),
  Type.Literal('geofence'),
  Type.Literal('maintenance'),
  Type.Literal('data_quality'),
  Type.Literal('reconciliation_mismatch'),
  Type.Literal('sos'),
  Type.Literal('sla_breach'),
]);

const TrangThaiSchema = Type.Union([
  Type.Literal('open'),
  Type.Literal('acknowledged'),
  Type.Literal('resolved'),
]);

export async function alertRoutes(app: FastifyInstance, deps: AlertRoutesDeps): Promise<void> {
  const { db } = deps;

  app.get(
    '/alerts',
    {
      config: { permission: 'alert.read' },
      schema: {
        tags: ['canh-bao'],
        summary: 'Danh sách cảnh báo pin / bất thường theo phạm vi (F-E1)',
        description:
          'Phạm vi theo vai trò như danh sách xe (sheet 9). Mặc định chỉ trả cảnh báo CHƯA ' +
          'xử lý (status = open) vì màn hình tổng quan cần "việc phải làm hôm nay", không phải ' +
          'lịch sử. `theo_loai` và `theo_muc_do` là số đếm trên TOÀN BỘ kết quả khớp bộ lọc, ' +
          'không phải chỉ trên trang đang xem — dùng cho các ô đếm ở đầu màn hình.',
        querystring: Type.Object({
          type: Type.Optional(LoaiCanhBaoSchema),
          status: Type.Optional(TrangThaiSchema),
          vehicle_id: Type.Optional(Type.String({ format: 'uuid' })),
          muc_do_toi_thieu: Type.Optional(
            Type.Integer({ minimum: 1, maximum: 3, description: '1 sớm · 2 chính · 3 nguy cấp' }),
          ),
          from: Type.Optional(Type.String({ format: 'date-time' })),
          to: Type.Optional(Type.String({ format: 'date-time' })),
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 500, default: 50 })),
        }),
        response: {
          200: Type.Object({
            total: Type.Integer(),
            theo_loai: Type.Record(Type.String(), Type.Integer()),
            theo_muc_do: Type.Record(Type.String(), Type.Integer()),
            items: Type.Array(
              Type.Object({
                id: Type.String({ format: 'uuid' }),
                type: Type.String(),
                severity: Type.Integer(),
                status: Type.String(),
                vehicle_id: Type.String({ format: 'uuid' }),
                vin: Type.String(),
                device_id: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
                payload: Type.Unknown(),
                triggered_at: Type.String({ format: 'date-time' }),
                resolved_at: NullableString,
              }),
            ),
          }),
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async (request) => {
      const auth = requireScopedAuth(request);
      const q = request.query as {
        type?: string;
        status?: string;
        vehicle_id?: string;
        muc_do_toi_thieu?: number;
        from?: string;
        to?: string;
        limit?: number;
      };

      const scope = vehicleScopeClause(auth, 'v', 1);
      const params: unknown[] = [...scope.params];
      const filters = [scope.sql];

      // Mặc định 'open': màn hình tổng quan là danh sách việc phải xử lý. Truyền status
      // tường minh để xem lịch sử.
      params.push(q.status ?? 'open');
      filters.push(`a.status = $${params.length}::alert_status`);

      if (q.type) {
        params.push(q.type);
        filters.push(`a.type = $${params.length}::alert_type`);
      }
      if (q.vehicle_id) {
        params.push(q.vehicle_id);
        filters.push(`v.id = $${params.length}`);
      }
      if (q.muc_do_toi_thieu !== undefined) {
        params.push(q.muc_do_toi_thieu);
        filters.push(`a.severity >= $${params.length}`);
      }
      if (q.from) {
        params.push(q.from);
        filters.push(`a.triggered_at >= $${params.length}`);
      }
      if (q.to) {
        params.push(q.to);
        filters.push(`a.triggered_at <= $${params.length}`);
      }
      const where = filters.join(' AND ');

      // Cảnh báo có thể gắn vào XE (a.vehicle_id) hoặc vào THIẾT BỊ (a.device_id) — xem
      // ràng buộc CHECK của migration 0008. Quy về xe để áp được phạm vi sheet 9.
      // JOIN thường (không LEFT): cảnh báo của thiết bị chưa gắn xe nào không thuộc đội nào
      // nên không hiện ở màn hình đội — GET /devices/health là chỗ xem thiết bị rời.
      const FROM_JOIN = `
        FROM alerts a
        LEFT JOIN devices dev ON dev.id = a.device_id
        JOIN vehicles v ON v.id = COALESCE(a.vehicle_id, dev.vehicle_id)`;

      const demRes = await db.query(
        `SELECT a.type::text AS type, a.severity, count(*)::int AS n
         ${FROM_JOIN}
         WHERE ${where}
         GROUP BY a.type, a.severity`,
        params,
      );

      const theoLoai: Record<string, number> = {};
      const theoMucDo: Record<string, number> = {};
      let total = 0;
      for (const r of demRes.rows) {
        const n = r.n as number;
        const loai = r.type as string;
        const mucDo = String(r.severity as number);
        theoLoai[loai] = (theoLoai[loai] ?? 0) + n;
        theoMucDo[mucDo] = (theoMucDo[mucDo] ?? 0) + n;
        total += n;
      }

      const res = await db.query(
        `SELECT a.id, a.type::text AS type, a.severity, a.status::text AS status,
                v.id AS vehicle_id, v.vin, a.device_id, a.payload,
                a.triggered_at, a.resolved_at
         ${FROM_JOIN}
         WHERE ${where}
         -- Nguy cấp lên trước, rồi mới đến mới nhất: màn hình tổng quan phải cho thấy
         -- việc nguy hiểm nhất ở dòng đầu, không phải việc vừa xảy ra nhất.
         ORDER BY a.severity DESC, a.triggered_at DESC
         LIMIT $${params.length + 1}`,
        [...params, q.limit ?? 50],
      );

      return {
        total,
        theo_loai: theoLoai,
        theo_muc_do: theoMucDo,
        items: res.rows.map((r) => ({
          ...r,
          triggered_at: (r.triggered_at as Date).toISOString(),
          resolved_at: r.resolved_at instanceof Date ? r.resolved_at.toISOString() : null,
        })),
      };
    },
  );
}
