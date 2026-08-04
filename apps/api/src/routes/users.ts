// F-F1 — Quản trị tài khoản: xem danh sách, MỜI người mới, KHÓA, GÁN vai trò.
//
// Sheet 9 dòng "Tài khoản & phân quyền (RBAC)": QL đội V\* (xem, chỉ đội mình), Admin ✓.
// Nên tách `user.read` với `user.manage` — nhìn thấy đội mình là một chuyện, tự cấp quyền
// cho người khác là chuyện khác hẳn.
//
// Phase 1 không có mật khẩu: "mời" nghĩa là tạo tài khoản gắn SĐT, người đó đăng nhập bằng
// OTP (F-F1, xem routes/auth.ts). Khóa tài khoản có hiệu lực NGAY vì guard đọc lại
// users.is_active từ DB mỗi request — không phải chờ token cũ hết hạn.
import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { normalizePhone, type UserRole } from '@g3/shared';
import { requireScopedAuth } from '../auth/guard';
import type { Queryable } from '../db';
import { AUTH_ERROR_RESPONSES, ErrorSchema, sendError } from '../errors';

export interface UserRoutesDeps {
  db: Queryable;
}

const VAI_TRO = [
  'driver',
  'fleet_manager',
  'energy_ops',
  'warranty_admin',
  'cskh',
  'admin',
  'sale',
] as const;

/**
 * Vai trò gắn với MỘT đội xe. Guard từ chối request khi `scope = fleet` mà customer_id
 * rỗng, nên tạo tài khoản QL đội không gắn đội = tạo tài khoản đăng nhập được nhưng
 * không xem được gì. Chặn ngay lúc tạo thay vì để người dùng tự phát hiện.
 */
const VAI_TRO_THUOC_DOI: readonly UserRole[] = ['driver', 'fleet_manager'];

const VaiTroSchema = Type.Union(VAI_TRO.map((r) => Type.Literal(r)));
const NullableString = Type.Union([Type.String(), Type.Null()]);

const TaiKhoanSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  email: Type.String(),
  full_name: Type.String(),
  role: Type.String(),
  customer_id: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  customer_name: NullableString,
  phone: NullableString,
  is_active: Type.Boolean(),
  created_at: Type.String({ format: 'date-time' }),
});

/** Mã lỗi UNIQUE của PostgreSQL — email/SĐT trùng là lỗi NGƯỜI DÙNG, không phải lỗi hệ thống. */
const PG_TRUNG_KHOA = '23505';

function laLoiTrung(err: unknown, ten: string): boolean {
  const e = err as { code?: unknown; constraint?: unknown };
  return e?.code === PG_TRUNG_KHOA && String(e.constraint ?? '').includes(ten);
}

