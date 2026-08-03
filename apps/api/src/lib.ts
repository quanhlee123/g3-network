// F-F1/F-C6 — Điểm xuất của @g3/api dùng cho code KHÁC (script demo, test tích hợp).
// Tách khỏi index.ts vì index.ts là điểm KHỞI ĐỘNG: import nó sẽ tự listen cổng 3000.
export { buildApp, type BuildAppOptions, type RouteGuardConfig } from './app';
export { loadConfig, loadConfigFromEnvFile, type ApiConfig } from './config';
export { createPool, type Queryable } from './db';
export { ROLE_PERMISSIONS, type Permission } from './auth/permissions';

// F-C6 · NF-10 — đối soát 3 chiều + báo cáo
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

// F-J1/F-J3 — sức khoẻ & tamper thiết bị
export {
  quetSucKhoeThietBi,
  phanLoaiImLang,
  NGUONG_SUC_KHOE_MAC_DINH,
  type NguongSucKhoe,
  type TomTatQuet,
} from './modules/devices/health-scan';
export { batLichQuetThietBi } from './modules/devices/scheduler';

// F-I2 — SOS & đồng hồ SLA
export { taoSos, quetSlaTicket, SLA_SOS_PHUT } from './modules/tickets/sos';
export { batLichSla } from './modules/tickets/scheduler';

// F-B1 — chính sách sạc có version
export {
  chinhSachHieuLuc,
  trongKhungGio,
  moTaKhungGio,
  MUI_GIO_MAC_DINH,
  type ChinhSachSac,
  type KhungGio,
} from './modules/policies/policy';

// F-B3/F-B5 — gắn cờ vi phạm sạc & cảnh báo
export {
  kiemTraViPham,
  VI_PHAM_DEFAULTS,
  type TomTatKiemTra,
  type ViPhamOptions,
} from './modules/violations/detect';

// F-H1 — luồng thanh toán (SANDBOX)
export {
  noiCacGiaoDichMoCoi,
  taoGiaoDichChoPhien,
  xuLyWebhook,
  type GiaoDich,
  type ThanhToanOptions,
} from './modules/payments/service';
