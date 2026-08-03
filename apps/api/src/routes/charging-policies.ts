// F-B1 — Chính sách sạc bảo hành: đọc + tạo version. KHÔNG có PATCH/PUT/DELETE và sẽ
// không bao giờ có: sửa một version đã ban hành là sửa căn cứ đối chiếu của mọi phiên sạc
// đã kết luận theo nó (NF-11). Đổi ngưỡng = POST version mới.
//
// Quyền: sheet 9 dòng "Cấu hình chính sách sạc (bảo hành)" — chỉ Bảo hành Mobility + Admin
// được ghi. Đọc thì thêm tài xế/QL đội trong phạm vi xe của họ (xem auth/permissions.ts).
import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { requireAuth, requireScopedAuth } from '../auth/guard';
import { vehicleInScope, vehicleScopeClause, type ScopedAuth } from '../auth/scope';
import type { Queryable } from '../db';
import { AUTH_ERROR_RESPONSES, ErrorSchema, sendError, thongDiepQuyTacDb } from '../errors';
import {
  chinhSachHieuLuc,
  doiRow,
  kiemTraKhungGio,
  type ChinhSachSac,
  type KhungGio,
} from '../modules/policies/policy';

export interface PolicyRoutesDeps {
  db: Queryable;
}

const NullableNumber = Type.Union([Type.Number(), Type.Null()]);
const NullableString = Type.Union([Type.String(), Type.Null()]);

