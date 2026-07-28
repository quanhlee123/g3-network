// F-F1 — Cấu hình apps/api đọc TỪ BIẾN MÔI TRƯỜNG (quy tắc 3: cấm hardcode secret).
// Mọi biến ở đây phải có mặt trong infra/.env.example và bảng biến môi trường của README.
import { loadEnv } from '@g3/db';

export interface ApiConfig {
  port: number;
  /** Khóa ký JWT. Sinh ngẫu nhiên vào infra/.env khi `npm install` (scripts/setup-env.mjs). */
  jwtSecret: string;
  /** Hạn dùng access token, cú pháp của @fastify/jwt (vd '12h'). */
  jwtExpiresIn: string;
  otpTtlS: number;
  otpMaxAttempts: number;
  /** Trần số bản ghi 1 lần gọi lịch sử telemetry — chặn truy vấn quét cả hypertable. */
  telemetryHistoryMaxRows: number;
}

const MIN_SECRET_LEN = 32;

function intEnv(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`${name} không hợp lệ: "${raw}" (cần số nguyên >= ${min})`);
  }
  return value;
}

/**
 * Đọc & kiểm tra cấu hình. Ném lỗi TIẾNG VIỆT nêu rõ cách sửa thay vì chạy với
 * secret rỗng — API chạy được mà không ký nổi token là lỗi im lặng nguy hiểm nhất.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const jwtSecret = env.JWT_SECRET ?? '';
  if (jwtSecret.length < MIN_SECRET_LEN) {
    throw new Error(
      `JWT_SECRET thiếu hoặc quá ngắn (cần >= ${MIN_SECRET_LEN} ký tự). ` +
        'Chạy lại `npm install` để scripts/setup-env.mjs sinh khóa ngẫu nhiên vào infra/.env.',
    );
  }
  return {
    port: intEnv(env, 'API_PORT', 3000, 1),
    jwtSecret,
    jwtExpiresIn: env.JWT_EXPIRES_IN ?? '12h',
    otpTtlS: intEnv(env, 'OTP_TTL_SECONDS', 300, 30),
    otpMaxAttempts: intEnv(env, 'OTP_MAX_ATTEMPTS', 5, 1),
    telemetryHistoryMaxRows: intEnv(env, 'TELEMETRY_HISTORY_MAX_ROWS', 1000, 1),
  };
}

/** Nạp infra/.env rồi đọc cấu hình — dùng ở điểm khởi động và ở test. */
export function loadConfigFromEnvFile(): ApiConfig {
  loadEnv();
  return loadConfig(process.env);
}
