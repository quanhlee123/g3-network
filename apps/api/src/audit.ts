// F-F1 · QUY TẮC 5 (CLAUDE.md) — Mọi truy cập dữ liệu VỊ TRÍ XE qua API phải ghi audit log:
// ai, lúc nào, xe nào, lý do (NF-06, sheet 9). Bảng: migration 0009_audit_logs.sql.
//
// Ghi cả lần ĐƯỢC PHÉP lẫn lần BỊ TỪ CHỐI: hồ sơ "ai đã cố xem vị trí tài xế" có giá trị
// điều tra không kém gì "ai đã xem" (Nghị định 13/2023 — quyền của chủ thể dữ liệu).
import type { Queryable } from './db';

export const ACTION_VEHICLE_LOCATION_READ = 'vehicle_location.read';
export const ACTION_VEHICLE_LOCATION_DENIED = 'vehicle_location.denied';

export interface AuditEntry {
  userId: string;
  action: string;
  vehicleId: string | null;
  reason: string;
  ticketId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Ghi 1 dòng audit. Lỗi ghi log KHÔNG được nuốt lặng: nếu không ghi được thì
 * request phải hỏng — truy cập vị trí không có dấu vết là điều quy tắc 5 cấm.
 */
export async function writeAuditLog(db: Queryable, entry: AuditEntry): Promise<void> {
  await db.query(
    `INSERT INTO audit_logs (user_id, action, vehicle_id, reason, ticket_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      entry.userId,
      entry.action,
      entry.vehicleId,
      entry.reason,
      entry.ticketId ?? null,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
    ],
  );
}

/**
 * CSKH chỉ được xem vị trí khi có ticket ĐANG MỞ (sheet 9, ghi chú phạm vi).
 * Ticket phải ở trạng thái open/in_progress; nếu ticket gắn xe thì phải đúng xe đang xem.
 */
export async function hasOpenTicket(
  db: Queryable,
  ticketId: string,
  vehicleId: string,
): Promise<boolean> {
  const res = await db.query(
    `SELECT 1 FROM tickets
     WHERE id = $1
       AND status IN ('open', 'in_progress')
       AND (vehicle_id IS NULL OR vehicle_id = $2)`,
    [ticketId, vehicleId],
  );
  return (res.rowCount ?? 0) > 0;
}