const KhungGioSchema = Type.Object(
  {
    from: Type.String({ pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$', examples: ['22:00'] }),
    to: Type.String({ pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$', examples: ['06:00'] }),
  },
  { description: 'Khung giờ ĐƯỢC PHÉP sạc, giờ Việt Nam. to < from = khung qua nửa đêm.' },
);

const ChinhSachSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  code: Type.String(),
  version: Type.Integer(),
  name: Type.String(),
  scope_type: Type.String({ description: 'vehicle | fleet | model' }),
  vehicle_id: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  customer_id: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  vehicle_model: NullableString,
  soc_min_pct: NullableNumber,
  soc_max_pct: NullableNumber,
  allowed_hours: Type.Union([Type.Array(KhungGioSchema), Type.Null()]),
  max_power_kw: NullableNumber,
  max_duration_minutes: Type.Union([Type.Integer(), Type.Null()]),
  max_sessions_per_day: Type.Union([Type.Integer(), Type.Null()]),
  soc_breach_count: Type.Union([Type.Integer(), Type.Null()]),
  soc_breach_window_days: Type.Union([Type.Integer(), Type.Null()]),
  effective_from: Type.String({ format: 'date-time' }),
  effective_to: NullableString,
  change_note: NullableString,
  created_by: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  supersedes_id: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  created_at: Type.String({ format: 'date-time' }),
});

/**
 * Tiêu chí "thường xuyên" của F-B3 — bao nhiêu lần chạm ngưỡng SOC trong bao nhiêu ngày thì
 * kết luận vi phạm. Bỏ trống = theo mặc định toàn hệ (`VIOLATION_SOC_BREACH_*`).
 * ⚠️ Con số mặc định CHƯA được Bảo hành Mobility/Legal ký — xem ADR-011 và Q4 (MỞ).
 */
const NGUONG_THUONG_XUYEN = {
  soc_breach_count: Type.Optional(
    Type.Integer({ minimum: 1, description: 'Số lần chạm ngưỡng SOC thì coi là "thường xuyên"' }),
  ),
  soc_breach_window_days: Type.Optional(
    Type.Integer({ minimum: 1, description: 'Cửa sổ đếm, tính bằng ngày' }),
  ),
};

/** Ngưỡng khi BAN HÀNH mới: bỏ trống = không đặt giới hạn đó. */
const NguongSchema = {
  soc_min_pct: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
  soc_max_pct: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
  allowed_hours: Type.Optional(
    Type.Array(KhungGioSchema, { description: 'Bỏ trống = cho phép mọi giờ' }),
  ),
  max_power_kw: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
  max_duration_minutes: Type.Optional(Type.Integer({ minimum: 1 })),
  max_sessions_per_day: Type.Optional(Type.Integer({ minimum: 1 })),
  ...NGUONG_THUONG_XUYEN,
  effective_from: Type.Optional(
    Type.String({ format: 'date-time', description: 'Mặc định: ngay bây giờ' }),
  ),
  change_note: Type.Optional(Type.String({ maxLength: 1000 })),
};

/**
 * Ngưỡng khi tạo VERSION MỚI: bỏ trống = GIỮ NGUYÊN của version trước, `null` = BỎ giới hạn.
 *
 * Vì sao không dùng "bỏ trống = bỏ giới hạn" cho gọn: người soạn chính sách thường chỉ muốn
 * siết đúng một con số ("SOC max 90 → 80"). Nếu bỏ trống nghĩa là xoá thì thao tác đó lặng lẽ
 * gỡ luôn khung giờ ToU và trần công suất — nới lỏng bảo hành mà không ai chủ ý. Muốn bỏ giới
 * hạn thì phải viết `null`, tức là một hành động có ý thức.
 */
const NguongKeThuaSchema = {
  soc_min_pct: Type.Optional(Type.Union([Type.Number({ minimum: 0, maximum: 100 }), Type.Null()])),
  soc_max_pct: Type.Optional(Type.Union([Type.Number({ minimum: 0, maximum: 100 }), Type.Null()])),
  allowed_hours: Type.Optional(Type.Union([Type.Array(KhungGioSchema), Type.Null()])),
  max_power_kw: Type.Optional(Type.Union([Type.Number({ exclusiveMinimum: 0 }), Type.Null()])),
  max_duration_minutes: Type.Optional(Type.Union([Type.Integer({ minimum: 1 }), Type.Null()])),
  max_sessions_per_day: Type.Optional(Type.Union([Type.Integer({ minimum: 1 }), Type.Null()])),
  soc_breach_count: Type.Optional(Type.Union([Type.Integer({ minimum: 1 }), Type.Null()])),
  soc_breach_window_days: Type.Optional(Type.Union([Type.Integer({ minimum: 1 }), Type.Null()])),
  effective_from: Type.Optional(
    Type.String({ format: 'date-time', description: 'Mặc định: ngay bây giờ' }),
  ),
  change_note: Type.Optional(Type.String({ maxLength: 1000 })),
};

/** `undefined` = kế thừa giá trị cũ; `null` hoặc giá trị mới = ghi đè. */
function keThua<T>(moi: T | null | undefined, cu: T | null): T | null {
  return moi === undefined ? cu : moi;
}

const COT = `
  p.id, p.code, p.version, p.name, p.scope_type::text AS scope_type,
  p.vehicle_id, p.customer_id, p.vehicle_model::text AS vehicle_model,
  p.soc_min_pct::float8 AS soc_min_pct, p.soc_max_pct::float8 AS soc_max_pct,
  p.allowed_hours, p.max_power_kw::float8 AS max_power_kw,
  p.max_duration_minutes, p.max_sessions_per_day,
  p.soc_breach_count, p.soc_breach_window_days,
  p.effective_from, p.effective_to, p.change_note, p.created_by, p.supersedes_id, p.created_at`;

/**
 * Chỉ giữ những chính sách áp cho xe trong phạm vi người gọi (tài xế / QL đội).
 * Vai trò phạm vi 'all' KHÔNG lọc — nếu lọc thì chính sách mới soạn, chưa xe nào khớp,
 * sẽ biến mất khỏi màn hình của chính người vừa tạo ra nó.
 */
function locTheoPhamVi(
  auth: ScopedAuth,
  thamSoTiepTheo: number,
): { sql: string; params: unknown[] } {
  if (auth.grant.scope === 'all') return { sql: 'true', params: [] };
  const scope = vehicleScopeClause(auth, 'v', thamSoTiepTheo);
  return {
    sql: `EXISTS (SELECT 1 FROM vehicles v WHERE (${scope.sql}) AND (
            (p.scope_type = 'vehicle' AND p.vehicle_id    = v.id)
         OR (p.scope_type = 'fleet'   AND p.customer_id   = v.customer_id)
         OR (p.scope_type = 'model'   AND p.vehicle_model = v.model)))`,
    params: scope.params,
  };
}

export async function chargingPolicyRoutes(
  app: FastifyInstance,
  deps: PolicyRoutesDeps,
): Promise<void> {
  const { db } = deps;

  app.get(
    '/charging-policies',
    {
      config: { permission: 'charging_policy.read' },
      schema: {
        tags: ['chinh-sach-sac'],
        summary: 'Danh sách chính sách sạc — version mới nhất của từng mã (F-B1)',
        description:
          'Mỗi mã chính sách xuất hiện 1 lần với version MỚI NHẤT. Lịch sử đầy đủ ở ' +
          'GET /charging-policies/{code}/versions.',
        querystring: Type.Object({
          code: Type.Optional(Type.String()),
          scope_type: Type.Optional(
            Type.Union([Type.Literal('vehicle'), Type.Literal('fleet'), Type.Literal('model')]),
          ),
          con_hieu_luc: Type.Optional(
            Type.Boolean({ description: 'Chỉ chính sách chưa ngừng hẳn' }),
          ),
        }),
        response: {
          200: Type.Object({ total: Type.Integer(), items: Type.Array(ChinhSachSchema) }),
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async (request) => {
      const auth = requireScopedAuth(request);
      const q = request.query as { code?: string; scope_type?: string; con_hieu_luc?: boolean };

      const pham = locTheoPhamVi(auth, 1);
      const params: unknown[] = [...pham.params];
      const dieuKien = [pham.sql];
      if (q.code) {
        params.push(q.code);
        dieuKien.push(`p.code = $${params.length}`);
      }
      if (q.scope_type) {
        params.push(q.scope_type);
        dieuKien.push(`p.scope_type = $${params.length}::policy_scope`);
      }
      if (q.con_hieu_luc === true) {
        dieuKien.push(`(p.effective_to IS NULL OR p.effective_to > now())`);
      }

      const res = await db.query(
        `SELECT DISTINCT ON (p.code) ${COT}
         FROM charging_policies p
         WHERE ${dieuKien.join(' AND ')}
         ORDER BY p.code, p.version DESC`,
        params,
      );
      return { total: res.rows.length, items: res.rows.map(doiRow) };
    },
  );

  app.get(
    '/charging-policies/:code/versions',
    {
      config: { permission: 'charging_policy.read' },
      schema: {
        tags: ['chinh-sach-sac'],
        summary: 'Toàn bộ lịch sử version của một mã chính sách (F-B1)',
        description:
          'Version cũ KHÔNG bao giờ bị xoá hay sửa — đây là căn cứ tái dựng kết luận vi phạm ' +
          'đã ghi trong quá khứ (NF-11).',
        params: Type.Object({ code: Type.String() }),
        response: {
          200: Type.Object({ total: Type.Integer(), items: Type.Array(ChinhSachSchema) }),
          404: ErrorSchema,
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async (request, reply) => {
      const auth = requireScopedAuth(request);
      const { code } = request.params as { code: string };

      const pham = locTheoPhamVi(auth, 2);
      const res = await db.query(
        `SELECT ${COT} FROM charging_policies p
         WHERE p.code = $1 AND (${pham.sql})
         ORDER BY p.version`,
        [code, ...pham.params],
      );
      if (res.rows.length === 0) {
        return sendError(
          reply,
          404,
          'khong_tim_thay_chinh_sach',
          `Không tìm thấy chính sách "${code}".`,
        );
      }
      return { total: res.rows.length, items: res.rows.map(doiRow) };
    },
  );

  app.get(
    '/vehicles/:id/charging-policy',
    {
      config: { permission: 'charging_policy.read' },
      schema: {
        tags: ['chinh-sach-sac'],
        summary: 'Chính sách áp cho MỘT xe tại MỘT thời điểm (F-B1)',
        description:
          'Không truyền `at` = bây giờ. Truyền `at` = thời điểm phiên sạc để biết chính xác ' +
          'version nào được dùng làm căn cứ đối chiếu lúc đó — kể cả khi chính sách đã đổi ' +
          'nhiều lần sau đó. Phạm vi hẹp thắng phạm vi rộng: xe > đội > dòng xe.',
        params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
        querystring: Type.Object({
          at: Type.Optional(Type.String({ format: 'date-time' })),
        }),
        response: {
          200: Type.Object({
            vehicle_id: Type.String({ format: 'uuid' }),
            at: Type.String({ format: 'date-time' }),
            chinh_sach: Type.Union([ChinhSachSchema, Type.Null()]),
          }),
          404: ErrorSchema,
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async (request, reply) => {
      const auth = requireScopedAuth(request);
      const { id } = request.params as { id: string };
      const { at } = request.query as { at?: string };

      if (!(await vehicleInScope(db, auth, id))) {
        return sendError(
          reply,
          404,
          'khong_tim_thay_xe',
          'Không tìm thấy xe trong phạm vi của bạn.',
        );
      }
      const thoiDiem = at ? new Date(at) : new Date();
      const chinhSach = await chinhSachHieuLuc(db, id, thoiDiem);
      return { vehicle_id: id, at: thoiDiem.toISOString(), chinh_sach: chinhSach };
    },
  );

  app.post(
    '/charging-policies',
    {
      config: { permission: 'charging_policy.manage' },
      schema: {
        tags: ['chinh-sach-sac'],
        summary: 'Ban hành chính sách sạc mới (version 1) — F-B1',
        body: Type.Object({
          code: Type.String({ minLength: 1, maxLength: 64 }),
          name: Type.String({ minLength: 1, maxLength: 200 }),
          scope_type: Type.Union([
            Type.Literal('vehicle'),
            Type.Literal('fleet'),
            Type.Literal('model'),
          ]),
          vehicle_id: Type.Optional(Type.String({ format: 'uuid' })),
          customer_id: Type.Optional(Type.String({ format: 'uuid' })),
          vehicle_model: Type.Optional(Type.String()),
          ...NguongSchema,
        }),
        response: {
          201: ChinhSachSchema,
          400: ErrorSchema,
          409: ErrorSchema,
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request);
      const body = request.body as Record<string, unknown> & {
        code: string;
        name: string;
        scope_type: 'vehicle' | 'fleet' | 'model';
      };

      const loiKhung = kiemTraNguong(body);
      if (loiKhung) return sendError(reply, 400, 'nguong_khong_hop_le', loiKhung);
      const loiPhamVi = kiemTraPhamVi(body);
      if (loiPhamVi) return sendError(reply, 400, 'pham_vi_khong_hop_le', loiPhamVi);

      const daCo = await db.query(`SELECT 1 FROM charging_policies WHERE code = $1 LIMIT 1`, [
        body.code,
      ]);
      if ((daCo.rowCount ?? 0) > 0) {
        return sendError(
          reply,
          409,
          'ma_chinh_sach_da_ton_tai',
          `Mã chính sách "${body.code}" đã tồn tại. Tạo version mới tại POST /charging-policies/${body.code}/versions.`,
        );
      }

      try {
        const row = await chen(db, {
          code: body.code,
          name: body.name,
          scope_type: body.scope_type,
          vehicle_id: (body.vehicle_id as string | undefined) ?? null,
          customer_id: (body.customer_id as string | undefined) ?? null,
          vehicle_model: (body.vehicle_model as string | undefined) ?? null,
          version: 1,
          supersedes_id: null,
          createdBy: auth.userId,
          nguong: body,
        });
        return reply.status(201).send(row);
      } catch (err) {
        return traLoiDb(err, reply, request.log.error.bind(request.log));
      }
    },
  );

  app.post(
    '/charging-policies/:code/versions',
    {
      config: { permission: 'charging_policy.manage' },
      schema: {
        tags: ['chinh-sach-sac'],
        summary: 'Tạo VERSION MỚI của một chính sách đã có (F-B1)',
        description:
          'Version cũ giữ nguyên, không bị sửa. Ngưỡng nào không gửi thì GIỮ NGUYÊN của ' +
          'version trước; gửi `null` để bỏ hẳn giới hạn đó. Phạm vi áp dụng (xe/đội/dòng) ' +
          'kế thừa và KHÔNG đổi được — đổi phạm vi nghĩa là một chính sách khác, hãy tạo mã ' +
          'mới. Hiệu lực mới phải muộn hơn hiệu lực của version trước.',
        params: Type.Object({ code: Type.String() }),
        body: Type.Object({
          name: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
          ...NguongKeThuaSchema,
        }),
        response: {
          201: ChinhSachSchema,
          400: ErrorSchema,
          404: ErrorSchema,
          409: ErrorSchema,
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request);
      const { code } = request.params as { code: string };
      const body = request.body as Record<string, unknown> & { name?: string };

      const truocRes = await db.query(
        `SELECT ${COT} FROM charging_policies p WHERE p.code = $1 ORDER BY p.version DESC LIMIT 1`,
        [code],
      );
      const truoc = truocRes.rows[0];
      if (!truoc) {
        return sendError(
          reply,
          404,
          'khong_tim_thay_chinh_sach',
          `Chưa có chính sách "${code}". Ban hành version 1 tại POST /charging-policies.`,
        );
      }
      const cu = doiRow(truoc);

      // Trộn TRƯỚC khi kiểm tra: ngưỡng kế thừa cũng phải hợp lệ khi đứng cạnh ngưỡng mới
      // (vd giữ soc_min 20 của bản cũ mà đặt soc_max 15 ở bản mới là mâu thuẫn).
      const nguong: Record<string, unknown> = {
        soc_min_pct: keThua(body.soc_min_pct as number | null | undefined, cu.soc_min_pct),
        soc_max_pct: keThua(body.soc_max_pct as number | null | undefined, cu.soc_max_pct),
        allowed_hours: keThua(
          body.allowed_hours as KhungGio[] | null | undefined,
          cu.allowed_hours,
        ),
        max_power_kw: keThua(body.max_power_kw as number | null | undefined, cu.max_power_kw),
        max_duration_minutes: keThua(
          body.max_duration_minutes as number | null | undefined,
          cu.max_duration_minutes,
        ),
        max_sessions_per_day: keThua(
          body.max_sessions_per_day as number | null | undefined,
          cu.max_sessions_per_day,
        ),
        soc_breach_count: keThua(
          body.soc_breach_count as number | null | undefined,
          cu.soc_breach_count,
        ),
        soc_breach_window_days: keThua(
          body.soc_breach_window_days as number | null | undefined,
          cu.soc_breach_window_days,
        ),
        effective_from: body.effective_from,
        change_note: body.change_note,
      };
      const loiKhung = kiemTraNguong(nguong);
      if (loiKhung) return sendError(reply, 400, 'nguong_khong_hop_le', loiKhung);

      try {
        const row = await chen(db, {
          code: cu.code,
          name: body.name ?? cu.name,
          scope_type: cu.scope_type,
          vehicle_id: cu.vehicle_id,
          customer_id: cu.customer_id,
          vehicle_model: cu.vehicle_model,
          version: cu.version + 1,
          supersedes_id: cu.id,
          createdBy: auth.userId,
          nguong,
        });
        return reply.status(201).send(row);
      } catch (err) {
        return traLoiDb(err, reply, request.log.error.bind(request.log));
      }
    },
  );

  app.post(
    '/charging-policies/:code/ngung',
    {
      config: { permission: 'charging_policy.manage' },
      schema: {
        tags: ['chinh-sach-sac'],
        summary: 'Ngừng hẳn một chính sách (F-B1)',
        description:
          'Đặt thời điểm hết hiệu lực cho version mới nhất. Bản ghi KHÔNG bị xoá: phiên sạc ' +
          'diễn ra trước thời điểm này vẫn được đối chiếu với chính sách như cũ.',
        params: Type.Object({ code: Type.String() }),
        body: Type.Object({
          effective_to: Type.Optional(
            Type.String({ format: 'date-time', description: 'Mặc định: ngay bây giờ' }),
          ),
        }),
        response: {
          200: ChinhSachSchema,
          400: ErrorSchema,
          404: ErrorSchema,
          409: ErrorSchema,
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async (request, reply) => {
      const { code } = request.params as { code: string };
      const body = request.body as { effective_to?: string };
      const den = body.effective_to ?? new Date().toISOString();

      const moiNhat = await db.query(
        `SELECT id FROM charging_policies WHERE code = $1 ORDER BY version DESC LIMIT 1`,
        [code],
      );
      const id = moiNhat.rows[0]?.id as string | undefined;
      if (!id) {
        return sendError(
          reply,
          404,
          'khong_tim_thay_chinh_sach',
          `Không tìm thấy chính sách "${code}".`,
        );
      }

      try {
        const res = await db.query(
          `UPDATE charging_policies p SET effective_to = $2::timestamptz
           WHERE p.id = $1 RETURNING ${COT}`,
          [id, den],
        );
        return doiRow(res.rows[0]!);
      } catch (err) {
        return traLoiDb(err, reply, request.log.error.bind(request.log));
      }
    },
  );
}

interface ChenParams {
  code: string;
  name: string;
  scope_type: string;
  vehicle_id: string | null;
  customer_id: string | null;
  vehicle_model: string | null;
  version: number;
  supersedes_id: string | null;
  createdBy: string;
  nguong: Record<string, unknown>;
}

async function chen(db: Queryable, p: ChenParams): Promise<ChinhSachSac> {
  const n = p.nguong;
  const res = await db.query(
    `INSERT INTO charging_policies
       (code, version, name, scope_type, vehicle_id, customer_id, vehicle_model,
        soc_min_pct, soc_max_pct, allowed_hours, max_power_kw, max_duration_minutes,
        max_sessions_per_day, soc_breach_count, soc_breach_window_days,
        effective_from, created_by, change_note, supersedes_id)
     VALUES ($1, $2, $3, $4::policy_scope, $5, $6, $7::vehicle_model,
             $8, $9, $10::jsonb, $11, $12, $13, $14, $15,
             coalesce($16::timestamptz, now()), $17, $18, $19)
     RETURNING id, code, version, name, scope_type::text AS scope_type, vehicle_id, customer_id,
               vehicle_model::text AS vehicle_model, soc_min_pct::float8 AS soc_min_pct,
               soc_max_pct::float8 AS soc_max_pct, allowed_hours,
               max_power_kw::float8 AS max_power_kw, max_duration_minutes, max_sessions_per_day,
               soc_breach_count, soc_breach_window_days,
               effective_from, effective_to, change_note, created_by, supersedes_id, created_at`,
    [
      p.code,
      p.version,
      p.name,
      p.scope_type,
      p.vehicle_id,
      p.customer_id,
      p.vehicle_model,
      n.soc_min_pct ?? null,
      n.soc_max_pct ?? null,
      n.allowed_hours ? JSON.stringify(n.allowed_hours) : null,
      n.max_power_kw ?? null,
      n.max_duration_minutes ?? null,
      n.max_sessions_per_day ?? null,
      n.soc_breach_count ?? null,
      n.soc_breach_window_days ?? null,
      n.effective_from ?? null,
      p.createdBy,
      n.change_note ?? null,
      p.supersedes_id,
    ],
  );
  return doiRow(res.rows[0]!);
}

/**
 * Kiểm tra phần ngưỡng, dùng chung cho cả ban hành mới lẫn tạo version.
 * Nhận cả `undefined` (không gửi) và `null` (bỏ giới hạn) — cả hai đều là "không có ngưỡng".
 */
function kiemTraNguong(body: Record<string, unknown>): string | null {
  const khung = body.allowed_hours as KhungGio[] | null | undefined;
  if (khung !== null && khung !== undefined) {
    const loi = kiemTraKhungGio(khung);
    if (loi) return loi;
  }
  const min = body.soc_min_pct as number | null | undefined;
  const max = body.soc_max_pct as number | null | undefined;
  if (min !== null && min !== undefined && max !== null && max !== undefined && max <= min) {
    return `SOC max (${max}%) phải lớn hơn SOC min (${min}%)`;
  }
  return null;
}

/** Đúng 1 cột phạm vi khớp scope_type được điền (cùng ràng buộc CHECK của migration 0004). */
function kiemTraPhamVi(body: Record<string, unknown>): string | null {
  const { scope_type, vehicle_id, customer_id, vehicle_model } = body as {
    scope_type: string;
    vehicle_id?: string;
    customer_id?: string;
    vehicle_model?: string;
  };
  const canCo: Record<string, unknown> = {
    vehicle: vehicle_id,
    fleet: customer_id,
    model: vehicle_model,
  };
  const ten: Record<string, string> = {
    vehicle: 'vehicle_id',
    fleet: 'customer_id',
    model: 'vehicle_model',
  };
  if (canCo[scope_type] === undefined) {
    return `Phạm vi "${scope_type}" bắt buộc có ${ten[scope_type]}`;
  }
  const thua = Object.entries(canCo)
    .filter(([k, v]) => k !== scope_type && v !== undefined)
    .map(([k]) => ten[k]);
  if (thua.length > 0) {
    return `Phạm vi "${scope_type}" không được kèm ${thua.join(', ')}`;
  }
  return null;
}

/**
 * Quy lỗi DB thành phản hồi cho người gọi. Trigger version của migration 0024 ném P0001
 * kèm câu tiếng Việt đã soạn sẵn → 409 kèm nguyên câu đó. Lỗi khác là lỗi thật, ném tiếp
 * cho setErrorHandler xử lý (và KHÔNG lộ chi tiết ra ngoài).
 */
function traLoiDb(
  err: unknown,
  reply: Parameters<typeof sendError>[0],
  log: (obj: unknown, msg: string) => void,
): unknown {
  const quyTac = thongDiepQuyTacDb(err);
  if (quyTac !== null) {
    log({ err }, 'F-B1: từ chối theo quy tắc version chính sách');
    return sendError(reply, 409, 'vi_pham_quy_tac_version', quyTac);
  }
  throw err;
}
