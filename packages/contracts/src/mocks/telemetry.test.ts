// F-A1 — Test contract telemetry + mock publisher.
import { describe, expect, it } from 'vitest';
import { statusTopic, telemetryTopic } from '../telemetry';
import { MockTelemetryPublisher } from './telemetry';

describe('telemetryTopic / statusTopic', () => {
  it('ghép đúng topic theo VIN', () => {
    expect(telemetryTopic('G3-SIM-0001')).toBe('g3/telemetry/G3-SIM-0001');
    expect(statusTopic('G3-SIM-0001')).toBe('g3/status/G3-SIM-0001');
  });

  it('từ chối VIN rỗng hoặc chứa ký tự MQTT đặc biệt', () => {
    for (const vin of ['', 'a/b', 'a+b', 'a#b', 'a b']) {
      expect(() => telemetryTopic(vin)).toThrow(/VIN không hợp lệ/);
    }
  });
});

describe('MockTelemetryPublisher', () => {
  it('ghi lại bản tin kèm giờ publish từ clock được bơm vào', async () => {
    let now = 1_000;
    const pub = new MockTelemetryPublisher(() => now);
    await pub.connect();
    await pub.publish('g3/telemetry/G3-SIM-0001', '{"soc_pct":80}');
    now = 2_000;
    await pub.publish('g3/status/G3-SIM-0001', '{"status":"online"}', { retain: true });

    expect(pub.published).toHaveLength(2);
    expect(pub.published[0]).toMatchObject({
      topic: 'g3/telemetry/G3-SIM-0001',
      publishedAtMs: 1_000,
      retain: false,
    });
    expect(pub.published[1]).toMatchObject({ publishedAtMs: 2_000, retain: true });
  });

  it('không cho publish khi chưa kết nối', async () => {
    const pub = new MockTelemetryPublisher();
    await expect(pub.publish('g3/telemetry/x', '{}')).rejects.toThrow(/chưa kết nối/i);
  });

  it('phân biệt disconnect (sạch) với destroy (mất nguồn đột ngột — F-J3)', async () => {
    const sach = new MockTelemetryPublisher();
    await sach.connect();
    await sach.disconnect();
    expect(sach.disconnectedGracefully).toBe(true);
    expect(sach.destroyed).toBe(false);

    const matNguon = new MockTelemetryPublisher();
    await matNguon.connect();
    matNguon.destroy();
    expect(matNguon.destroyed).toBe(true);
    expect(matNguon.disconnectedGracefully).toBe(false);
    expect(matNguon.connected).toBe(false);
  });
});
