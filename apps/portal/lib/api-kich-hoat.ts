// F-F2 — Hình dạng dữ liệu luồng kích hoạt thiết bị theo VIN.

export interface PhienKichHoat {
  id: string;
  vehicle_id: string;
  vin: string;
  model: string;
  customer_name: string;
  device_id: string | null;
  device_serial: string | null;
  status: string;
  buoc: string;
  consent_version: string | null;
  consent_at: string | null;
  consent_driver_id: string | null;
  consent_driver_name: string | null;
  telemetry_ok_at: string | null;
  cho_telemetry_giay: number | null;
  ly_do_that_bai: string | null;
  thuc_hien_boi_ten: string;
  bat_dau_at: string;
  ket_thuc_at: string | null;
}

export interface VanBanConsent {
  version: string;
  tieu_de: string;
  noi_dung: string;
  la_ban_nhap: boolean;
}

export interface TrangThaiTelemetry {
  da_ve: boolean;
  cho_giay: number;
  qua_han: boolean;
  ban_ghi_dau_at: string | null;
}

export interface KpiKichHoat {
  so_thanh_cong: number;
  so_that_bai: number;
  so_dang_lam: number;
  so_huy: number;
  mau_so: number;
  /** null = chưa có phiên nào kết thúc (KHÔNG phải 0%). */
  ty_le_pct: number | null;
  dat_muc_tieu: boolean | null;
}

export interface DanhSachKichHoat {
  kpi: KpiKichHoat;
  total: number;
  items: PhienKichHoat[];
}

/** Trần chờ telemetry, khớp CHO_TELEMETRY_TOI_DA_GIAY của apps/api. */
export const CHO_TELEMETRY_TOI_DA_GIAY = 60;

/** Nhãn tiếng Việt cho từng bước của quy trình. */
export const TEN_BUOC: Record<string, string> = {
  chon_xe: 'Đã nhận VIN',
  gan_thiet_bi: 'Đã gán thiết bị',
  consent: 'Tài xế đã đồng ý',
  cho_telemetry: 'Dữ liệu đã về',
  xong: 'Hoàn tất',
};

export function tenTrangThai(status: string): string {
  switch (status) {
    case 'dang_lam':
      return 'Đang thực hiện';
    case 'thanh_cong':
      return 'Thành công';
    case 'that_bai':
      return 'Thất bại';
    case 'huy':
      return 'Đã huỷ';
    default:
      return status;
  }
}
