// NF-04 — Test bộ đọc metric. Đây là chỗ dễ sai NHẤT của cả bài load test: sai ở đây
// thì báo cáo vẫn ra số đẹp mà con số đó không có nghĩa gì.
import { describe, expect, it } from 'vitest';
import {
  docMetrics,
  layHistogram,
  laySo,
  layTheoNhan,
  layTong,
  phanVi,
  phanViDay,
  trungBinh,
} from './do-luong';

const MAU = `
# HELP g3_ingest_lag_p95_5m_seconds p95 do tre
# TYPE g3_ingest_lag_p95_5m_seconds gauge
g3_ingest_lag_p95_5m_seconds 3.25
# TYPE g3_ingest_records_total counter
g3_ingest_records_total{result="valid"} 5400
g3_ingest_records_total{result="duplicate"} 12
g3_ingest_records_total{result="quarantine"} 3
# TYPE g3_ingest_lag_seconds histogram
g3_ingest_lag_seconds_bucket{le="1"} 100
g3_ingest_lag_seconds_bucket{le="5"} 900
g3_ingest_lag_seconds_bucket{le="10"} 990
g3_ingest_lag_seconds_bucket{le="30"} 1000
g3_ingest_lag_seconds_bucket{le="+Inf"} 1000
g3_ingest_lag_seconds_sum 3200
g3_ingest_lag_seconds_count 1000
`;

describe('docMetrics', () => {
  it('tách được gauge, counter có nhãn và bucket histogram', () => {
    const dong = docMetrics(MAU);

    expect(laySo(dong, 'g3_ingest_lag_p95_5m_seconds')).toBe(3.25);
    expect(layTheoNhan(dong, 'g3_ingest_records_total', 'result')).toEqual({
      valid: 5400,
      duplicate: 12,
      quarantine: 3,
    });
    expect(layTong(dong, 'g3_ingest_records_total')).toBe(5415);
  });

  it('bỏ qua dòng chú thích, dòng trống và giá trị NaN', () => {
    const dong = docMetrics('# HELP x y\n\n  \nx_metric NaN\nx_that 7\n');

    expect(dong).toHaveLength(1);
    expect(dong[0]!.ten).toBe('x_that');
  });

  it('metric chưa xuất hiện trả null, KHÔNG trả 0', () => {
    // Phân biệt này quan trọng: 0 nghĩa là "đo được và bằng 0", null nghĩa là
    // "không đo được" — báo cáo phải nói hai điều khác nhau.
    expect(laySo(docMetrics(MAU), 'g3_khong_ton_tai')).toBeNull();
  });

  it('nhãn chứa dấu phẩy vẫn tách đúng', () => {
    const dong = docMetrics('m{a="x,y",b="z"} 4');

    expect(dong[0]!.nhan).toEqual({ a: 'x,y', b: 'z' });
  });
});

describe('phanVi (histogram)', () => {
  it('nội suy tuyến tính trong bucket như histogram_quantile của Prometheus', () => {
    const h = layHistogram(docMetrics(MAU), 'g3_ingest_lag_seconds');

    // p50 = mẫu thứ 500, nằm trong bucket (1, 5]: 1 + (500-100)/(900-100) * (5-1) = 3
    expect(phanVi(h, 0.5)).toBeCloseTo(3, 6);
    // p95 = mẫu thứ 950, nằm trong bucket (5, 10]: 5 + (950-900)/(990-900) * 5 ≈ 7.78
    expect(phanVi(h, 0.95)).toBeCloseTo(7.7778, 3);
  });

  it('không nội suy ra vô cực khi phân vị rơi vào bucket +Inf', () => {
    const h = layHistogram(
      docMetrics('h_bucket{le="1"} 1\nh_bucket{le="+Inf"} 10\nh_sum 500\nh_count 10\n'),
      'h',
    );

    expect(phanVi(h, 0.99)).toBe(1); // cận trên hữu hạn cuối cùng, không phải Infinity
  });

  it('histogram rỗng trả null chứ không phải 0', () => {
    expect(phanVi({ buckets: [], sum: 0, count: 0 }, 0.95)).toBeNull();
    expect(trungBinh({ buckets: [], sum: 0, count: 0 })).toBeNull();
  });

  it('trung bình = sum/count — cách đo KHÔNG bị bucket làm nhòe', () => {
    const h = layHistogram(docMetrics(MAU), 'g3_ingest_lag_seconds');

    expect(trungBinh(h)).toBe(3.2);
  });

  it('cộng gộp bucket của nhiều chuỗi nhãn khác nhau', () => {
    const h = layHistogram(
      docMetrics(
        'h_bucket{svc="a",le="1"} 2\nh_bucket{svc="b",le="1"} 3\n' +
          'h_bucket{svc="a",le="+Inf"} 5\nh_bucket{svc="b",le="+Inf"} 5\n' +
          'h_count{svc="a"} 5\nh_count{svc="b"} 5\n',
      ),
      'h',
    );

    expect(h.buckets[0]).toEqual({ le: 1, count: 5 });
    expect(h.count).toBe(10);
  });
});

describe('phanViDay (mẫu đo trực tiếp)', () => {
  it('p95 của 100 mẫu 1..100 là 95', () => {
    const day = Array.from({ length: 100 }, (_, i) => i + 1);

    expect(phanViDay(day, 0.95)).toBe(95);
    expect(phanViDay(day, 0.5)).toBe(50);
  });

  it('dãy rỗng trả null', () => {
    expect(phanViDay([], 0.95)).toBeNull();
  });

  it('không sắp xếp theo thứ tự chuỗi — 9 phải lớn hơn 10', () => {
    // Bẫy kinh điển của .sort() mặc định trong JS: [10, 9].sort() cho [10, 9].
    expect(phanViDay([10, 9, 100, 2], 1)).toBe(100);
  });
});
