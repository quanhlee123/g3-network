// F-F3 — Tìm NGƯỜI NHẬN của một sự kiện: giao giữa bảng cấu hình notification_prefs
// và phạm vi dữ liệu của từng vai trò (sheet 9 — quy tắc 6).
//
// Phạm vi dùng lại đúng 3 mức của apps/api/src/auth/permissions.ts:
//   driver        → CHỈ tài xế đang được gán cho xe đó          (scope 'own')
//   fleet_manager → CHỈ người quản lý cùng customer_id với xe   (scope 'fleet')
//   vai trò nội bộ (energy_ops, warranty_admin, cskh, admin, sale) → tất cả (scope 'all')
//
// Sự kiện KHÔNG gắn xe (vd SOS chưa rõ xe, alert thiết bị chưa gán xe) thì hai vai trò
// phụ thuộc xe tự động không có người nhận — không phải trường hợp lỗi.
import type { NotificationChannel, NotificationSeverity } from '@g3/contracts';
import type { UserRole } from '@g3/shared';

export interface Queryable {
  query(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
}

export interface Recipient {
  user_id: string;
  role: UserRole;
  channels: NotificationChannel[];
  /**
   * SĐT nhận SMS. Ưu tiên `users.phone` (SĐT đăng nhập OTP — mọi vai trò đều có,
   * migration 0013), lùi về `drivers.phone` cho tài xế nhập liệu từ hồ sơ lái xe.
   */
  phone: string | null;
  /** Token đẩy còn hiệu lực; rỗng nghĩa là chưa đăng ký thiết bị nào. */
  push_tokens: string[];
}

/**
 * MỘT truy vấn duy nhất cho cả 3 mức phạm vi — hàm này nằm trên đường đi nóng của ingest
 * (mỗi cảnh báo pin gọi 1 lần), nên không tách thành nhiều vòng hỏi DB.
 */
export async function timNguoiNhan(
  db: Queryable,
  alertType: string,
  severity: NotificationSeverity,
  vehicleId: string | null,
): Promise<Recipient[]> {
  const res = await db.query(
    `WITH pref AS (
       SELECT role, channels FROM notification_prefs
       WHERE alert_type = $1::alert_type AND min_severity <= $2
     ),
     xe AS (
       SELECT v.customer_id, d.user_id AS driver_user_id
       FROM vehicles v
       LEFT JOIN drivers d ON d.id = v.assigned_driver_id
       WHERE v.id = $3::uuid
     )
     SELECT u.id::text AS user_id,
            u.role::text AS role,
            p.channels::text[] AS channels,
            COALESCE(u.phone, dr.phone) AS phone,
            COALESCE(tk.tokens, ARRAY[]::text[]) AS push_tokens
     FROM pref p
     JOIN users u ON u.role = p.role AND u.is_active
     LEFT JOIN drivers dr ON dr.user_id = u.id
     LEFT JOIN xe ON true
     LEFT JOIN LATERAL (
       SELECT array_agg(pt.token) AS tokens FROM push_tokens pt
       WHERE pt.user_id = u.id AND pt.revoked_at IS NULL
     ) tk ON true
     WHERE CASE u.role
              WHEN 'driver'        THEN u.id = xe.driver_user_id
              WHEN 'fleet_manager' THEN u.customer_id = xe.customer_id
              ELSE true
            END
     ORDER BY u.role, u.id`,
    [alertType, severity, vehicleId],
  );

  return res.rows.map((r) => ({
    user_id: r.user_id as string,
    role: r.role as UserRole,
    channels: r.channels as NotificationChannel[],
    phone: (r.phone as string | null) ?? null,
    push_tokens: (r.push_tokens as string[] | null) ?? [],
  }));
}
