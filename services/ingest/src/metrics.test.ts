// F-G1 — Test LagWindow p95 (NF-01) và counter kết quả ingest.
import { describe, expect, it } from 'vitest';
import { IngestMetrics, LagWindow } from './metrics';

describe('LagWindow', () => {
  it('p95 đúng trên cửa sổ và loại mẫu quá 5 phút', () => {
    let now = 0;
    const window = new LagWindow(5 * 60_000, () => now);
    expect(window.p95()).toBeNull();

    for (let i = 1; i <= 100; i++) {
      now = i * 1000;
      window.add(i); // lag 1..100s
    }
    expect(window.p95()).toBe(95);

    // 6 phút sau chỉ thêm 1 mẫu nhỏ → mẫu cũ bị loại hết
    now += 6 * 60_000;
    window.add(2);
    expect(window.p95()).toBe(2);
  });
});

describe('IngestMetrics', () => {
  it('expose histogram lag + counter theo result trên registry Prometheus', async () => {
    const metrics = new IngestMetrics(() => 0);
    metrics.observeLag(5);
    metrics.count('valid');
    metrics.count('quarantine');
    metrics.count('quarantine');

    const text = await metrics.registry.metrics();
    expect(text).toContain('g3_ingest_lag_seconds_bucket{le="10"} 1');
    expect(text).toContain('g3_ingest_records_total{result="valid"} 1');
    expect(text).toContain('g3_ingest_records_total{result="quarantine"} 2');
  });

  it('lag âm (đồng hồ thiết bị chạy nhanh) bị kẹp về 0 — không làm hỏng histogram', () => {
    const metrics = new IngestMetrics(() => 0);
    metrics.observeLag(-12);
    expect(metrics.lagWindow.p95()).toBe(0);
  });

  // --- NF-14 (Prompt 11) ----------------------------------------------------------

  it('gauge p95 cửa sổ 5 phút bám theo mẫu — đây là số dùng để kết luận NF-01', async () => {
    let now = 0;
    const metrics = new IngestMetrics(() => now);
    for (let i = 1; i <= 100; i++) {
      now = i * 1000;
      metrics.observeLag(i);
    }

    // Bucket của histogram quá thưa để suy ra p95 chính xác; gauge này thì chính xác.
    expect(await metrics.registry.metrics()).toContain('g3_ingest_lag_p95_5m_seconds 95');
  });

  it('mốc "bản tin cuối" là gauge unix time — cơ sở của luật báo ingest gián đoạn', async () => {
    const metrics = new IngestMetrics(() => 0);
    metrics.markBanTin(1_755_000_000_000);

    // Prometheus không phân biệt được counter ĐỨNG YÊN với counter KHÔNG TỒN TẠI, nên luật
    // "ingest đứt" phải dựa trên time() - gauge này, không dựa trên rate().
    expect(await metrics.registry.metrics()).toContain(
      'g3_ingest_last_message_timestamp_seconds 1755000000',
    );
  });

  it('đếm cảnh báo theo nguồn và đo trễ từ ts THIẾT BỊ', async () => {
    const T0 = 1_755_000_000_000;
    const metrics = new IngestMetrics(() => T0 + 4_000);
    metrics.observeAlert('pin', 2, T0); // 2 cảnh báo, mỗi cái trễ 4s
    metrics.observeAlert('geofence', 1, T0);

    const text = await metrics.registry.metrics();
    expect(text).toContain('g3_alerts_total{nguon="pin"} 2');
    expect(text).toContain('g3_alerts_total{nguon="geofence"} 1');
    expect(text).toContain('g3_alert_latency_seconds_count 3');
    expect(text).toContain('g3_alert_latency_seconds_sum 12'); // 3 cái × 4s
  });

  it('KHÔNG bắn cảnh báo nào thì không ghi gì — đường chạy thường xuyên nhất', async () => {
    const metrics = new IngestMetrics(() => 0);
    metrics.observeAlert('pin', 0, 12345);

    // Ghi 0 vào histogram sẽ kéo p95 trễ cảnh báo xuống giả tạo ở mọi bản ghi bình thường.
    expect(await metrics.registry.metrics()).toContain('g3_alert_latency_seconds_count 0');
  });

  it('cảnh báo không xác định được ts thiết bị: vẫn ĐẾM, nhưng không bịa số vào histogram', async () => {
    const metrics = new IngestMetrics(() => 0);
    metrics.observeAlert('bat_thuong', 1, null);
    metrics.observeAlert('bat_thuong', 1, Number.NaN);

    const text = await metrics.registry.metrics();
    expect(text).toContain('g3_alerts_total{nguon="bat_thuong"} 2');
    expect(text).toContain('g3_alert_latency_seconds_count 0');
  });
});
