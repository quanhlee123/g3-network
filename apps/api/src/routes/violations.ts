// F-B3 · F-B5 — Hồ sơ vi phạm chính sách sạc.
//
// Bảng violations là APPEND-ONLY (NF-11) nên API chỉ có đường ĐỌC và đường CHẠY JOB —
// không có POST/PATCH/DELETE trên bản ghi vi phạm, và sẽ không bao giờ có.
//
// GET /violations/{id} cố tình trả NGUYÊN cột evidence: đó là toàn bộ giá trị của tính năng
// này khi tranh chấp hợp đồng bảo hành — người thứ ba đọc một phản hồi là dựng lại được
// kết luận, không phải ghép từ nhiều endpoint.
import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import type { INotifier } from '@g3/contracts';
import { requireScopedAuth } from '../auth/guard';
import { vehicleScopeClause } from '../auth/scope';
import type { ApiConfig } from '../config';
import type { Queryable } from '../db';
import { AUTH_ERROR_RESPONSES, ErrorSchema, sendError } from '../errors';
import { kiemTraViPham } from '../modules/violations/detect';

export interface ViolationRoutesDeps {
  db: Queryable;
  config: ApiConfig;
  notifier?: INotifier;
}

const LoaiViPhamSchema = Type.Union([
  Type.Literal('outside_hours'),
  Type.Literal('soc_above_max'),
  Type.Literal('soc_below_min'),
  Type.Literal('overpower'),
  Type.Literal('duration_exceeded'),
]);

const ViPhamTomTat = Type.Object({
  id: Type.String({ format: 'uuid' }),
  vehicle_id: Type.String({ format: 'uuid' }),
  vin: Type.String(),
  session_id: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  type: Type.String(),
  risk_level: Type.String({ description: 'low | medium | high' }),
  policy_code: Type.Union([Type.String(), Type.Null()]),
  policy_version: Type.Union([Type.Integer(), Type.Null()]),
  mo_ta: Type.Union([Type.String(), Type.Null()]),
  khuyen_nghi: Type.Union([Type.String(), Type.Null()]),
  detected_at: Type.String({ format: 'date-time' }),
});

const COT_TOM_TAT = `
  vi.id, vi.vehicle_id, v.vin, vi.session_id, vi.type::text AS type,
  vi.risk_level::text AS risk_level, p.code AS policy_code, p.version AS policy_version,
  vi.evidence #>> '{ket_luan,mo_ta}'      AS mo_ta,
  vi.evidence #>> '{ket_luan,khuyen_nghi}' AS khuyen_nghi,
  vi.detected_at`;

