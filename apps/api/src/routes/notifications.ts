// F-F3 — Hộp thư in-app + lịch sử gửi thông báo của CHÍNH người đăng nhập.
//
// Mọi truy vấn ở đây khoá cứng theo user_id của token, KHÔNG nhận user_id từ query:
// hộp thư là dữ liệu cá nhân (Nghị định 13/2023), không ai xem hộp thư người khác —
// kể cả admin (muốn điều tra thì đọc bảng notifications qua quyền quản trị dữ liệu).
import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/guard';
import type { Queryable } from '../db';
import { AUTH_ERROR_RESPONSES, sendError } from '../errors';

export interface NotificationRoutesDeps {
  db: Queryable;
}

const NullableString = Type.Union([Type.String(), Type.Null()]);

export async function notificationRoutes(
  app: FastifyInstance,
  deps: NotificationRoutesDeps,
): Promise<void> {
  const { db } = deps;

  app.get(
    '/notifications',
    {
      config: { permission: 'notification.read' },
      schema: {
        tags: ['thong-bao'],
        summary: 'Hộp thư in-app & lịch sử gửi của tôi (F-F3)',
        description:
          'Chỉ trả thông báo của chính người đăng nhập. status: sent = đã gửi · ' +
          'failed = kênh lỗi · suppressed = bị chặn do giới hạn tần suất (kênh in-app ' +
          'không bao giờ bị chặn nên thông tin không mất).',
        querystring: Type.Object({
          chua_doc: Type.Optional(Type.Boolean({ description: 'Chỉ lấy thông báo chưa đọc' })),
          kenh: Type.Optional(
            Type.Union([Type.Literal('push'), Type.Literal('in_app'), Type.Literal('sms')]),
          ),
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200, default: 50 })),
        }),
        response: {
          200: Type.Object({
            tong_chua_doc: Type.Integer(),
            items: Type.Array(
              Type.Object({
                id: Type.String({ format: 'uuid' }),
                alert_type: Type.String(),
                severity: Type.Integer(),
                channel: Type.String(),
                status: Type.String(),
                title: Type.String(),
                body: Type.String(),
                data: Type.Unknown(),
                error: NullableString,
                read_at: NullableString,
                created_at: Type.String(),
              }),
            ),
          }),
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async (request) => {
      const auth = requireAuth(request);
      const q = request.query as { chua_doc?: boolean; kenh?: string; limit?: number };

      const filters = ['user_id = $1'];
      const params: unknown[] = [auth.userId];
      if (q.chua_doc === true) filters.push('read_at IS NULL');
      if (q.kenh !== undefined) {
        params.push(q.kenh);
        filters.push(`channel = $${params.length}::notification_channel`);
      }
      params.push(q.limit ?? 50);

      const res = await db.query(
        `SELECT id, alert_type::text, severity, channel::text, status::text,
                title, body, data, error, read_at, created_at
         FROM notifications
         WHERE ${filters.join(' AND ')}
         ORDER BY created_at DESC
         LIMIT $${params.length}`,
        params,
      );
      const chuaDoc = await db.query(
        `SELECT count(*)::int AS n FROM notifications
         WHERE user_id = $1 AND read_at IS NULL AND channel = 'in_app'`,
        [auth.userId],
      );

      return {
        tong_chua_doc: (chuaDoc.rows[0]?.n as number) ?? 0,
        items: res.rows.map((r) => ({
          ...r,
          read_at: r.read_at instanceof Date ? r.read_at.toISOString() : null,
          created_at: (r.created_at as Date).toISOString(),
        })),
      };
    },
  );

  app.post(
    '/notifications/:id/da-doc',
    {
      config: { permission: 'notification.read' },
      schema: {
        tags: ['thong-bao'],
        summary: 'Đánh dấu một thông báo là đã đọc (F-F3)',
        params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
        response: {
          200: Type.Object({ id: Type.String({ format: 'uuid' }), read_at: Type.String() }),
          404: Type.Object({
            error: Type.Object({ code: Type.String(), message: Type.String() }),
          }),
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request);
      const { id } = request.params as { id: string };

      // Điều kiện user_id chính là phần chống xem/sửa hộp thư người khác.
      const res = await db.query(
        `UPDATE notifications SET read_at = COALESCE(read_at, now())
         WHERE id = $1 AND user_id = $2
         RETURNING id, read_at`,
        [id, auth.userId],
      );
      const row = res.rows[0];
      if (!row) {
        return sendError(
          reply,
          404,
          'khong_thay_thong_bao',
          'Không có thông báo này trong hộp thư của bạn.',
        );
      }
      return { id: row.id as string, read_at: (row.read_at as Date).toISOString() };
    },
  );
}
