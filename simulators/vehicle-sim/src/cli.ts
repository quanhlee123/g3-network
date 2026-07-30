// F-A1/F-A2/F-A4/F-J3 — Đọc cấu hình simulator từ tham số CLI (parseArgs của node:util).
// Mọi thời lượng là flag để nghiệm thu nhanh (không phải chờ 2h thật); mặc định đúng đề bài.
import { parseArgs } from 'node:util';
import { TEN_TUYEN, type TenTuyen } from './route';

export const SCENARIOS = ['normal', 'drain', 'offline', 'temp', 'power-loss', 'charge'] as const;
export type Scenario = (typeof SCENARIOS)[number];

export interface SimConfig {
  count: number;
  scenario: Scenario;
  /**
   * Tuyến chạy: `bac` = Hà Nội – Lạng Sơn (mặc định), `nam` = TP.HCM – Tân An.
   * Cả hai đều đi sát các trạm sạc trong seed (D-10 — xem docs/DECISION-LOG.md).
   */
  route: TenTuyen;
  vinPrefix: string;
  /**
   * Số thứ tự VIN đầu tiên (mặc định 1 → VIN ...-0001).
   * Cho phép chạy NHIỀU tiến trình vehicle-sim song song với kịch bản khác nhau mà
   * không trùng VIN — demo Gate 0 cần 19 xe "normal" + 1 xe "drain".
   */
  vinStart: number;
  intervalMs: number;
  /** Kịch bản drain: SOC 100% → 5% trong số phút này. */
  drainMinutes: number;
  /** Kịch bản offline: mất sóng bắt đầu sau số phút này... */
  offlineAfterMinutes: number;
  /** ...và kéo dài số phút này (mặc định 120 = 2 giờ, NF-09). */
  offlineMinutes: number;
  /** Kịch bản temp: nhiệt độ pin leo lên 60°C trong số phút này (F-A4). */
  tempRampMinutes: number;
  /** Kịch bản power-loss: cắt nguồn đột ngột sau số phút này (F-J3). */
  powerLossAfterMinutes: number;
  /** Kịch bản charge: xe đứng yên, SOC TĂNG theo công suất sạc này (kW). */
  chargePowerKw: number;
  /** Kịch bản charge: SOC lúc cắm sạc (%). */
  chargeStartSocPct: number;
  seed: number;
  mqttUrl: string;
}

function parseIntFlag(
  name: string,
  raw: string | undefined,
  fallback: number,
  min: number,
): number {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`--${name} phải là số nguyên >= ${min}, nhận được: "${raw}"`);
  }
  return value;
}

/** Cùng quy ước với resolveMqttUrl của services/ingest (env MQTT_URL, mặc định localhost). */
export function defaultMqttUrl(env: NodeJS.ProcessEnv): string {
  return env.MQTT_URL ?? 'mqtt://localhost:1883';
}

/** Đọc và kiểm tra toàn bộ flag CLI; lỗi ném ra bằng tiếng Việt. */
export function parseSimArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): SimConfig {
  const { values } = parseArgs({
    args: argv,
    options: {
      count: { type: 'string', default: '1' },
      scenario: { type: 'string', default: 'normal' },
      route: { type: 'string', default: 'bac' },
      'vin-prefix': { type: 'string', default: 'G3-SIM' },
      'vin-start': { type: 'string' },
      'interval-ms': { type: 'string' },
      'charge-power-kw': { type: 'string' },
      'charge-start-soc': { type: 'string' },
      'drain-minutes': { type: 'string' },
      'offline-after-minutes': { type: 'string' },
      'offline-minutes': { type: 'string' },
      'temp-ramp-minutes': { type: 'string' },
      'power-loss-after-minutes': { type: 'string' },
      seed: { type: 'string' },
      'mqtt-url': { type: 'string' },
    },
    allowPositionals: true,
  });

  const count = Number(values.count);
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`--count phải là số nguyên >= 1, nhận được: "${values.count}"`);
  }

  const scenario = values.scenario as string;
  if (!(SCENARIOS as readonly string[]).includes(scenario)) {
    throw new Error(`--scenario không hợp lệ: "${scenario}" (chỉ nhận: ${SCENARIOS.join(' | ')})`);
  }

  const route = values.route as string;
  if (!(TEN_TUYEN as readonly string[]).includes(route)) {
    throw new Error(`--route không hợp lệ: "${route}" (chỉ nhận: ${TEN_TUYEN.join(' | ')})`);
  }

  const vinPrefix = values['vin-prefix'] as string;
  if (vinPrefix === '' || /[/+#\s]/.test(vinPrefix)) {
    throw new Error(
      `--vin-prefix không hợp lệ: "${vinPrefix}" (cấm rỗng, '/', '+', '#', khoảng trắng — VIN dùng làm topic MQTT)`,
    );
  }

  return {
    count,
    scenario: scenario as Scenario,
    route: route as TenTuyen,
    vinPrefix,
    vinStart: parseIntFlag('vin-start', values['vin-start'], 1, 1),
    intervalMs: parseIntFlag('interval-ms', values['interval-ms'], 10_000, 100),
    chargePowerKw: parseIntFlag('charge-power-kw', values['charge-power-kw'], 120, 1),
    chargeStartSocPct: parseIntFlag('charge-start-soc', values['charge-start-soc'], 30, 0),
    drainMinutes: parseIntFlag('drain-minutes', values['drain-minutes'], 30, 1),
    offlineAfterMinutes: parseIntFlag(
      'offline-after-minutes',
      values['offline-after-minutes'],
      1,
      0,
    ),
    offlineMinutes: parseIntFlag('offline-minutes', values['offline-minutes'], 120, 1),
    tempRampMinutes: parseIntFlag('temp-ramp-minutes', values['temp-ramp-minutes'], 10, 1),
    powerLossAfterMinutes: parseIntFlag(
      'power-loss-after-minutes',
      values['power-loss-after-minutes'],
      2,
      0,
    ),
    seed: parseIntFlag('seed', values.seed, 42, 0),
    mqttUrl: (values['mqtt-url'] as string | undefined) ?? defaultMqttUrl(env),
  };
}

/** Giữ tương thích Prompt 01: chỉ đọc --count (test cũ import hàm này từ index). */
export function parseCount(argv: string[]): number {
  const { values } = parseArgs({
    args: argv,
    options: { count: { type: 'string', default: '1' } },
    allowPositionals: true,
    strict: false,
  });
  const count = Number(values.count ?? '1');
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`--count phải là số nguyên >= 1, nhận được: "${values.count}"`);
  }
  return count;
}
