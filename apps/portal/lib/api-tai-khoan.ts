// F-F1 — Hình dạng dữ liệu cho màn hình quản trị tài khoản & nhật ký truy cập.
// Tách khỏi lib/api.ts để hai màn hình quản trị không kéo theo kiểu của màn hình tổng quan.

export interface TaiKhoan {
  id: string;
  email: string;
  full_name: string;
  role: string;
  customer_id: string | null;
  customer_name: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
}

export interface DanhSachTaiKhoan {
  total: number;
  items: TaiKhoan[];
}

export interface DongNhatKy {
  id: number;
  occurred_at: string;
  action: string;
  user_id: string;
  user_name: string;
  user_role: string;
  vehicle_id: string | null;
  vin: string | null;
  reason: string;
  ticket_id: string | null;
  /** Số xe đã hiện trong một lần xem bản đồ; null với truy cập một xe (rbac-matrix R-13). */
  so_xe: number | null;
  metadata: unknown;
}

export interface DanhSachNhatKy {
  total: number;
  limit: number;
  offset: number;
  items: DongNhatKy[];
}

/** Vai trò cho ô chọn — đúng enum user_role của migration 0001. */
export const VAI_TRO_CHON: { ma: string; ten: string; thuocDoi: boolean }[] = [
  { ma: 'driver', ten: 'Tài xế', thuocDoi: true },
  { ma: 'fleet_manager', ten: 'Quản lý đội xe', thuocDoi: true },
  { ma: 'energy_ops', ten: 'Vận hành G3 Energy', thuocDoi: false },
  { ma: 'warranty_admin', ten: 'Bảo hành G3 Mobility', thuocDoi: false },
  { ma: 'cskh', ten: 'CSKH Holding', thuocDoi: false },
  { ma: 'admin', ten: 'Admin G3 Network', thuocDoi: false },
  { ma: 'sale', ten: 'Sale Holding', thuocDoi: false },
];

/** Vai trò này có bắt buộc gắn đội xe không (khớp VAI_TRO_THUOC_DOI của apps/api). */
export function vaiTroThuocDoi(ma: string): boolean {
  return VAI_TRO_CHON.find((v) => v.ma === ma)?.thuocDoi ?? false;
}
