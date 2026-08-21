// F-E1 — Cấu hình portal đọc TỪ BIẾN MÔI TRƯỜNG (quy tắc 3: cấm hardcode).
//
// Chú ý sự khác biệt với app tài xế (F-D4): ở đó biến phải mang tiền tố EXPO_PUBLIC_ và
// bị nhúng vào bundle tải về máy. Portal thì KHÔNG: mọi lời gọi API đều xuất phát từ
// máy chủ Next.js (Server Component / Route Handler), nên G3_API_URL không có tiền tố
// NEXT_PUBLIC_ và không bao giờ rời khỏi máy chủ. Token đăng nhập cũng vậy — xem phien.ts.

/** Địa chỉ apps/api mà máy chủ portal gọi tới. */
export function apiUrl(env: NodeJS.ProcessEnv = process.env): string {
  const raw = (env.G3_API_URL ?? '').trim();
  if (raw !== '') return raw.replace(/\/+$/, '');
  return `http://localhost:${env.API_PORT ?? '3000'}`;
}

/**
 * Hạn chờ một lời gọi API (ms). Màn hình tổng quan gọi nhiều endpoint một lúc; để rộng
 * tay hơn app tài xế vì portal chạy trong mạng nội bộ chứ không phải sóng di động.
 */
export function apiTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.G3_API_TIMEOUT_MS ?? '');
  return Number.isFinite(raw) && raw > 0 ? raw : 8000;
}
