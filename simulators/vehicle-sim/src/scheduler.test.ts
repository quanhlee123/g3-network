// NF-09/F-J3/NF-04 — Test trọng yếu của đề bài:
// (c) mất sóng 2h → bù đủ, KHÔNG mất bản ghi, timestamp là GIỜ THIẾT BỊ chứ không phải giờ nhận;
// (e) mất nguồn đột ngột → destroy, không "goodbye";
// smoke 300 xe cho 1 tick (NF-04).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MockTelemetryPublisher,
  TELEMETRY_TOPIC_PREFIX,
  type TelemetryRecord,
  type TelemetryStatus,
  type TelemetryWill,
} from '@g3/contracts';
import { parseSimArgs, type SimConfig } from './cli';
import { FleetSimulator } from './scheduler';

function makeCfg(extra: Partial<SimConfig> = {}): SimConfig {
  return { ...parseSimArgs([], {}), ...extra };
}

function telemetryOf(
  pub: MockTelemetryPublisher,
): { record: TelemetryRecord; publishedAtMs: number }[] {
  return pub.published
    .filter((m) => m.topic.startsWith(TELEMETRY_TOPIC_PREFIX))
    .map((m) => ({
      record: JSON.parse(m.payload) as TelemetryRecord,
      publishedAtMs: m.publishedAtMs,
    }));
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

describe('kịch bản (c) — mất sóng 2 giờ rồi bù (NF-09 store-and-forward)', () => {
  it('không mất bản ghi nào; dữ liệu bù giữ timestamp thiết bị gốc; đúng thứ tự FIFO', async () => {
    // Mất sóng từ phút 1, kéo dài 120 phút; tick mỗi 10s.
    const cfg = makeCfg({
      count: 1,
      scenario: 'offline',
      offlineAfterMinutes: 1,
      offlineMinutes: 120,
    });
    let now = 0;
    const clock = () => now;
    const mock = new MockTelemetryPublisher(clock);
    const sim = new FleetSimulator(cfg, () => mock, clock);
    await sim.start();

    // Chạy 130 phút mô phỏng: 780 tick × 10s (trong vài ms thật nhờ bơm thời gian).
    const totalTicks = 780;
    for (let i = 1; i <= totalTicks; i++) {
      now = i * cfg.intervalMs;
      await sim.tick(now);
    }

    const telemetry = telemetryOf(mock);
    // KHÔNG mất bản ghi: mỗi tick đúng 1 bản ghi được gửi tới broker (sau khi bù).
    expect(telemetry).toHaveLength(totalTicks);
    expect(sim.stats.buffered).toBe(720); // 120 phút × 6 tick/phút đã phải đệm
    expect(sim.stats.flushed).toBe(720); // và được bù đủ 100%

    // Timestamp là GIỜ THIẾT BỊ lúc sinh: dãy ts phủ kín mọi tick, cách đều 10s, đúng thứ tự.
    const tsList = telemetry.map((t) => Date.parse(t.record.ts));
    for (let i = 0; i < totalTicks; i++) {
      expect(tsList[i]).toBe((i + 1) * cfg.intervalMs);
    }

    // Bản ghi bù: giờ thiết bị (ts) < giờ gửi thật (publishedAtMs) — chứng minh ts không bị ghi đè.
    const buLai = telemetry.filter((t) => t.publishedAtMs > Date.parse(t.record.ts));
    expect(buLai).toHaveLength(720);
    const lechLonNhatMs = Math.max(...buLai.map((t) => t.publishedAtMs - Date.parse(t.record.ts)));
    expect(lechLonNhatMs).toBeGreaterThanOrEqual(120 * 60_000 - cfg.intervalMs); // bản đầu tiên bị giữ ~2h
  });

  it('trong lúc mất sóng không publish gì lên broker (chỉ đệm)', async () => {
    const cfg = makeCfg({
      count: 1,
      scenario: 'offline',
      offlineAfterMinutes: 0,
      offlineMinutes: 120,
    });
    let now = 0;
    const mock = new MockTelemetryPublisher(() => now);
    const sim = new FleetSimulator(
      cfg,
      () => mock,
      () => now,
    );
    await sim.start();
    const statusMsgs = mock.published.length; // tin trạng thái online lúc boot

    for (let i = 1; i <= 30; i++) {
      now = i * cfg.intervalMs;
      await sim.tick(now);
    }
    expect(telemetryOf(mock)).toHaveLength(0);
    expect(mock.published.length).toBe(statusMsgs);
    expect(sim.stats.buffered).toBe(30);
  });
});

describe('kịch bản (e) — mất nguồn đột ngột (F-J3)', () => {
  it('cắt socket không "goodbye": destroy được gọi, KHÔNG disconnect, ngừng phát hẳn', async () => {
    const cfg = makeCfg({ count: 2, scenario: 'power-loss', powerLossAfterMinutes: 1 });
    let now = 0;
    const clock = () => now;
    const mocks = new Map<string, MockTelemetryPublisher>();
    const wills = new Map<string, TelemetryWill | undefined>();
    const sim = new FleetSimulator(
      cfg,
      (clientId, will) => {
        const m = new MockTelemetryPublisher(clock, will);
        mocks.set(clientId, m);
        wills.set(clientId, will);
        return m;
      },
      clock,
    );
    await sim.start();

    // Kịch bản power-loss dùng kết nối riêng từng xe, mỗi kết nối có LWT retained.
    expect(mocks.size).toBe(2);
    for (const will of wills.values()) {
      expect(will).toBeDefined();
      expect(will!.retain).toBe(true);
      const payload = JSON.parse(will!.payload) as TelemetryStatus;
      expect(payload.status).toBe('offline');
      expect(payload.reason).toBe('lwt');
    }

    // Trước mốc mất nguồn: phát bình thường.
    now = 30_000;
    await sim.tick(now);
    const truoc = [...mocks.values()].map((m) => telemetryOf(m).length);
    expect(truoc.every((n) => n === 1)).toBe(true);

    // Qua mốc 1 phút: mất nguồn — destroy, không goodbye, không disconnect.
    now = 70_000;
    await sim.tick(now);
    for (const m of mocks.values()) {
      expect(m.destroyed).toBe(true);
      expect(m.disconnectedGracefully).toBe(false);
    }
    expect(sim.stats.halted).toBe(2);

    // Các tick sau: im lặng tuyệt đối.
    for (let i = 8; i <= 20; i++) {
      now = i * cfg.intervalMs;
      await sim.tick(now);
    }
    for (const m of mocks.values()) {
      expect(telemetryOf(m)).toHaveLength(1);
    }

    // stop() không được "hồi sinh" publisher đã chết để gửi goodbye muộn.
    await sim.stop();
    for (const m of mocks.values()) {
      expect(m.disconnectedGracefully).toBe(false);
    }
  });
});

describe('tắt sạch (đối chứng của F-J3)', () => {
  it('stop() phát trạng thái offline graceful rồi disconnect — khác hẳn mất nguồn', async () => {
    const cfg = makeCfg({ count: 2 });
    const now = 0;
    const mock = new MockTelemetryPublisher(() => now);
    const sim = new FleetSimulator(
      cfg,
      () => mock,
      () => now,
    );
    await sim.start();
    await sim.stop();

    expect(mock.disconnectedGracefully).toBe(true);
    expect(mock.destroyed).toBe(false);
    const graceful = mock.published.filter((m) => m.payload.includes('"graceful"'));
    expect(graceful).toHaveLength(2);
  });
});

describe('quy mô 300 xe (NF-04)', () => {
  it('1 tick cho 300 xe hoàn thành nhanh (< 200ms) và sinh đủ 300 bản ghi', async () => {
    const cfg = makeCfg({ count: 300 });
    let now = 0;
    const mock = new MockTelemetryPublisher(() => now);
    const sim = new FleetSimulator(
      cfg,
      () => mock,
      () => now,
    );
    await sim.start();

    now = 10_000;
    const t0 = performance.now();
    await sim.tick(now);
    const tookMs = performance.now() - t0;

    expect(telemetryOf(mock)).toHaveLength(300);
    expect(tookMs).toBeLessThan(200);
  });
});