export async function violationRoutes(
  app: FastifyInstance,
  deps: ViolationRoutesDeps,
): Promise<void> {
  const { db, config } = deps;

  app.get(
    '/violations',
    {
      config: { permission: 'violation.read' },
      schema: {
        tags: ['vi-pham-sac'],
        summary: 'Danh sách vi phạm chính sách sạc (F-B3)',
        description:
          'Phạm vi theo vai trò như danh sách xe. Bằng chứng đầy đủ nằm ở ' +
          'GET /violations/{id}.',
        querystring: Type.Object({
          vehicle_id: Type.Optional(Type.String({ format: 'uuid' })),
          type: Type.Optional(LoaiViPhamSchema),
          from: Type.Optional(Type.String({ format: 'date-time' })),
          to: Type.Optional(Type.String({ format: 'date-time' })),
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 500, default: 50 })),
        }),
        response: {
          200: Type.Object({
            total: Type.Integer(),
            theo_loai: Type.Record(Type.String(), Type.Integer()),
            items: Type.Array(ViPhamTomTat),
          }),
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async (request) => {
      const auth = requireScopedAuth(request);
      const q = request.query as {
        vehicle_id?: string;
        type?: string;
        from?: string;
        to?: string;
        limit?: number;
      };

      const scope = vehicleScopeClause(auth, 'v', 1);
      const params: unknown[] = [...scope.params];
      const filters = [scope.sql];
      if (q.vehicle_id) {
        params.push(q.vehicle_id);
        filters.push(`vi.vehicle_id = $${params.length}`);
      }
      if (q.type) {
        params.push(q.type);
        filters.push(`vi.type = $${params.length}::violation_type`);
      }
      if (q.from) {
        params.push(q.from);
        filters.push(`vi.detected_at >= $${params.length}`);
      }
      if (q.to) {
        params.push(q.to);
        filters.push(`vi.detected_at <= $${params.length}`);
      }
      const where = filters.join(' AND ');

      const theoLoaiRes = await db.query(
        `SELECT vi.type::text AS type, count(*)::int AS n
         FROM violations vi JOIN vehicles v ON v.id = vi.vehicle_id
         WHERE ${where} GROUP BY vi.type`,
        params,
      );
      const theoLoai: Record<string, number> = {};
      let total = 0;
      for (const r of theoLoaiRes.rows) {
        theoLoai[r.type as string] = r.n as number;
        total += r.n as number;
      }

      const res = await db.query(
        `SELECT ${COT_TOM_TAT}
         FROM violations vi
         JOIN vehicles v ON v.id = vi.vehicle_id
         LEFT JOIN charging_policies p ON p.id = vi.policy_id
         WHERE ${where}
         ORDER BY vi.detected_at DESC
         LIMIT $${params.length + 1}`,
        [...params, q.limit ?? 50],
      );

      return {
        total,
        theo_loai: theoLoai,
        items: res.rows.map((r) => ({
          ...r,
          detected_at: (r.detected_at as Date).toISOString(),
        })),
      };
    },
  );

  app.get(
    '/violations/:id',
    {
      config: { permission: 'violation.read' },
      schema: {
        tags: ['vi-pham-sac'],
        summary: 'Chi tiết 1 vi phạm KÈM TOÀN BỘ BẰNG CHỨNG (F-B3, NF-11)',
        description:
          'Cột `evidence` là bằng chứng bất biến: snapshot phiên sạc, ngưỡng của ĐÚNG version ' +
          'chính sách đã dùng làm căn cứ, telemetry trong phiên, và cách tính. Đủ để người thứ ' +
          'ba tái dựng kết luận mà không cần truy cập hệ thống.',
        params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
        response: {
          200: Type.Intersect([
            ViPhamTomTat,
            Type.Object({ evidence: Type.Record(Type.String(), Type.Unknown()) }),
          ]),
          404: ErrorSchema,
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async (request, reply) => {
      const auth = requireScopedAuth(request);
      const { id } = request.params as { id: string };
      const scope = vehicleScopeClause(auth, 'v', 2);

      const res = await db.query(
        `SELECT ${COT_TOM_TAT}, vi.evidence
         FROM violations vi
         JOIN vehicles v ON v.id = vi.vehicle_id
         LEFT JOIN charging_policies p ON p.id = vi.policy_id
         WHERE vi.id = $1 AND (${scope.sql})`,
        [id, ...scope.params],
      );
      const row = res.rows[0];
      if (!row) {
        // 404 chung cho cả "không tồn tại" và "ngoài phạm vi" — không lộ sự tồn tại của
        // vi phạm thuộc đội khác.
        return sendError(reply, 404, 'khong_tim_thay_vi_pham', 'Không tìm thấy vi phạm.');
      }
      return { ...row, detected_at: (row.detected_at as Date).toISOString() };
    },
  );

  app.post(
    '/violations/run',
    {
      config: { permission: 'violation.run' },
      schema: {
        tags: ['vi-pham-sac'],
        summary: 'Chạy tay job đối chiếu phiên sạc với chính sách (F-B3)',
        description:
          'Chạy lại được nhiều lần: mỗi phiên để lại đúng 1 dòng hồ sơ xét, và vi phạm có ' +
          'khoá duy nhất (phiên × loại) nên không nhân đôi.',
        body: Type.Optional(
          Type.Object({
            from: Type.Optional(Type.String({ format: 'date-time' })),
            to: Type.Optional(Type.String({ format: 'date-time' })),
            session_id: Type.Optional(Type.String({ format: 'uuid' })),
            lam_lai_tat_ca: Type.Optional(
              Type.Boolean({ default: false, description: 'Xét lại cả phiên đã có kết luận' }),
            ),
          }),
        ),
        response: {
          200: Type.Object({
            da_xet: Type.Integer(),
            sach: Type.Integer(),
            co_vi_pham: Type.Integer(),
            khong_co_chinh_sach: Type.Integer(),
            vi_pham_moi: Type.Integer(),
            loi: Type.Integer({
              description: 'Số phiên không xét được vì lỗi kỹ thuật — phải là 0 khi hệ khỏe',
            }),
          }),
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async (request, reply) => {
      // Job chạy trên TOÀN BỘ phiên sạc, không lọc theo đội — cùng lý do như job đối soát.
      const auth = requireScopedAuth(request);
      if (auth.grant.scope !== 'all') {
        return sendError(
          reply,
          403,
          'khong_du_quyen',
          'Chạy job đối chiếu vi phạm cần quyền phạm vi toàn hệ thống.',
        );
      }
      const body = (request.body ?? {}) as {
        from?: string;
        to?: string;
        session_id?: string;
        lam_lai_tat_ca?: boolean;
      };
      const tomTat = await kiemTraViPham(
        db,
        {
          muiGio: config.muiGio,
          socBreachCount: config.viPham.socBreachCount,
          socBreachWindowDays: config.viPham.socBreachWindowDays,
          lamLaiTatCa: body.lam_lai_tat_ca === true,
          ...(deps.notifier ? { notifier: deps.notifier } : {}),
          log: (m) => request.log.info(m),
        },
        { tuNgay: body.from, denNgay: body.to, sessionId: body.session_id },
      );
      return {
        da_xet: tomTat.da_xet,
        sach: tomTat.sach,
        co_vi_pham: tomTat.co_vi_pham,
        khong_co_chinh_sach: tomTat.khong_co_chinh_sach,
        vi_pham_moi: tomTat.vi_pham_moi,
        loi: tomTat.loi,
      };
    },
  );
}
