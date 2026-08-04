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
  /**
   * Thêm/sửa danh mục trạm & trạng thái KHAI THÁC của trạm (F-C1) — sheet 9 dòng
   * "Quản lý danh mục & trạng thái trạm": ✓ Vận hành G3 Energy, ✓ Admin.
   * KHÔNG bao gồm trạng thái từng trụ: cái đó chỉ đến từ OCPP (F-C2, NF-02).
   */
  'station.manage',
  /** Danh sách phiên sạc (F-B2). */
  'charging_session.read',
  /**
   * Đọc chính sách sạc bảo hành (F-B1).
   * [SUY LUẬN] Sheet 9 chỉ có dòng "Cấu hình chính sách sạc (bảo hành)" (= quyền GHI, xem
   * charging_policy.manage). Không có dòng nào cho việc ĐỌC chính sách. Cấp quyền đọc trong
   * phạm vi xe của mình cho tài xế/QL đội vì F-B5 bắt buộc cảnh báo phải "nêu rõ hành vi &
   * cách khắc phục" — nói người ta vi phạm mà không cho xem quy định đã vi phạm thì cảnh báo
   * vô nghĩa. Đã ghi vào rbac-matrix.md để review.
   */
  'charging_policy.read',
  /** Tạo/đổi version chính sách sạc — sheet 9 dòng "Cấu hình chính sách sạc (bảo hành)": ✓ Bảo hành, ✓ Admin. */
  'charging_policy.manage',
  /** Xem hồ sơ vi phạm sạc + bằng chứng (F-B3) — sheet 9 dòng "Xem trạng thái / báo cáo bảo hành". */
  'violation.read',
  /**
   * Xem cảnh báo pin / bất thường đã bắn (F-A2, F-A4, F-J3) — sheet 9 dòng
   * "Nhận cảnh báo pin / bất thường": Tài xế ✓, QL đội ✓, Bảo hành V, CSKH V, Admin ✓.
   * Vận hành G3 Energy và Sale là "—" nên KHÔNG có mặt ở đây.
   *
   * Khác `notification.read`: đó là HỘP THƯ của một người (đã gửi cho ai), còn đây là
   * SỰ KIỆN cảnh báo gắn với xe — màn hình tổng quan F-E1 cần cái sau để hiện khối
   * "cảnh báo qua đêm" của cả đội, kể cả cảnh báo gửi cho tài xế chứ không gửi cho quản lý.
   */
  'alert.read',
  /** Chạy tay job đối chiếu vi phạm (F-B3). */
  'violation.run',
  /**
   * Bắt đầu phiên sạc bằng QR & tạo lệnh thanh toán (F-H1) — sheet 9 dòng
   * "Thanh toán phiên sạc / ví": Tài xế ✓*, Chủ xe ✓ (đội), Admin ✓.
   */
  'payment.start',
  /** Xem giao dịch thanh toán. Sheet 9 cho CSKH "V (hỗ trợ)" ở cùng dòng. */
  'payment.read',
  /** Sức khỏe thiết bị telematics — last_seen, firmware, nguồn (F-J1). */
  'device_health.read',
  /** Xem kết quả đối soát 3 chiều (NF-10). */
  'reconciliation.read',
  /** Chạy tay job đối soát. */
  'reconciliation.run',
  /** Tạo ticket hỗ trợ / bấm SOS (F-I2). Sheet 9: Tài xế ✓ (tạo), QL đội ✓ (tạo/xem đội). */
  'ticket.create',
  /** Xem ticket trong phạm vi của mình (F-I1/F-I2). */
  'ticket.read',
  /** XỬ LÝ ticket: nhận việc, đóng ticket. Sheet 9: CSKH ✓ (xử lý). */
  'ticket.handle',
  /** Xem vùng geofence áp dụng cho xe/đội (F-A5). */
  'geofence.read',
  /** Tạo/sửa vùng geofence (F-A5) — thao tác cấu hình giám sát, không phải đọc dữ liệu xe. */
  'geofence.manage',
  /**
   * Đọc HỘP THƯ CỦA CHÍNH MÌNH (F-F3) — mọi vai trò đều có, phạm vi luôn là 'own'.
   * [SUY LUẬN] Sheet 9 không có dòng nào cho "thông báo của tôi": ma trận đó nói về quyền
   * xem DỮ LIỆU XE/TRẠM, còn đây là dữ liệu của chính người đăng nhập. Chặn người dùng đọc
   * thông báo gửi cho họ thì cảnh báo an toàn vô nghĩa. Đã ghi vào rbac-matrix.md để review.
   */
  'notification.read',
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
 * Quyền mà MỌI vai trò đều có vì nó chỉ chạm dữ liệu của chính người đăng nhập.
 * Danh sách này cố tình chỉ có 1 phần tử — thêm gì vào đây là nới quyền cho cả 7 vai trò,
 * phải cân nhắc như sửa ma trận sheet 9.
 */
