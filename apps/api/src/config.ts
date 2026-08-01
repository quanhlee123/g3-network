// F-F1 — Cấu hình apps/api đọc TỪ BIẾN MÔI TRƯỜNG (quy tắc 3: cấm hardcode secret).
// Mọi biến ở đây phải có mặt trong infra/.env.example và bảng biến môi trường của README.
import { loadEnv } from '@g3/db';
import { NGUONG_SUC_KHOE_MAC_DINH, type NguongSucKhoe } from './modules/devices/health-scan';
import { MUI_GIO_MAC_DINH } from './modules/policies/policy';
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
  /**
   * Múi giờ để hiểu khung giờ ToU của chính sách sạc (F-B1). Khung giờ trong hợp đồng bảo
   * hành là giờ Việt Nam, timestamptz trong DB là UTC — sai chỗ này là gắn cờ vi phạm oan
   * toàn bộ phiên sạc đêm. Xem docs/adr/ADR-010.
   */
  muiGio: string;
  /** Cấu hình job đối soát 3 chiều (F-C6, NF-10). */
  reconcile: {
    /** Chu kỳ chạy tự động (ms); 0 = tắt, chỉ chạy tay. */
    intervalMs: number;
    nguongPct: number;
    hieuSuatSac: number;
    giaVndMoiKwh: number;
    cuaSoSocGiay: number;
  };
  /** Chu kỳ quét đồng hồ SLA ticket (F-I2, ms); 0 = tắt. */
  slaScanIntervalMs: number;
  /** Job quét sức khoẻ & tamper thiết bị (F-J1, F-J3). */
  deviceScan: {
    /** Chu kỳ chạy tự động (ms); 0 = tắt. */
    intervalMs: number;
    nguong: NguongSucKhoe;
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
 * Múi giờ IANA. Kiểm tra bằng chính Intl — tên sai (vd "Asia/HCM") mà để lọt thì mọi so
 * sánh khung giờ âm thầm rơi về UTC, lệch đúng 7 tiếng, và không ai biết cho tới khi
 * hệ thống gắn cờ oan một loạt phiên sạc đêm.
 */
function muiGioEnv(env: NodeJS.ProcessEnv): string {
  const raw = env.APP_TIMEZONE ?? MUI_GIO_MAC_DINH;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: raw });
  } catch {
    throw new Error(
      `APP_TIMEZONE không hợp lệ: "${raw}" (cần tên múi giờ IANA, vd Asia/Ho_Chi_Minh)`,
    );
  }
  return raw;
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
    muiGio: muiGioEnv(env),
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
    slaScanIntervalMs: intEnv(env, 'SLA_SCAN_INTERVAL_MS', 60_000, 0),
    deviceScan: {
      intervalMs: intEnv(env, 'DEVICE_SCAN_INTERVAL_MS', 600_000, 0),
      nguong: {
        imLangGio: floatEnv(
          env,
          'DEVICE_SILENCE_HOURS',
          NGUONG_SUC_KHOE_MAC_DINH.imLangGio,
          0.01,
          720,
        ),
        dienApNguonThapV: floatEnv(
          env,
          'DEVICE_SUPPLY_VOLTAGE_LOW_V',
          NGUONG_SUC_KHOE_MAC_DINH.dienApNguonThapV,
          0,
          60,
        ),
        // dBm luôn ÂM: khoảng hợp lệ -140..0, không phải 0..140.
        songYeuDbm: floatEnv(
          env,
          'DEVICE_SIGNAL_WEAK_DBM',
          NGUONG_SUC_KHOE_MAC_DINH.songYeuDbm,
          -140,
          0,
        ),
      },
    },
  };
}

/** Nạp infra/.env rồi đọc cấu hình — dùng ở điểm khởi động và ở test. */
export function loadConfigFromEnvFile(): ApiConfig {
  loadEnv();
  return loadConfig(process.env);
}
