// F-F3 — Cấu hình rate-limit thông báo, đọc từ biến môi trường (quy tắc 3: cấm hardcode).
// Yêu cầu gốc: sheet 2 PRD, hành trình tài xế bước 5 — "Thông báo đúng lúc, không spam
// (giới hạn tần suất)".

export interface RateLimitConfig {
  /** Số thông báo ĐÃ GỬI tối đa cho 1 (người nhận × loại alert × kênh) trong 1 cửa sổ. */
  max: number;
  /** Độ dài cửa sổ, tính bằng giây. */
  windowS: number;
}

function soNguyenDuong(env: NodeJS.ProcessEnv, ten: string, macDinh: number): number {
  const raw = env[ten];
  if (raw === undefined || raw === '') return macDinh;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`${ten} không hợp lệ: "${raw}" (cần số nguyên ≥ 1)`);
  }
  return n;
}

/**
 * Mặc định 3 tin / 15 phút: đủ để tài xế không bị dồn thông báo trùng lặp, vẫn đủ thoáng
 * cho một chuyến có nhiều loại sự kiện khác nhau (rate-limit tính riêng theo loại alert).
 */
export function resolveRateLimit(env: NodeJS.ProcessEnv): RateLimitConfig {
  return {
    max: soNguyenDuong(env, 'NOTIFY_RATE_LIMIT_MAX', 3),
    windowS: soNguyenDuong(env, 'NOTIFY_RATE_LIMIT_WINDOW_S', 900),
  };
}

/**
 * Mức nặng KHÔNG BAO GIỜ bị rate-limit chặn — xem docs/adr/ADR-008.
 * Cảnh báo nguy cấp (pin ≤10%, nhiệt độ pin vượt ngưỡng an toàn, tamper) là thông tin
 * an toàn/tài sản: thà gửi trùng còn hơn im lặng.
 */
export const SEVERITY_BO_QUA_RATE_LIMIT = 3;
