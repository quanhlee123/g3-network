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
