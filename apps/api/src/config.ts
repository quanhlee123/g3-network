// F-F1 — Cấu hình apps/api đọc TỪ BIẾN MÔI TRƯỜNG (quy tắc 3: cấm hardcode secret).
// Mọi biến ở đây phải có mặt trong infra/.env.example và bảng biến môi trường của README.
import { loadEnv } from '@g3/db';
import { RECONCILE_DEFAULTS } from './modules/reconciliation/reconcile';

export interface ApiConfig {
  port: number;
  /** Khóa ký JWT. Sinh ngẫu nhiên vào infra/.env khi `npm install` (scripts/setup-env.mjs). */
  jwtSecret: string;
  /** Hạn dùng access token, cú pháp của @fastify/jwt (vd '12h'). */
  jwtExpiresIn: string;
  otpTtlS: number;
  otpMaxAttempts: number;
  /** Chống dò mã: số lần XIN mã tối đa cho 1 SĐT trong otpRequestWindowS. */
  otpMaxRequestsPerWindow: number;
  otpRequestWindowS: number;
  /** Trần số bản ghi 1 lần gọi lịch sử telemetry — chặn truy vấn quét cả hypertable. */
  telemetryHistoryMaxRows: number;
  /** Cấu hình job đối soát 3 chiều (F-C6, NF-10). */
  reconcile: {
    /** Chu kỳ chạy tự động (ms); 0 = tắt, chỉ chạy tay. */
    intervalMs: number;
    nguongPct: number;
    hieuSuatSac: number;
    giaVndMoiKwh: number;
    cuaSoSocGiay: number;
  };
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

function floatEnv(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} không hợp lệ: "${raw}" (cần số trong khoảng ${min}–${max})`);
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
    otpMaxRequestsPerWindow: intEnv(env, 'OTP_MAX_REQUESTS_PER_WINDOW', 5, 1),
    otpRequestWindowS: intEnv(env, 'OTP_REQUEST_WINDOW_S', 900, 1),
    telemetryHistoryMaxRows: intEnv(env, 'TELEMETRY_HISTORY_MAX_ROWS', 1000, 1),
    reconcile: {
      intervalMs: intEnv(env, 'RECONCILE_INTERVAL_MS', 300_000, 0),
      nguongPct: floatEnv(env, 'RECONCILE_NGUONG_PCT', RECONCILE_DEFAULTS.nguongPct, 0, 100),
      // Hiệu suất sạc: xem docs/adr/ADR-007. 1.0 chỉ đúng với simulator.
      hieuSuatSac: floatEnv(env, 'CHARGE_EFFICIENCY', RECONCILE_DEFAULTS.hieuSuatSac, 0.1, 1),
      giaVndMoiKwh: floatEnv(
        env,
        'CHARGING_PRICE_VND_PER_KWH',
        RECONCILE_DEFAULTS.giaVndMoiKwh,
        1,
        1_000_000,
      ),
      cuaSoSocGiay: intEnv(env, 'RECONCILE_SOC_WINDOW_S', RECONCILE_DEFAULTS.cuaSoSocGiay, 1),
    },
  };
}

/** Nạp infra/.env rồi đọc cấu hình — dùng ở điểm khởi động và ở test. */
export function loadConfigFromEnvFile(): ApiConfig {
  loadEnv();
  return loadConfig(process.env);
}
