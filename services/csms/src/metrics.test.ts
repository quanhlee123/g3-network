// F-G2 — Test metric CSMS: trễ NF-02 đo đúng, thiếu timestamp thì KHÔNG bịa số.
import { describe, expect, it } from 'vitest';
import { CsmsMetrics } from './metrics';

const T0 = Date.parse('2026-08-19T10:00:00.000Z');

describe('CsmsMetrics', () => {
  it('đo trễ trạng thái trụ theo timestamp của trụ (NF-02)', async () => {
    const metrics = new CsmsMetrics(() => T0 + 4_000);
    metrics.observeStatusLag('2026-08-19T10:00:00.000Z'); // 4s

    const text = await metrics.registry.metrics();
    expect(text).toContain('g3_ocpp_status_lag_seconds_bucket{le="5"} 1');
    expect(text).toContain('g3_ocpp_status_lag_seconds_sum 4');
  });

  it('trụ KHÔNG gửi timestamp → đếm riêng, không đưa 0 vào histogram trễ', async () => {
    const metrics = new CsmsMetrics(() => T0);
    metrics.observeStatusLag(undefined);
    metrics.observeStatusLag('khong-phai-ngay-thang');

    const text = await metrics.registry.metrics();
    expect(text).toContain('g3_ocpp_status_thieu_timestamp_total 2');
    // Không có mẫu nào lọt vào histogram: bịa 0 sẽ làm NF-02 trông đẹp giả tạo.
    expect(text).toContain('g3_ocpp_status_lag_seconds_count 0');
  });

  it('đếm bản tin OCPP theo action và cả kết quả LỖI', async () => {
    const metrics = new CsmsMetrics(() => T0);
    metrics.countMessage('StatusNotification', 'ok');
    metrics.countMessage('BootNotification', 'ok');
    metrics.countMessage('KhongBietAction', 'loi');

    const text = await metrics.registry.metrics();
    expect(text).toContain('g3_ocpp_messages_total{action="StatusNotification",ket_qua="ok"} 1');
    expect(text).toContain('g3_ocpp_messages_total{action="KhongBietAction",ket_qua="loi"} 1');
    // NF-14: mốc "CSMS còn sống" nhích theo mọi bản tin, kể cả bản tin lỗi.
    expect(text).toContain(`g3_ocpp_last_message_timestamp_seconds ${T0 / 1000}`);
  });

  it('số trụ đang kết nối là gauge — lên rồi xuống được', async () => {
    const metrics = new CsmsMetrics(() => T0);
    metrics.setStationsConnected(10);
    metrics.setStationsConnected(9);
    expect(await metrics.registry.metrics()).toContain('g3_ocpp_stations_connected 9');
  });
});
