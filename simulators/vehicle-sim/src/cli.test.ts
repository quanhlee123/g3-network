// F-A1 — Test đọc flag CLI: kịch bản chính + các input xấu (DoD: ≥2 kịch bản xấu).
import { describe, expect, it } from 'vitest';
import { defaultMqttUrl, parseCount, parseSimArgs } from './cli';

describe('parseSimArgs', () => {
  it('mặc định đúng đề bài: 1 xe, normal, 10s, offline 120 phút, VIN G3-SIM', () => {
    const cfg = parseSimArgs([], {});
    expect(cfg).toMatchObject({
      count: 1,
      scenario: 'normal',
      vinPrefix: 'G3-SIM',
      intervalMs: 10_000,
      offlineMinutes: 120,
      drainMinutes: 30,
      seed: 42,
      mqttUrl: 'mqtt://localhost:1883',
    });
  });

  it('đọc đủ bộ flag như lệnh trong đề: --count 20 --scenario drain --vin-prefix TEST', () => {
    const cfg = parseSimArgs(
      [
        '--count',
        '20',
        '--scenario',
        'drain',
        '--vin-prefix',
        'TEST',
        '--drain-minutes',
        '15',
        '--interval-ms',
        '2000',
        '--seed',
        '7',
      ],
      {},
    );
    expect(cfg.count).toBe(20);
    expect(cfg.scenario).toBe('drain');
    expect(cfg.vinPrefix).toBe('TEST');
    expect(cfg.drainMinutes).toBe(15);
    expect(cfg.intervalMs).toBe(2_000);
    expect(cfg.seed).toBe(7);
  });

  it('ưu tiên env MQTT_URL, và flag --mqtt-url thắng env', () => {
    expect(defaultMqttUrl({ MQTT_URL: 'mqtt://emqx:1883' })).toBe('mqtt://emqx:1883');
    expect(parseSimArgs([], { MQTT_URL: 'mqtt://emqx:1883' }).mqttUrl).toBe('mqtt://emqx:1883');
    expect(
      parseSimArgs(['--mqtt-url', 'mqtt://khac:1883'], { MQTT_URL: 'mqtt://emqx:1883' }).mqttUrl,
    ).toBe('mqtt://khac:1883');
  });

  // Kịch bản xấu 1: --count không hợp lệ
  it('từ chối --count 0 và --count không phải số', () => {
    expect(() => parseSimArgs(['--count', '0'], {})).toThrow(/--count phải là số nguyên >= 1/);
    expect(() => parseSimArgs(['--count', 'abc'], {})).toThrow(/số nguyên/);
  });

  // Kịch bản xấu 2: scenario lạ
  it('từ chối --scenario không nằm trong danh sách', () => {
    expect(() => parseSimArgs(['--scenario', 'chay-lung-tung'], {})).toThrow(
      /--scenario không hợp lệ/,
    );
  });

  // Kịch bản xấu 3: thời lượng âm / không phải số
  it('từ chối --interval-ms và --offline-minutes không hợp lệ', () => {
    expect(() => parseSimArgs(['--interval-ms', '50'], {})).toThrow(
      /--interval-ms phải là số nguyên >= 100/,
    );
    expect(() => parseSimArgs(['--offline-minutes=-5'], {})).toThrow(
      /--offline-minutes phải là số nguyên >= 1/,
    );
  });

  // Kịch bản xấu 4: vin-prefix chứa ký tự phá topic MQTT
  it('từ chối --vin-prefix chứa ký tự đặc biệt của MQTT', () => {
    expect(() => parseSimArgs(['--vin-prefix', 'A/B'], {})).toThrow(/--vin-prefix không hợp lệ/);
    expect(() => parseSimArgs(['--vin-prefix', 'A#B'], {})).toThrow(/--vin-prefix không hợp lệ/);
  });
});

describe('parseCount (tương thích Prompt 01)', () => {
  it('mặc định 1', () => {
    expect(parseCount([])).toBe(1);
  });
  it('đọc --count 20 kể cả khi có flag khác', () => {
    expect(parseCount(['--count', '20', '--scenario', 'drain'])).toBe(20);
  });
  it('ném lỗi tiếng Việt khi không phải số nguyên dương', () => {
    expect(() => parseCount(['--count', 'x'])).toThrow(/số nguyên/);
  });
});
