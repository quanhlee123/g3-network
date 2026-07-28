// F-G1 — Test MockTelematicsSource: mock phải hoạt động được (quy tắc 2).
import { describe, expect, it } from 'vitest';
import type { TelematicsEnvelope } from '../telematics-source';
import { MockTelematicsSource } from './telematics-source';

describe('MockTelematicsSource', () => {
  it('giao bản tin cho handler đăng ký trước khi connect, kèm giờ nhận từ clock', async () => {
    const source = new MockTelematicsSource(() => 1_700_000_000_000);
    const received: TelematicsEnvelope[] = [];
    source.subscribe((msg) => {
      received.push(msg);
    });

    await source.connect();
    expect(source.connected).toBe(true);
    await source.emit('g3/telemetry/G3-SIM-VIN-0001', '{"soc_pct":50}');

    expect(received).toEqual([
      {
        topic: 'g3/telemetry/G3-SIM-VIN-0001',
        payload: '{"soc_pct":50}',
        receivedAtMs: 1_700_000_000_000,
      },
    ]);
  });

  it('chờ handler async xử lý xong mới trả về (ingest ghi DB tuần tự được)', async () => {
    const source = new MockTelematicsSource();
    const order: string[] = [];
    source.subscribe(async () => {
      await Promise.resolve();
      order.push('handler-xong');
    });
    await source.connect();
    await source.emit('g3/status/G3-SIM-VIN-0001', '{}');
    order.push('emit-xong');
    expect(order).toEqual(['handler-xong', 'emit-xong']);
  });

  it('từ chối emit khi chưa connect — bắt lỗi wiring sớm', async () => {
    const source = new MockTelematicsSource();
    await expect(source.emit('g3/telemetry/x', '{}')).rejects.toThrow(/chưa kết nối/i);
    await source.connect();
    await source.disconnect();
    expect(source.connected).toBe(false);
  });
});