const QUYEN_CUA_MOI_VAI_TRO: RoleGrants = {
  'notification.read': { scope: 'own' },
};

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
    'charging_policy.read': { scope: 'own' },
    'violation.read': { scope: 'own' },
    'alert.read': { scope: 'own' }, // sheet 9 "Nhận cảnh báo pin / bất thường" = ✓
    // Sheet 9: Tài xế ✓* — trả tiền cho phiên sạc của XE MÌNH.
    'payment.start': { scope: 'own' },
    'payment.read': { scope: 'own' },
    // Sheet 9 dòng "Ticket hỗ trợ & SOS": Tài xế ✓ (tạo) — tạo và xem ticket XE MÌNH.
    'ticket.create': { scope: 'own' },
    'ticket.read': { scope: 'own' },
  },
  // Chủ xe / QL đội: V* trong đội mình + V* sản lượng/đối soát kWh + V* sức khỏe thiết bị.
  fleet_manager: {
    'vehicle.read': { scope: 'fleet' },
    'vehicle.location.read': { scope: 'fleet' },
    'station.read': { scope: 'all' },
    'charging_session.read': { scope: 'fleet' },
    'charging_policy.read': { scope: 'fleet' },
    'violation.read': { scope: 'fleet' },
    'alert.read': { scope: 'fleet' }, // sheet 9 "Nhận cảnh báo pin / bất thường" = ✓
    // Sheet 9: Chủ xe / QL đội ✓ (đội) — trả tiền cho cả đội.
    'payment.start': { scope: 'fleet' },
    'payment.read': { scope: 'fleet' },
    'device_health.read': { scope: 'fleet' },
    'reconciliation.read': { scope: 'fleet' },
    // [SUY LUẬN] Sheet 9 không có dòng cho geofence. Đặt cùng mức với quyền xem vị trí xe:
    // ai giám sát được vị trí đội mình thì đặt được vùng cho đội mình (rbac-matrix R-07).
    'geofence.read': { scope: 'fleet' },
    'geofence.manage': { scope: 'fleet' },
    // Sheet 9: QL đội ✓ (tạo/xem ticket của ĐỘI mình).
    'ticket.create': { scope: 'fleet' },
    'ticket.read': { scope: 'fleet' },
  },
  // Vận hành G3 Energy: ✓ trạm & đối soát kWh, nhưng "—" ở dòng "Xem trạng thái & vị trí xe"
  // → KHÔNG có vehicle.read/vehicle.location.read (test bắt buộc của Prompt 06).
  energy_ops: {
    'station.read': { scope: 'all' },
    'station.manage': { scope: 'all' },
    'charging_session.read': { scope: 'all' },
    'reconciliation.read': { scope: 'all' },
    'reconciliation.run': { scope: 'all' },
  },
  // Bảo hành G3 Mobility: V vị trí xe, ✓ hồ sơ bảo hành (phiên sạc là bằng chứng NF-11).
  warranty_admin: {
    'vehicle.read': { scope: 'all' },
    'vehicle.location.read': { scope: 'all' },
    'charging_session.read': { scope: 'all' },
    // Sheet 9 dòng "Cấu hình chính sách sạc (bảo hành)" = ✓ — vai trò DUY NHẤT ngoài admin.
    'charging_policy.read': { scope: 'all' },
    'charging_policy.manage': { scope: 'all' },
    // Sheet 9 dòng "Xem trạng thái / báo cáo bảo hành" = ✓. Hồ sơ vi phạm CHÍNH LÀ hồ sơ
    // bảo hành, nên vai trò này vừa đọc vừa chạy được job đối chiếu.
    'violation.read': { scope: 'all' },
    'violation.run': { scope: 'all' },
    'alert.read': { scope: 'all' }, // sheet 9 "Nhận cảnh báo pin / bất thường" = V
  },
  // CSKH Holding: V vị trí xe CHỈ KHI có ticket đang mở; V sức khỏe thiết bị.
  cskh: {
    'vehicle.read': { scope: 'all' },
    'vehicle.location.read': { scope: 'all', requireOpenTicket: true },
    'charging_session.read': { scope: 'all' },
    // Sheet 9 dòng "Thanh toán phiên sạc / ví" = V (hỗ trợ) — CSKH tra cứu giúp tài xế,
    // KHÔNG tự trả tiền thay.
    'payment.read': { scope: 'all' },
    // Sheet 9 dòng "Xem trạng thái / báo cáo bảo hành" = V — CSKH giải thích cho tài xế
    // vì sao bị cảnh báo vi phạm, nên phải ĐỌC được hồ sơ (không cấu hình, không chạy job).
    'violation.read': { scope: 'all' },
    'alert.read': { scope: 'all' }, // sheet 9 "Nhận cảnh báo pin / bất thường" = V
    'device_health.read': { scope: 'all' },
    // Sheet 9: CSKH ✓ (XỬ LÝ ticket) — xem tất cả và nhận việc.
    'ticket.read': { scope: 'all' },
    'ticket.handle': { scope: 'all' },
  },
  // Admin G3 Network: ✓ toàn bộ.
  admin: {
    'vehicle.read': { scope: 'all' },
    'vehicle.location.read': { scope: 'all' },
    'station.read': { scope: 'all' },
    'station.manage': { scope: 'all' },
    'charging_session.read': { scope: 'all' },
    'charging_policy.read': { scope: 'all' },
    'charging_policy.manage': { scope: 'all' },
    'violation.read': { scope: 'all' },
    'violation.run': { scope: 'all' },
    'alert.read': { scope: 'all' },
    'payment.start': { scope: 'all' },
    'payment.read': { scope: 'all' },
    'device_health.read': { scope: 'all' },
    'reconciliation.read': { scope: 'all' },
    'reconciliation.run': { scope: 'all' },
    'geofence.read': { scope: 'all' },
    'geofence.manage': { scope: 'all' },
    'ticket.create': { scope: 'all' },
    'ticket.read': { scope: 'all' },
    'ticket.handle': { scope: 'all' },
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
  return ROLE_PERMISSIONS[role][permission] ?? QUYEN_CUA_MOI_VAI_TRO[permission];
}
