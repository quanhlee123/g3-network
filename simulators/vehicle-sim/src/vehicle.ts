// F-A1/F-A2/F-A4/F-J3 — Máy trạng thái thuần cho 1 xe giả lập (không I/O, test không cần broker).
// Mỗi tick sinh 1 TelemetryRecord với ts = GIỜ THIẾT BỊ (nowMs bơm vào — NF-09).
import { TELEMETRY_SCHEMA_VERSION, type VehicleModel } from '@g3/shared';
import type { TelemetryRecord } from '@g3/contracts';
import type { SimConfig } from './cli';
import { positionAtKm, type Route } from './route';

const MODELS: readonly VehicleModel[] = ['EVT-262', 'EVT-400', 'EVT-825'];

/** Thông số giả lập theo model: dải điện áp pack + mức hao SOC trên mỗi km. */
const MODEL_SPECS: Record<VehicleModel, { vMin: number; vMax: number; socPerKm: number }> = {
  'EVT-262': { vMin: 320, vMax: 400, socPerKm: 0.35 },
  'EVT-400': { vMin: 480, vMax: 590, socPerKm: 0.22 },
  'EVT-825': { vMin: 540, vMax: 690, socPerKm: 0.12 },
};

export type VehiclePhase = 'running' | 'offline' | 'stopped' | 'dead';

export interface VehicleState {
  vin: string;
  model: VehicleModel;
  phase: VehiclePhase;
  socPct: number;
  odometerKm: number;
  routeKm: number;
  batteryTempC: number;
  startedAtMs: number;
  lastTickMs: number;
}

/** Hành động scheduler phải làm với kết quả tick (NF-09: buffer khi mất sóng; F-J3: halt = cắt nguồn). */
export type TickAction = 'publish' | 'buffer' | 'halt';

export interface TickResult {
  state: VehicleState;
  record: TelemetryRecord | null;
  action: TickAction;
}

/** Khởi tạo xe thứ i (0-based); các xe xuất phát lệch đều trên tuyến để phủ bản đồ. */
export function createVehicle(
  i: number,
  cfg: SimConfig,
  route: Route,
  startMs: number,
  rand: () => number,
): VehicleState {
  const vin = `${cfg.vinPrefix}-${String(i + 1).padStart(4, '0')}`;
  return {
    vin,
    model: MODELS[i % MODELS.length]!,
    phase: 'running',
    socPct: cfg.scenario === 'drain' ? 100 : 60 + rand() * 35,
    odometerKm: Math.round(rand() * 80_000),
    routeKm: (i * route.lengthKm) / Math.max(1, cfg.count),
    batteryTempC: 30,
    startedAtMs: startMs,
    lastTickMs: startMs,
  };
}

function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/**
 * Tiến 1 bước mô phỏng tới thời điểm nowMs (giờ thiết bị).
 * Trả về bản ghi telemetry + hành động: publish (bình thường), buffer (đang mất sóng — NF-09),
 * halt (mất nguồn đột ngột — F-J3, không sinh thêm bản ghi).
 */
export function tickVehicle(
  state: VehicleState,
  nowMs: number,
  cfg: SimConfig,
  route: Route,
  rand: () => number,
): TickResult {
  if (state.phase === 'dead') return { state, record: null, action: 'halt' };

  const elapsedMs = nowMs - state.startedAtMs;
  const dtHours = Math.max(0, nowMs - state.lastTickMs) / 3_600_000;
  const next: VehicleState = { ...state, lastTickMs: nowMs };

  // Kịch bản e — mất nguồn đột ngột: ngừng vĩnh viễn, KHÔNG có bản tin "goodbye" (F-J3).
  if (cfg.scenario === 'power-loss' && elapsedMs >= cfg.powerLossAfterMinutes * 60_000) {
    next.phase = 'dead';
    return { state: next, record: null, action: 'halt' };
  }

  // Kịch bản c — mất sóng: xe VẪN đo và sinh bản ghi, chỉ không gửi được (NF-09).
  const offlineStartMs = cfg.offlineAfterMinutes * 60_000;
  const isOffline =
    cfg.scenario === 'offline' &&
    elapsedMs >= offlineStartMs &&
    elapsedMs < offlineStartMs + cfg.offlineMinutes * 60_000;
  next.phase = isOffline ? 'offline' : 'running';

  // Kịch bản b — tụt pin tuyến tính 100% → 5% trong drainMinutes (cắt ngưỡng 30/20/10 — F-A2).
  if (cfg.scenario === 'drain') {
    next.socPct = Math.max(5, 100 - (95 * elapsedMs) / (cfg.drainMinutes * 60_000));
    if (next.socPct <= 5) next.phase = 'stopped';
  }

  // Kịch bản d — nhiệt độ pin leo bất thường lên 60°C (F-A4).
  const faultCodes: string[] = [];
  if (cfg.scenario === 'temp') {
    next.batteryTempC = Math.min(60, 32 + (28 * elapsedMs) / (cfg.tempRampMinutes * 60_000));
    if (next.batteryTempC >= 55) faultCodes.push('P0A80'); // lỗi pack pin (nhiệt cao)
  } else {
    next.batteryTempC = 28 + rand() * 7;
  }

  // Chuyển động dọc tuyến + hao pin theo km.
  const spec = MODEL_SPECS[state.model];
  const speedKmh = next.phase === 'stopped' ? 0 : 40 + rand() * 30;
  const deltaKm = speedKmh * dtHours;
  next.routeKm = state.routeKm + deltaKm;
  next.odometerKm = state.odometerKm + deltaKm;
  if (cfg.scenario !== 'drain') {
    next.socPct = Math.max(5, state.socPct - deltaKm * spec.socPerKm);
    if (next.socPct <= 5 && next.phase === 'running') next.phase = 'stopped';
  }

  const [lat, lng] = positionAtKm(route, next.routeKm);
  const voltage = spec.vMin + ((spec.vMax - spec.vMin) * next.socPct) / 100 + (rand() - 0.5) * 4;

  const record: TelemetryRecord = {
    schema_version: TELEMETRY_SCHEMA_VERSION,
    vin: state.vin,
    model: state.model,
    ts: new Date(nowMs).toISOString(), // GIỜ THIẾT BỊ — giữ nguyên khi bù dữ liệu sau mất sóng
    soc_pct: round(next.socPct, 2),
    battery_voltage_v: round(voltage, 1),
    battery_temp_c: round(next.batteryTempC, 1),
    speed_kmh: round(speedKmh, 1),
    odometer_km: round(next.odometerKm, 1),
    lat: round(lat, 6),
    lng: round(lng, 6),
    fault_codes: faultCodes,
  };

  return { state: next, record, action: isOffline ? 'buffer' : 'publish' };
}
