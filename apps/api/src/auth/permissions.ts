// F-F1 — Ma trận phân quyền, chuyển thẳng từ docs/prd/09-rbac.md (sheet 9 PRD v2.0).
//
// QUY TẮC 6 (CLAUDE.md): MẶC ĐỊNH LÀ TỪ CHỐI. Vai trò nào không xuất hiện trong
// ROLE_PERMISSIONS[vai_trò][quyền] thì không có quyền đó — không có nhánh "else cho qua".
// Route nào quên khai báo quyền cũng bị chặn (xem guard.ts + test app.test.ts).
//
// Ánh xạ endpoint ↔ dòng sheet 9 và các chỗ tôi phải SUY LUẬN nằm ở
// docs/architecture/rbac-matrix.md — mục [CẦN REVIEW] cần người duyệt.
import type { UserRole } from '@g3/shared';

export const PERMISSIONS = [
  /** Xem xe & dữ liệu pin/vận hành — KHÔNG gồm toạ độ (sheet 9: "Xem trạng thái & vị trí xe"). */
  'vehicle.read',
  /** Xem TOẠ ĐỘ xe — luôn ghi audit log (quy tắc 5, NF-06, Nghị định 13/2023). */
  'vehicle.location.read',
  /** Danh mục trạm + trạng thái trụ (sheet 9: "Tìm & điều hướng trạm sạc" ∪ "Quản lý danh mục…"). */
  'station.read',
  /** Danh sách phiên sạc (F-B2). */
  'charging_session.read',
  /** Sức khỏe thiết bị telematics — last_seen, firmware, nguồn (F-J1). */
  'device_health.read',
  /** Xem kết quả đối soát 3 chiều (NF-10). */
  'reconciliation.read',
  /** Chạy tay job đối soát. */
  'reconciliation.run',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Phạm vi dữ liệu, đúng ghi chú "\* Phạm vi giới hạn" của sheet 9:
 * - `own`   — tài xế: CHỈ xe được gán cho mình
 * - `fleet` — chủ xe/QL đội: CHỈ xe trong đội (cùng customer_id)
 * - `all`   — vai trò nội bộ G3/Holding: toàn bộ
 */
export type Scope = 'own' | 'fleet' | 'all';

export interface Grant {
  scope: Scope;
  /**
   * Sheet 9, ghi chú phạm vi: "CSKH chỉ xem vị trí xe khi có ticket/SOS đang mở
   * (bảo vệ riêng tư tài xế — Nghị định 13/2023)". Bắt buộc truyền ticket_id hợp lệ.
   */
  requireOpenTicket?: true;
}

type RoleGrants = Partial<Record<Permission, Grant>>;

/**
 * Bảng quyền. Đọc theo cột vai trò của sheet 9:
 * ✓ = toàn quyền (scope all) · V = chỉ xem · V\* = chỉ xem trong phạm vi · — = KHÔNG có mặt ở đây.
 */
export const ROLE_PERMISSIONS: Record<UserRole, RoleGrants> = {
  // Tài xế: V* mọi thứ về xe MÌNH; không có quyền thiết bị, không có đối soát kWh.
  driver: {
    'vehicle.read': { scope: 'own' },
    'vehicle.location.read': { scope: 'own' },
    'station.read': { scope: 'all' }, // "Tìm & điều hướng trạm sạc" = ✓
    'charging_session.read': { scope: 'own' },
  },
  // Chủ xe / QL đội: V* trong đội mình + V* sản lượng/đối soát kWh + V* sức khỏe thiết bị.
  fleet_manager: {
    'vehicle.read': { scope: 'fleet' },
    'vehicle.location.read': { scope: 'fleet' },
    'station.read': { scope: 'all' },
    'charging_session.read': { scope: 'fleet' },
    'device_health.read': { scope: 'fleet' },
    'reconciliation.read': { scope: 'fleet' },
  },
  // Vận hành G3 Energy: ✓ trạm & đối soát kWh, nhưng "—" ở dòng "Xem trạng thái & vị trí xe"
  // → KHÔNG có vehicle.read/vehicle.location.read (test bắt buộc của Prompt 06).
  energy_ops: {
    'station.read': { scope: 'all' },
    'charging_session.read': { scope: 'all' },
    'reconciliation.read': { scope: 'all' },
    'reconciliation.run': { scope: 'all' },
  },
  // Bảo hành G3 Mobility: V vị trí xe, ✓ hồ sơ bảo hành (phiên sạc là bằng chứng NF-11).
  warranty_admin: {
    'vehicle.read': { scope: 'all' },
    'vehicle.location.read': { scope: 'all' },
    'charging_session.read': { scope: 'all' },
  },
  // CSKH Holding: V vị trí xe CHỈ KHI có ticket đang mở; V sức khỏe thiết bị.
  cskh: {
    'vehicle.read': { scope: 'all' },
    'vehicle.location.read': { scope: 'all', requireOpenTicket: true },
    'charging_session.read': { scope: 'all' },
    'device_health.read': { scope: 'all' },
  },
  // Admin G3 Network: ✓ toàn bộ.
  admin: {
    'vehicle.read': { scope: 'all' },
    'vehicle.location.read': { scope: 'all' },
    'station.read': { scope: 'all' },
    'charging_session.read': { scope: 'all' },
    'device_health.read': { scope: 'all' },
    'reconciliation.read': { scope: 'all' },
    'reconciliation.run': { scope: 'all' },
  },
  // Sale (Holding): sheet 9 cho V ở dòng "Xem trạng thái & vị trí xe".
  // [CẦN REVIEW] Quyền xem toạ độ tài xế cho vai trò bán hàng khó biện minh theo nguyên tắc
  // "thu thập tối thiểu" của Nghị định 13/2023 — giữ đúng sheet 9, đã nêu trong rbac-matrix.md.
  sale: {
    'vehicle.read': { scope: 'all' },
    'vehicle.location.read': { scope: 'all' },
  },
};

/** Quyền của vai trò với một hành động; `undefined` = TỪ CHỐI. */
export function grantFor(role: UserRole, permission: Permission): Grant | undefined {
  return ROLE_PERMISSIONS[role][permission];
}
