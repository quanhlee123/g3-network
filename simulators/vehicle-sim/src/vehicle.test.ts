// F-A1/F-A2/F-A4 — Test máy trạng thái xe: drain cắt ngưỡng cảnh báo, temp lên 60°C, ts là giờ thiết bị.
import { TELEMETRY_SCHEMA_VERSION } from '@g3/shared';
import { describe, expect, it } from 'vitest';
import type { TelemetryRecord } from '@g3/contracts';
import { parseSimArgs, type SimConfig } from './cli';
import { buildRoute } from './route';
import { mulberry32 } from './rng';
import { createVehicle, tickVehicle, type VehicleState } from './vehicle';

const route = buildRoute();

function makeCfg(extra: Partial<SimConfig> = {}): SimConfig {
  return { ...parseSimArgs([], {}), ...extra };
}

/** Chạy mô phỏng 1 xe qua nhiều tick với thời gian giả, trả về mọi bản ghi sinh ra. */
function run(cfg: SimConfig, ticks: number, intervalMs: number): TelemetryRecord[] {
  const rand = mulberry32(cfg.seed);
  let state: VehicleState = createVehicle(0, cfg, route, 0, rand);
  const records: TelemetryRecord[] = [];
  for (let i = 1; i <= ticks; i++) {
    const result = tickVehicle(state, i * intervalMs, cfg, route, rand);
    state = result.state;
    if (result.record) records.push(result.record);
  }
  return records;
}

describe('kịch bản drain (F-A2 — cảnh báo pin phân cấp)', () => {
  it('SOC tụt tuyến tính 100% → 5% trong X phút, không tăng ngược, cắt đủ ngưỡng 30/20/10', () => {
    const cfg = makeCfg({ scenario: 'drain', drainMinutes: 30 });
    const records = run(cfg, 180, 10_000); // 30 phút, tick 10s

    expect(records[0]!.soc_pct).toBeGreaterThan(94);
    expect(records[records.length - 1]!.soc_pct).toBe(5);
    for (let i = 1; i < records.length; i++) {
      expect(records[i]!.soc_pct).toBeLessThanOrEqual(records[i - 1]!.soc_pct);
    }
    // Mỗi ngưỡng cảnh báo phải có bản ghi rơi vào dải ngay dưới ngưỡng (tick 10s ⇒ bước ~0.53%)
    for (const nguong of [30, 20, 10]) {
      expect(records.some((r) => r.soc_pct <= nguong && r.soc_pct > nguong - 2)).toBe(true);
    }
  });

  it('tụt tới 5% thì xe dừng bánh (speed = 0) nhưng vẫn phát telemetry', () => {
    const cfg = makeCfg({ scenario: 'drain', drainMinutes: 5 });
    const records = run(cfg, 60, 10_000); // 10 phút — nửa sau đã cạn pin
    const cuoi = records[records.length - 1]!;
    expect(cuoi.soc_pct).toBe(5);
    expect(cuoi.speed_kmh).toBe(0);
  });
});

describe('kịch bản temp (F-A4 — bất thường nhiệt độ pin)', () => {
  it('nhiệt độ leo dần lên đúng 60°C rồi giữ, gắn mã lỗi P0A80 từ 55°C', () => {
    const cfg = makeCfg({ scenario: 'temp', tempRampMinutes: 10 });
    const records = run(cfg, 90, 10_000); // 15 phút

    for (let i = 1; i < records.length; i++) {
      expect(records[i]!.battery_temp_c).toBeGreaterThanOrEqual(records[i - 1]!.battery_temp_c);
    }
    const cuoi = records[records.length - 1]!;
    expect(cuoi.battery_temp_c).toBe(60);
    expect(cuoi.fault_codes).toContain('P0A80');
    // Dưới 55°C chưa có mã lỗi
    expect(
      records.filter((r) => r.battery_temp_c < 55).every((r) => r.fault_codes.length === 0),
    ).toBe(true);
  });
});

describe('bản ghi telemetry (F-A1, NF-16)', () => {
  it('có schema_version đúng và ts là GIỜ THIẾT BỊ của tick (không phải giờ thật)', () => {
    const cfg = makeCfg();
    const rand = mulberry32(cfg.seed);
    const state = createVehicle(0, cfg, route, 0, rand);
    const nowMs = 123_456_000;
    const { record } = tickVehicle(state, nowMs, cfg, route, rand);

    expect(record).not.toBeNull();
    expect(record!.schema_version).toBe(TELEMETRY_SCHEMA_VERSION);
    expect(record!.ts).toBe(new Date(nowMs).toISOString());
    expect(record!.vin).toBe('G3-SIM-0001');
    expect(record!.fault_codes).toEqual([]);
  });

  it('odometer tăng đơn điệu và GPS luôn trên tuyến VN', () => {
    const records = run(makeCfg(), 60, 10_000);
    for (let i = 1; i < records.length; i++) {
      expect(records[i]!.odometer_km).toBeGreaterThanOrEqual(records[i - 1]!.odometer_km);
      expect(records[i]!.lat).toBeGreaterThan(20.5);
      expect(records[i]!.lng).toBeGreaterThan(105.5);
    }
  });
});
