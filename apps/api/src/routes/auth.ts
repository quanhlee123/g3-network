// F-F1 — Đăng nhập bằng OTP qua SĐT + thông tin phiên đăng nhập.
// Phase 1: OTP in ra console qua ConsoleSmsSender (quy tắc 2 & 12) — KHÔNG gửi SMS thật.
import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { isValidPhone } from '@g3/shared';
import type { Queryable } from '../db';
import { sendError, ErrorSchema } from '../errors';
import { requireAuth } from '../auth/guard';
import type { OtpService } from '../auth/otp';
import { ROLE_PERMISSIONS } from '../auth/permissions';

export interface AuthRoutesDeps {
  db: Queryable;
  otp: OtpService;
  jwtExpiresIn: string;
}

const PhoneSchema = Type.String({
  minLength: 8,
  maxLength: 20,
  description: 'SĐT đăng nhập. Phase 1 dùng số GIẢ, xem npm run db:seed (vd 0900000003).',
});

export async function authRoutes(app: FastifyInstance, deps: AuthRoutesDeps): Promise<void> {
  app.post(
    '/auth/otp/request',
    {
      config: { public: true },
      schema: {
        tags: ['xac-thuc'],
        summary: 'Xin mã OTP đăng nhập (F-F1)',
        description:
          'Luôn trả 202 dù SĐT có tồn tại hay không — người ngoài không dò được danh sách ' +
          'tài khoản. Phase 1: mã in ra console của apps/api, không gửi SMS thật.',
        body: Type.Object({ phone: PhoneSchema }),
        response: {
          202: Type.Object({ message: Type.String() }),
          400: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { phone } = request.body as { phone: string };
      if (!isValidPhone(phone)) {
        return sendError(
          reply,
          400,
          'sdt_khong_hop_le',
          'SĐT không hợp lệ (cần dạng 0xxxxxxxxx hoặc +84xxxxxxxxx).',
        );
      }
      await deps.otp.request(phone);
      return reply.status(202).send({
        message: 'Nếu SĐT có tài khoản, mã OTP đã được gửi. Phase 1: xem console của apps/api.',
      });
    },
  );

  app.post(
    '/auth/otp/verify',
    {
      config: { public: true },
      schema: {
        tags: ['xac-thuc'],
        summary: 'Đổi mã OTP lấy token đăng nhập (F-F1)',
        body: Type.Object({
          phone: PhoneSchema,
          code: Type.String({ minLength: 4, maxLength: 10, description: 'Mã OTP 6 chữ số' }),
        }),
        response: {
          200: Type.Object({
            access_token: Type.String(),
            token_type: Type.Literal('Bearer'),
            expires_in: Type.Integer({ description: 'Số giây còn hiệu lực' }),
            user: Type.Object({
              id: Type.String({ format: 'uuid' }),
              full_name: Type.String(),
              role: Type.String(),
            }),
          }),
          401: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { phone, code } = request.body as { phone: string; code: string };
      const result = await deps.otp.verify(phone, code);
      if (!result.ok) {
        const messages: Record<typeof result.reason, string> = {
          ma_khong_dung: 'Mã OTP không đúng.',
          ma_het_han: 'Mã OTP đã hết hạn — xin mã mới.',
          qua_so_lan: 'Nhập sai quá số lần cho phép — xin mã mới.',
        };
        return sendError(reply, 401, result.reason, messages[result.reason]);
      }

      const token = app.jwt.sign(
        { sub: result.user.id, role: result.user.role },
        { expiresIn: deps.jwtExpiresIn },
      );
      const decoded = app.jwt.decode<{ exp?: number }>(token);
      const expiresIn = Math.max(0, (decoded?.exp ?? 0) - Math.floor(Date.now() / 1000));

      return reply.send({
        access_token: token,
        token_type: 'Bearer' as const,
        expires_in: expiresIn,
        user: {
          id: result.user.id,
          full_name: result.user.fullName,
          role: result.user.role,
        },
      });
    },
  );

  app.get(
    '/auth/me',
    {
      config: { authenticated: true },
      schema: {
        tags: ['xac-thuc'],
        summary: 'Thông tin tài khoản đang đăng nhập & danh sách quyền (F-F1)',
        response: {
          200: Type.Object({
            id: Type.String({ format: 'uuid' }),
            full_name: Type.String(),
            role: Type.String(),
            customer_id: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
            permissions: Type.Array(
              Type.Object({
                permission: Type.String(),
                scope: Type.String({ description: 'own | fleet | all' }),
                require_open_ticket: Type.Boolean(),
              }),
            ),
          }),
          401: ErrorSchema,
        },
      },
    },
    async (request) => {
      const auth = requireAuth(request);
      const grants = ROLE_PERMISSIONS[auth.role];
      return {
        id: auth.userId,
        full_name: auth.fullName,
        role: auth.role,
        customer_id: auth.customerId,
        permissions: Object.entries(grants).map(([permission, grant]) => ({
          permission,
          scope: grant.scope,
          require_open_ticket: grant.requireOpenTicket === true,
        })),
      };
    },
  );
}
