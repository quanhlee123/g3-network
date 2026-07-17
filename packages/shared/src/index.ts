// Khung khởi tạo (Prompt 01, chưa gắn F-xx) — hằng số & tiện ích dùng chung toàn hệ.

/**
 * Phiên bản schema bản ghi telematics (NF-16).
 * Đổi schema = migration mới + tăng số này. KHÔNG sửa migration cũ đã merge.
 */
export const TELEMETRY_SCHEMA_VERSION = 1;

/** Đơn vị chuẩn toàn hệ (NF-17). */
export const UNITS = {
  currency: 'VNĐ',
  distance: 'km',
  energy: 'kWh',
} as const;

/** Định dạng tiền theo chuẩn Việt Nam, ví dụ 1500000 -> "1.500.000 VNĐ". */
export function formatVnd(amount: number): string {
  return `${amount.toLocaleString('vi-VN')} ${UNITS.currency}`;
}
