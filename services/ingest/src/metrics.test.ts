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
});
