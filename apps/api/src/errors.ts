// F-F1 — Định dạng lỗi thống nhất cho toàn API. Thông điệp TIẾNG VIỆT (NF-17) và
// KHÔNG lộ chi tiết nội bộ (tên bảng, SQL) ra ngoài.
import { Type } from '@sinclair/typebox';
import type { FastifyReply } from 'fastify';

export const ErrorSchema = Type.Object(
  {
    error: Type.Object({
      code: Type.String({ description: 'Mã lỗi máy đọc được, vd khong_du_quyen' }),
      message: Type.String({ description: 'Mô tả tiếng Việt cho người dùng' }),
    }),
  },
  { $id: 'Loi' },
);

/** Các phản hồi lỗi dùng chung, gắn vào schema của mọi route cần xác thực. */
export const AUTH_ERROR_RESPONSES = {
  401: ErrorSchema,
  403: ErrorSchema,
} as const;

export function sendError(
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
): FastifyReply {
  return reply.status(status).send({ error: { code, message } });
}

/**
 * Thông điệp của một quy tắc nghiệp vụ do trigger PostgreSQL ném ra (RAISE EXCEPTION,
 * SQLSTATE P0001), hoặc null nếu là lỗi khác.
 *
 * CHỈ nhận P0001 — đó là các câu tiếng Việt do chính chúng ta viết trong migration
 * (vd "Chính sách sạc KHÔNG được sửa đè"), an toàn để trả cho người gọi. Lỗi ràng buộc
 * khác (23xxx) mang tên bảng/cột/index của PostgreSQL nên KHÔNG được lộ ra ngoài.
 */
export function thongDiepQuyTacDb(err: unknown): string | null {
  const e = err as { code?: unknown; message?: unknown };
  if (e?.code === 'P0001' && typeof e.message === 'string') return e.message;
  return null;
}
