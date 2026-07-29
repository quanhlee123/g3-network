// F-C6 · NF-10 — Xem kết quả đối soát 3 chiều + chạy tay job đối soát.
// Quyền theo sheet 9, dòng "Sản lượng điện / đối soát kWh": Vận hành G3 Energy ✓,
// Admin ✓, Chủ xe/QL đội V\* (chỉ đội mình).
import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { requireScopedAuth } from '../auth/guard';
import { vehicleScopeClause } from '../auth/scope';
import type { ApiConfig } from '../config';
import type { Queryable } from '../db';
import { AUTH_ERROR_RESPONSES, sendError } from '../errors';
import { chayDoiSoat } from '../modules/reconciliation/reconcile';

export interface ReconciliationRoutesDeps {
  db: Queryable;
  config: ApiConfig;
}

const NullableNumber = Type.Union([Type.Number(), Type.Null()]);
const NullableString = Type.Union([Type.String(), Type.Null()]);

const StatusSchema = Type.Union([
  Type.Literal('khop'),
  Type.Literal('lech'),
  Type.Literal('thieu_du_lieu'),
]);

export async function reconciliationRoutes(
  app: FastifyInstance,
  deps: ReconciliationRoutesDeps,
): Promise<void> {
  const { db, config } = deps;

  app.get(
    '/reconciliation/results',
    {
      config: { permission: 'reconciliation.read' },
      schema: {
        tags: ['doi-soat'],
        summary: 'Kết quả đối soát 3 chiều theo phiên sạc (F-C6, NF-10)',
        description:
          'kWh trụ (công tơ OCPP) ↔ kWh xe (ΔSOC × dung lượng pin, nội suy từ telematics) ↔ ' +
          'kWh quy từ số tiền giao dịch. Lệch > ngưỡng thì status = "lech" và có alert kèm theo. ' +
          '"thieu_du_lieu" KHÔNG phải là lệch — thường do xe mất sóng (NF-09), sẽ xét lại sau.',
        querystring: Type.Object({
          status: Type.Optional(StatusSchema),
          from: Type.Optional(Type.String({ format: 'date-time' })),
          to: Type.Optional(Type.String({ format: 'date-time' })),
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 500, default: 50 })),
        }),
        response: {
          200: Type.Object({
            nguong_pct: Type.Number(),
            tong_hop: Type.Object({
              khop: Type.Integer(),
              lech: Type.Integer(),
              thieu_du_lieu: Type.Integer(),
            }),
            items: Type.Array(
              Type.Object({
                session_id: Type.String({ format: 'uuid' }),
                vin: Type.String(),
                ma_tram: Type.String(),
                started_at: Type.String({ format: 'date-time' }),
                kwh_tru: NullableNumber,
                kwh_xe: NullableNumber,
                kwh_thanh_toan: NullableNumber,
                so_tien_vnd: NullableNumber,
                lech_xe_pct: NullableNumber,
                lech_tien_pct: NullableNumber,
                lech_max_pct: NullableNumber,
                status: StatusSchema,
                ghi_chu: NullableString,
                checked_at: Type.String({ format: 'date-time' }),
              }),
            ),
          }),
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async (request) => {
      const auth = requireScopedAuth(request);
      const q = request.query as { status?: string; from?: string; to?: string; limit?: number };

      const scope = vehicleScopeClause(auth, 'v', 1);
      const params: unknown[] = [...scope.params];
      const filters = [scope.sql];
      if (q.status) {
        params.push(q.status);
        filters.push(`r.status = $${params.length}`);
      }
      if (q.from) {
        params.push(q.from);
        filters.push(`cs.started_at >= $${params.length}`);
      }
      if (q.to) {
        params.push(q.to);
        filters.push(`cs.started_at <= $${params.length}`);
      }
      const where = filters.join(' AND ');

      const tongHopRes = await db.query(
        `SELECT r.status::text AS status, count(*)::int AS n
         FROM reconciliation_results r
         JOIN vehicles v ON v.id = r.vehicle_id
         JOIN charging_sessions cs ON cs.id = r.session_id
         WHERE ${where}
         GROUP BY r.status`,
        params,
      );
      const tongHop = { khop: 0, lech: 0, thieu_du_lieu: 0 };
      for (const row of tongHopRes.rows) {
        tongHop[row.status as keyof typeof tongHop] = row.n as number;
      }

      const res = await db.query(
        `SELECT r.session_id, v.vin, st.code AS ma_tram, cs.started_at,
                r.kwh_tru::float8 AS kwh_tru, r.kwh_xe::float8 AS kwh_xe,
                r.kwh_thanh_toan::float8 AS kwh_thanh_toan,
                r.so_tien_vnd::float8 AS so_tien_vnd,
                r.lech_xe_pct::float8 AS lech_xe_pct,
                r.lech_tien_pct::float8 AS lech_tien_pct,
                r.lech_max_pct::float8 AS lech_max_pct,
                r.status::text AS status, r.ghi_chu, r.checked_at
         FROM reconciliation_results r
         JOIN vehicles v ON v.id = r.vehicle_id
         JOIN charging_sessions cs ON cs.id = r.session_id
         JOIN charging_stations st ON st.id = r.station_id
         WHERE ${where}
         ORDER BY cs.started_at DESC
         LIMIT $${params.length + 1}`,
        [...params, q.limit ?? 50],
      );

      return {
        nguong_pct: config.reconcile.nguongPct,
        tong_hop: tongHop,
        items: res.rows.map((r) => ({
          ...r,
          started_at: (r.started_at as Date).toISOString(),
          checked_at: (r.checked_at as Date).toISOString(),
        })),
      };
    },
  );

  app.post(
    '/reconciliation/run',
    {
      config: { permission: 'reconciliation.run' },
      schema: {
        tags: ['doi-soat'],
        summary: 'Chạy tay job đối soát 3 chiều (F-C6, NF-10)',
        description:
          'Chạy lại được nhiều lần: kết quả ghi kiểu upsert theo phiên và alert có chống trùng ' +
          'nên không sinh cảnh báo lặp.',
        body: Type.Optional(
          Type.Object({
            from: Type.Optional(Type.String({ format: 'date-time' })),
            to: Type.Optional(Type.String({ format: 'date-time' })),
            session_id: Type.Optional(Type.String({ format: 'uuid' })),
            lam_lai_tat_ca: Type.Optional(
              Type.Boolean({
                default: false,
                description: 'Đối soát lại cả phiên đã có kết luận khớp/lệch',
              }),
            ),
          }),
        ),
        response: {
          200: Type.Object({
            da_xet: Type.Integer(),
            khop: Type.Integer(),
            lech: Type.Integer(),
            thieu_du_lieu: Type.Integer(),
            nguong_pct: Type.Number(),
          }),
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async (request, reply) => {
      // Job chạy trên TOÀN BỘ phiên sạc, không lọc theo đội. Nếu sau này ai đó cấp quyền
      // này cho vai trò phạm vi hẹp thì phải chặn ở đây — chứ không âm thầm chạy toàn hệ.
      const auth = requireScopedAuth(request);
      if (auth.grant.scope !== 'all') {
        return sendError(
          reply,
          403,
          'khong_du_quyen',
          'Chạy job đối soát cần quyền phạm vi toàn hệ thống.',
        );
      }
      const body = (request.body ?? {}) as {
        from?: string;
        to?: string;
        session_id?: string;
        lam_lai_tat_ca?: boolean;
      };
      const tomTat = await chayDoiSoat(
        db,
        {
          ...config.reconcile,
          lamLaiTatCa: body.lam_lai_tat_ca === true,
          log: (m) => request.log.info(m),
        },
        { tuNgay: body.from, denNgay: body.to, sessionId: body.session_id },
      );
      return {
        da_xet: tomTat.da_xet,
        khop: tomTat.khop,
        lech: tomTat.lech,
        thieu_du_lieu: tomTat.thieu_du_lieu,
        nguong_pct: config.reconcile.nguongPct,
      };
    },
  );
}
