import { describe, expect, it } from 'vitest';
import { resolveMqttUrl } from './index';

describe('@g3/ingest — khung khởi tạo', () => {
  it('đọc MQTT_URL từ biến môi trường', () => {
    expect(resolveMqttUrl({ MQTT_URL: 'mqtt://broker:1883' })).toBe('mqtt://broker:1883');
  });

  it('kịch bản xấu: thiếu biến môi trường → dùng broker local mặc định', () => {
    expect(resolveMqttUrl({})).toBe('mqtt://localhost:1883');
  });
});
