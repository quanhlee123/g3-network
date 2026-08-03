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
import {
  baoCaoLechTheoNgay,
  sanLuongTheoKhach,
  sanLuongTheoPhien,
} from '../modules/reconciliation/bao-cao';
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
            loi: Type.Integer({
              description: 'Số phiên không đối soát được vì lỗi kỹ thuật — phải là 0 khi hệ khỏe',
            }),
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
        loi: tomTat.loi,
        nguong_pct: config.reconcile.nguongPct,
      };
    },
  );

  // -----------------------------------------------------------------------------------
  // F-C6 — Sản lượng điện theo khách hàng / theo phiên (hoá đơn & đối soát với khách)
  // -----------------------------------------------------------------------------------
  app.get(
    '/reports/kwh',
    {
      config: { permission: 'reconciliation.read' },
      schema: {
        tags: ['doi-soat'],
        summary: 'Sản lượng kWh theo khách hàng, kèm chi tiết theo phiên (F-C6)',
        description:
          'Kỳ báo cáo tính theo thời điểm KẾT THÚC phiên: phiên kết thúc 00:30 ngày 2 thuộc ' +
          'về ngày 2 dù bắt đầu từ ngày 1. Số tiền lấy từ giao dịch đã thành công, KHÔNG lấy ' +
          'giá tạm tính lúc đóng phiên — chênh lệch giữa hai số đó chính là thứ job đối soát ' +
          'sinh ra để phát hiện. Đơn vị: kWh và VNĐ (NF-17).',
        querystring: Type.Object({
          from: Type.Optional(Type.String({ format: 'date-time' })),
          to: Type.Optional(Type.String({ format: 'date-time' })),
          customer_id: Type.Optional(Type.String({ format: 'uuid' })),
          chi_tiet_phien: Type.Optional(
            Type.Boolean({ default: false, description: 'Kèm danh sách từng phiên' }),
          ),
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000, default: 500 })),
        }),
        response: {
          200: Type.Object({
            tu_ngay: NullableString,
            den_ngay: NullableString,
            tong_kwh: Type.Number(),
            tong_tien_vnd: Type.Number(),
            tong_phien: Type.Integer(),
            theo_khach: Type.Array(
              Type.Object({
                customer_id: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
                ten_khach: NullableString,
                so_hop_dong: NullableString,
                so_phien: Type.Integer(),
                so_xe: Type.Integer(),
                kwh: Type.Number(),
                so_tien_vnd: Type.Number(),
              }),
            ),
            theo_phien: Type.Optional(
              Type.Array(
                Type.Object({
                  session_id: Type.String({ format: 'uuid' }),
                  vin: Type.String(),
                  customer_id: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
                  ten_khach: NullableString,
                  ma_tram: Type.String(),
                  ended_at: Type.String({ format: 'date-time' }),
                  kwh: Type.Number(),
                  so_tien_vnd: Type.Number(),
                  trang_thai_doi_soat: NullableString,
                  lech_max_pct: NullableNumber,
                }),
              ),
            ),
          }),
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async (request) => {
      const auth = requireScopedAuth(request);
      const q = request.query as {
        from?: string;
        to?: string;
        customer_id?: string;
        chi_tiet_phien?: boolean;
        limit?: number;
      };
      const loc = {
        tuNgay: q.from,
        denNgay: q.to,
        customerId: q.customer_id,
        phamVi: vehicleScopeClause(auth, 'v', 1),
      };

      const bao = await sanLuongTheoKhach(db, loc);
      if (q.chi_tiet_phien !== true) return bao;
      return { ...bao, theo_phien: await sanLuongTheoPhien(db, loc, q.limit ?? 500) };
    },
  );

  // -----------------------------------------------------------------------------------
  // F-C6 · NF-10 — Báo cáo lệch THEO NGÀY (nâng cấp job đối soát của Prompt 06)
  // -----------------------------------------------------------------------------------
  app.get(
    '/reconciliation/report',
    {
      config: { permission: 'reconciliation.read' },
      schema: {
        tags: ['doi-soat'],
        summary: 'Báo cáo lệch đối soát theo NGÀY (F-C6, NF-10)',
        description:
          'Hai con số lệch bắt hai loại vấn đề khác nhau: `lech_max_phien_pct` bắt sự cố đơn ' +
          'lẻ (1 phiên lệch 40% giữa 200 phiên khớp), còn `lech_tong_pct` bắt sai lệch HỆ ' +
          'THỐNG (mọi phiên lệch 0,9% cùng chiều — dưới ngưỡng nên không phiên nào bị gắn cờ, ' +
          'nhưng cộng cả ngày thành tiền thật). `can_xem_lai = true` là ngày cần người nhìn.',
        querystring: Type.Object({
          from: Type.Optional(Type.String({ format: 'date-time' })),
          to: Type.Optional(Type.String({ format: 'date-time' })),
          chi_ngay_bat_thuong: Type.Optional(Type.Boolean({ default: false })),
        }),
        response: {
          200: Type.Object({
            nguong_pct: Type.Number(),
            so_ngay_can_xem_lai: Type.Integer(),
            items: Type.Array(
              Type.Object({
                ngay: Type.String(),
                so_phien: Type.Integer(),
                khop: Type.Integer(),
                lech: Type.Integer(),
                thieu_du_lieu: Type.Integer(),
                chua_doi_soat: Type.Integer(),
                kwh_tru: Type.Number(),
                kwh_xe: Type.Number(),
                kwh_thanh_toan: Type.Number(),
                lech_tong_pct: NullableNumber,
                lech_max_phien_pct: NullableNumber,
                can_xem_lai: Type.Boolean(),
              }),
            ),
          }),
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async (request) => {
      const auth = requireScopedAuth(request);
      const q = request.query as { from?: string; to?: string; chi_ngay_bat_thuong?: boolean };

      const tatCa = await baoCaoLechTheoNgay(db, {
        tuNgay: q.from,
        denNgay: q.to,
        nguongPct: config.reconcile.nguongPct,
        phamVi: vehicleScopeClause(auth, 'v', 1),
      });
      const canXem = tatCa.filter((d) => d.can_xem_lai);
      return {
        nguong_pct: config.reconcile.nguongPct,
        so_ngay_can_xem_lai: canXem.length,
        items: q.chi_ngay_bat_thuong === true ? canXem : tatCa,
      };
    },
  );
}
