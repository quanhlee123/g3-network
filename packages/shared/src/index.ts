// Khung khởi tạo (Prompt 01, chưa gắn F-xx) — hằng số & tiện ích dùng chung toàn hệ.

// F-G4: types sinh từ schema DB (npm run db:types — xem packages/db)
export * from './db-types';

// F-F1: chuẩn hoá & kiểm tra SĐT — dùng chung apps/api + apps/mobile
export * from './phone';

/**
 * Phiên bản schema bản ghi telematics (NF-16).
 * Đổi schema = migration mới + tăng số này. KHÔNG sửa migration cũ đã merge.
 *
 * v1 → v2 (migration 0021, F-J3): thêm `supply_voltage_v` (điện áp nguồn nuôi thiết bị)
 * và `signal_dbm` (cường độ sóng) — hai trường để phân biệt mất nguồn với mất sóng.
 * Ingest vẫn nhận bản ghi v1 (validator cũ giữ nguyên, xem services/ingest/src/validate.ts).
 */
export const TELEMETRY_SCHEMA_VERSION = 2;

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