export async function userRoutes(app: FastifyInstance, deps: UserRoutesDeps): Promise<void> {
  const { db } = deps;

  // ---- Danh sách tài khoản theo phạm vi ---------------------------------------------
  app.get(
    '/users',
    {
      config: { permission: 'user.read' },
      schema: {
        tags: ['tai-khoan'],
        summary: 'Danh sách tài khoản theo phạm vi (F-F1)',
        description:
          'Quản lý đội chỉ thấy tài khoản trong đội mình (sheet 9 "V*"); Admin thấy tất cả, ' +
          'gồm cả tài khoản nội bộ G3 không gắn đội nào.',
        querystring: Type.Object({
          q: Type.Optional(Type.String({ description: 'Tìm theo tên hoặc email' })),
          role: Type.Optional(VaiTroSchema),
          chi_bi_khoa: Type.Optional(Type.Boolean({ description: 'Chỉ tài khoản đã bị khóa' })),
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200, default: 100 })),
        }),
        response: {
          200: Type.Object({
            total: Type.Integer(),
            items: Type.Array(TaiKhoanSchema),
          }),
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async (request) => {
      const auth = requireScopedAuth(request);
      const q = request.query as {
        q?: string;
        role?: string;
        chi_bi_khoa?: boolean;
        limit?: number;
      };

      const params: unknown[] = [];
      const filters: string[] = [];
      // Phạm vi ép trong SQL, không lọc sau khi lấy về (cùng nguyên tắc auth/scope.ts).
      if (auth.grant.scope === 'fleet') {
        params.push(auth.customerId);
        filters.push(`u.customer_id = $${String(params.length)}`);
      }
      if (q.q) {
        params.push(`%${q.q}%`);
        filters.push(
          `(u.full_name ILIKE $${String(params.length)} OR u.email ILIKE $${String(params.length)})`,
        );
      }
      if (q.role) {
        params.push(q.role);
        filters.push(`u.role = $${String(params.length)}::user_role`);
      }
      if (q.chi_bi_khoa === true) filters.push('NOT u.is_active');
      const where = filters.length > 0 ? filters.join(' AND ') : 'true';

      const res = await db.query(
        `SELECT u.id, u.email, u.full_name, u.role::text AS role, u.customer_id,
                c.name AS customer_name, u.phone, u.is_active, u.created_at
         FROM users u
         LEFT JOIN customers c ON c.id = u.customer_id
         WHERE ${where}
         ORDER BY u.is_active DESC, u.full_name
         LIMIT $${String(params.length + 1)}`,
        [...params, q.limit ?? 100],
      );

      return {
        total: res.rows.length,
        items: res.rows.map((r) => ({
          ...r,
          created_at: (r.created_at as Date).toISOString(),
        })),
      };
    },
  );

  // ---- Danh mục đội xe, phục vụ ô chọn của màn hình mời tài khoản ---------------------
  //
  // Gắn `user.manage` chứ không tạo quyền `customer.read` riêng: endpoint này tồn tại
  // ĐÚNG để phục vụ việc gán người vào đội. Không suy ra được từ GET /users vì đội mới
  // lập chưa có tài khoản nào thì sẽ không xuất hiện, và đó chính là lúc cần mời người.
  app.get(
    '/customers',
    {
      config: { permission: 'user.manage' },
      schema: {
        tags: ['tai-khoan'],
        summary: 'Danh mục đội xe để gán tài khoản (F-F1)',
        response: {
          200: Type.Object({
            total: Type.Integer(),
            items: Type.Array(
              Type.Object({
                id: Type.String({ format: 'uuid' }),
                name: Type.String(),
                contract_no: NullableString,
                so_xe: Type.Integer(),
              }),
            ),
          }),
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async () => {
      const res = await db.query(
        `SELECT c.id, c.name, c.contract_no, count(v.id)::int AS so_xe
         FROM customers c
         LEFT JOIN vehicles v ON v.customer_id = c.id
         GROUP BY c.id, c.name, c.contract_no
         ORDER BY c.name`,
      );
      return { total: res.rows.length, items: res.rows };
    },
  );

  // ---- Mời tài khoản mới -------------------------------------------------------------
  app.post(
    '/users',
    {
      config: { permission: 'user.manage' },
      schema: {
        tags: ['tai-khoan'],
        summary: 'Mời tài khoản mới (F-F1)',
        description:
          'Phase 1 không có mật khẩu: tạo xong là người đó đăng nhập được bằng OTP gửi tới ' +
          'SĐT đã khai. Vai trò tài xế / quản lý đội BẮT BUỘC gắn đội xe; vai trò nội bộ G3 ' +
          '(vận hành, bảo hành, CSKH, admin, sale) BẮT BUỘC không gắn đội.',
        body: Type.Object({
          email: Type.String({ format: 'email', maxLength: 200 }),
          full_name: Type.String({ minLength: 2, maxLength: 200 }),
          role: VaiTroSchema,
          phone: Type.String({ minLength: 8, maxLength: 20, description: 'SĐT GIẢ (quy tắc 12)' }),
          customer_id: Type.Optional(Type.String({ format: 'uuid' })),
        }),
        response: {
          201: TaiKhoanSchema,
          400: ErrorSchema,
          409: ErrorSchema,
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async (request, reply) => {
      const body = request.body as {
        email: string;
        full_name: string;
        role: UserRole;
        phone: string;
        customer_id?: string;
      };

      const thuocDoi = VAI_TRO_THUOC_DOI.includes(body.role);
      if (thuocDoi && !body.customer_id) {
        return sendError(
          reply,
          400,
          'thieu_doi_xe',
          `Vai trò "${body.role}" phải được gắn vào một đội xe — thiếu customer_id thì tài khoản ` +
            'đăng nhập được nhưng không xem được dữ liệu nào.',
        );
      }
      if (!thuocDoi && body.customer_id) {
        return sendError(
          reply,
          400,
          'vai_tro_khong_thuoc_doi',
          `Vai trò nội bộ "${body.role}" không gắn với đội xe nào — bỏ customer_id.`,
        );
      }

      const phone = normalizePhone(body.phone);
      if (!/^0\d{8,11}$/.test(phone)) {
        return sendError(
          reply,
          400,
          'sdt_khong_hop_le',
          'SĐT không hợp lệ (cần dạng 0xxxxxxxxx hoặc +84xxxxxxxxx).',
        );
      }

      if (body.customer_id) {
        const co = await db.query(`SELECT 1 FROM customers WHERE id = $1`, [body.customer_id]);
        if ((co.rowCount ?? 0) === 0) {
          return sendError(reply, 400, 'khong_tim_thay_doi_xe', 'Không tìm thấy đội xe.');
        }
      }

      let created;
      try {
        created = await db.query(
          `INSERT INTO users (email, full_name, role, customer_id, phone)
           VALUES ($1, $2, $3::user_role, $4, $5)
           RETURNING id, email, full_name, role::text AS role, customer_id, phone, is_active, created_at`,
          [body.email, body.full_name, body.role, body.customer_id ?? null, phone],
        );
      } catch (err) {
        if (laLoiTrung(err, 'email')) {
          return sendError(reply, 409, 'email_da_ton_tai', 'Email này đã có tài khoản.');
        }
        if (laLoiTrung(err, 'phone')) {
          return sendError(reply, 409, 'sdt_da_ton_tai', 'Số điện thoại này đã có tài khoản.');
        }
        throw err;
      }

      const row = created.rows[0]!;
      const ten = body.customer_id
        ? await db.query(`SELECT name FROM customers WHERE id = $1`, [body.customer_id])
        : null;

      return reply.status(201).send({
        ...row,
        customer_name: (ten?.rows[0]?.name as string | undefined) ?? null,
        created_at: (row.created_at as Date).toISOString(),
      });
    },
  );

  // ---- Khóa / mở khóa / đổi vai trò ---------------------------------------------------
  app.patch(
    '/users/:id',
    {
      config: { permission: 'user.manage' },
      schema: {
        tags: ['tai-khoan'],
        summary: 'Khóa/mở khóa tài khoản hoặc đổi vai trò (F-F1)',
        description:
          'Có hiệu lực NGAY với cả token đang dùng: guard đọc lại vai trò và is_active từ DB ' +
          'mỗi request (xem auth/guard.ts). Admin KHÔNG tự khóa hay tự hạ quyền chính mình ' +
          'được — đó là cách khóa cứng cả hệ thống.',
        params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
        body: Type.Object({
          role: Type.Optional(VaiTroSchema),
          is_active: Type.Optional(Type.Boolean()),
        }),
        response: {
          200: TaiKhoanSchema,
          400: ErrorSchema,
          404: ErrorSchema,
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async (request, reply) => {
      const auth = requireScopedAuth(request);
      const { id } = request.params as { id: string };
      const body = request.body as { role?: UserRole; is_active?: boolean };

      if (body.role === undefined && body.is_active === undefined) {
        return sendError(
          reply,
          400,
          'khong_co_gi_de_sua',
          'Cần ít nhất một trong: role, is_active.',
        );
      }

      // Tự khóa / tự hạ quyền mình = mất đường vào hệ thống, và không có "quên mật khẩu"
      // nào cứu được vì Phase 1 đăng nhập bằng OTP theo vai trò trong DB.
      if (id === auth.userId) {
        if (body.is_active === false) {
          return sendError(
            reply,
            400,
            'khong_tu_khoa_minh',
            'Không thể tự khóa tài khoản của chính mình. Nhờ một Admin khác thực hiện.',
          );
        }
        if (body.role !== undefined && body.role !== auth.role) {
          return sendError(
            reply,
            400,
            'khong_tu_doi_vai_tro_minh',
            'Không thể tự đổi vai trò của chính mình. Nhờ một Admin khác thực hiện.',
          );
        }
      }

      const hienTai = await db.query(
        `SELECT role::text AS role, customer_id FROM users WHERE id = $1`,
        [id],
      );
      const truoc = hienTai.rows[0];
      if (!truoc)
        return sendError(reply, 404, 'khong_tim_thay_tai_khoan', 'Không tìm thấy tài khoản.');

      // Đổi sang vai trò thuộc đội mà tài khoản chưa gắn đội nào (hoặc ngược lại) sẽ tạo
      // ra tài khoản "hợp lệ trên giấy nhưng không dùng được" — chặn như lúc tạo mới.
      if (body.role !== undefined) {
        const thuocDoi = VAI_TRO_THUOC_DOI.includes(body.role);
        const coDoi = truoc.customer_id !== null;
        if (thuocDoi && !coDoi) {
          return sendError(
            reply,
            400,
            'thieu_doi_xe',
            `Không đổi sang vai trò "${body.role}" được vì tài khoản chưa gắn đội xe nào.`,
          );
        }
        if (!thuocDoi && coDoi) {
          return sendError(
            reply,
            400,
            'vai_tro_khong_thuoc_doi',
            `Vai trò nội bộ "${body.role}" không được gắn với đội xe — gỡ đội trước khi đổi.`,
          );
        }
      }

      const res = await db.query(
        `UPDATE users
         SET role = COALESCE($2::user_role, role),
             is_active = COALESCE($3, is_active)
         WHERE id = $1
         RETURNING id, email, full_name, role::text AS role, customer_id, phone, is_active, created_at`,
        [id, body.role ?? null, body.is_active ?? null],
      );
      const row = res.rows[0]!;
      const ten = row.customer_id
        ? await db.query(`SELECT name FROM customers WHERE id = $1`, [row.customer_id])
        : null;

      return {
        ...row,
        customer_name: (ten?.rows[0]?.name as string | undefined) ?? null,
        created_at: (row.created_at as Date).toISOString(),
      };
    },
  );
}
