// F-F1/F-C6 — Điểm xuất của @g3/api dùng cho code KHÁC (script demo Gate 0, test tích hợp).
// Tách khỏi index.ts vì index.ts là điểm KHỞI ĐỘNG: import nó sẽ tự listen cổng 3000.
export { buildApp, type BuildAppOptions, type RouteGuardConfig } from './app';
export { loadConfig, loadConfigFromEnvFile, type ApiConfig } from './config';
export { createPool, type Queryable } from './db';
export { ROLE_PERMISSIONS, type Permission } from './auth/permissions';
export {
  chayDoiSoat,
  RECONCILE_DEFAULTS,
  type KetQuaDoiSoat,
  type ReconcileOptions,
  type TomTatDoiSoat,
} from './modules/reconciliation/reconcile';
export { batLichDoiSoat } from './modules/reconciliation/scheduler';
export {
  baoCaoLechTheoNgay,
  sanLuongTheoKhach,
  sanLuongTheoPhien,
  type BaoCaoSanLuong,
  type DongLechNgay,
} from './modules/reconciliation/bao-cao';
// F-B3/F-B5 — dùng cho kịch bản nghiệm thu tuần 8
export {
  kiemTraViPham,
  VI_PHAM_DEFAULTS,
  type TomTatKiemTra,
  type ViPhamOptions,
} from './modules/violations/detect';
export {
  chinhSachHieuLuc,
  trongKhungGio,
  moTaKhungGio,
  MUI_GIO_MAC_DINH,
  type ChinhSachSac,
  type KhungGio,
} from './modules/policies/policy';
// F-H1 — luồng thanh toán
export {
  noiCacGiaoDichMoCoi,
  taoGiaoDichChoPhien,
  xuLyWebhook,
  type GiaoDich,
  type ThanhToanOptions,
} from './modules/payments/service';
