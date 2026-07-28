// F-F1 — Phạm vi dữ liệu theo vai trò (ghi chú "\* Phạm vi giới hạn" của sheet 9).
// Phạm vi được ép Ở TRONG CÂU SQL, không lọc sau khi đã lấy về: xe ngoài phạm vi
// không bao giờ rời khỏi database.
import type { Queryable } from '../db';
import type { AuthContext } from './guard';
import type { Grant } from './permissions';

/** Danh tính chắc chắn có phạm vi dữ liệu (route đọc luôn khai báo config.permission). */
export type ScopedAuth = AuthContext & { grant: Grant };

export interface ScopeClause {
  /** Mệnh đề dán vào WHERE, đã tham số hóa. */
  sql: string;
  params: unknown[];
}

/**
 * Điều kiện giới hạn xe mà người gọi được thấy.
 * @param alias bí danh bảng vehicles trong câu truy vấn
 * @param firstParamIndex số thứ tự tham số $n tiếp theo còn trống
 */
export function vehicleScopeClause(
  auth: ScopedAuth,
  alias = 'v',
  firstParamIndex = 1,
): ScopeClause {
  switch (auth.grant.scope) {
    case 'own':
      // Tài xế: chỉ xe đang được gán cho mình (vehicles.assigned_driver_id → drivers.user_id)
      return {
        sql: `${alias}.assigned_driver_id = (SELECT d.id FROM drivers d WHERE d.user_id = $${firstParamIndex})`,
        params: [auth.userId],
      };
    case 'fleet':
      // Chủ xe / QL đội: chỉ xe trong đội mình. guard đã chặn customerId = null.
      return {
        sql: `${alias}.customer_id = $${firstParamIndex}`,
        params: [auth.customerId],
      };
    case 'all':
      return { sql: 'true', params: [] };
  }
}

/**
 * Xe có tồn tại VÀ nằm trong phạm vi của người gọi hay không.
 * Trả về `false` cho cả hai trường hợp "không có xe" và "xe của người khác" — API trả 404
 * đồng nhất để không lộ sự tồn tại của xe ngoài phạm vi.
 */
export async function vehicleInScope(
  db: Queryable,
  auth: ScopedAuth,
  vehicleId: string,
): Promise<boolean> {
  const scope = vehicleScopeClause(auth, 'v', 2);
  const res = await db.query(`SELECT 1 FROM vehicles v WHERE v.id = $1 AND (${scope.sql})`, [
    vehicleId,
    ...scope.params,
  ]);
  return (res.rowCount ?? 0) > 0;
}
