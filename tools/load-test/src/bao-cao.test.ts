// NF-04 — Test phần DIỄN GIẢI của báo cáo load test.
//
// Vì sao đáng test: mấy con số thô thì test ở do-luong.test.ts rồi. File này khoá lại đúng
// những chỗ mà một báo cáo dễ **nói dối một cách chân thành** nhất — kết luận ĐẠT trong khi
// thật ra là chưa đo được. Ba cái bẫy: p95 lấy nhầm mẫu cuối thay vì đỉnh, kết luận NF-02
// trên vài mẫu của phút đầu, và kết luận NF-10 "lệch 0%" khi chưa đối soát phiên nào.
import { describe, expect, it } from 'vitest';
import { docMetrics } from './do-luong';
import { tinhTomTat, vietBaoCao, type ThongSo } from './bao-cao';
import type { KetQuaChay, MauDo } from './chay';

const TS: ThongSo = {
  soXe: 300,
  soTram: 10,
  soPhut: 30,
  chuKyXeMs: 10_000,
  chuKyMauGiay: 15,
};

/** Dựng một mẫu /metrics tối thiểu từ ba mẩu text Prometheus. */
function mau(giay: number, ingest: string, csms = '', api = ''): MauDo {
  return {
    luc: new Date(giay * 1000).toISOString(),
    giay_tu_dau: giay,
    ingest: docMetrics(ingest),
    csms: docMetrics(csms),
    api: docMetrics(api),
  };
}

function chay(mauDo: MauDo[]): KetQuaChay {
  return {
    khoi_dong: '2026-08-19T09:59:00.000Z',
    bat_dau: '2026-08-19T10:00:00.000Z',
    ket_thuc: '2026-08-19T10:30:00.000Z',
    mau: mauDo,
    scrape_hut: { ingest: 0, csms: 0, api: 0 },
    tien_trinh_chet: [],
    loi_stderr: [],
    ly_do_cach_ly: [],
  };
}

describe('tinhTomTat — p95 NF-01', () => {
  it('lấy ĐỈNH p95 của cả lượt chạy, không lấy mẫu cuối', () => {
    // Bẫy: mẫu cuối là 2s (tải đã lắng) nhưng giữa chừng vọt lên 41s — vỡ NF-01.
    const kq = chay([
      mau(15, 'g3_ingest_lag_p95_5m_seconds 3'),
      mau(30, 'g3_ingest_lag_p95_5m_seconds 41'),
      mau(45, 'g3_ingest_lag_p95_5m_seconds 2'),
    ]);

    const tt = tinhTomTat(kq);
    expect(tt.lag_p95_gauge_max).toBe(41);
    expect(tt.lag_p95_gauge_cuoi).toBe(2);
    expect(vietBaoCao(kq, TS, tt)).toContain('❌ VỠ NGƯỠNG');
  });

  it('p95 dưới ngưỡng nhưng trên mục tiêu 10s → ĐẠT, kèm câu nói rõ chưa đạt mục tiêu', () => {
    const kq = chay([mau(15, 'g3_ingest_lag_p95_5m_seconds 18')]);

    const bao_cao = vietBaoCao(kq, TS, tinhTomTat(kq));
    expect(bao_cao).toContain('✅ ĐẠT');
    expect(bao_cao).toContain('chưa đạt mục tiêu');
  });

  it('không có mẫu nào → KHÔNG ĐO ĐƯỢC, tuyệt đối không ra "0s đạt"', () => {
    const kq = chay([mau(15, '')]);
    const tt = tinhTomTat(kq);

    expect(tt.lag_p95_gauge_max).toBeNull();
    const bao_cao = vietBaoCao(kq, TS, tt);
    expect(bao_cao).toContain('⚠️ KHÔNG ĐO ĐƯỢC');
    expect(bao_cao).not.toContain('| ✅ ĐẠT |\n| NF-02');
  });
});

/**
 * Histogram OCPP giả với `n` mẫu, tất cả rơi vào bucket ngay trên `treGiay`.
 * Dùng ĐÚNG bộ bucket của `services/csms/src/metrics.ts` — nếu bịa bộ bucket khác thì
 * test sẽ xanh với một phép nội suy không tồn tại trong thực tế.
 */
const BUCKETS = [0.5, 1, 2, 5, 10, 30, 60, 300] as const;

function csmsVoi(n: number, treGiay = 0.4): string {
  const dong = BUCKETS.map(
    (le) => `g3_ocpp_status_lag_seconds_bucket{le="${le}"} ${le >= treGiay ? n : 0}`,
  );
  dong.push(`g3_ocpp_status_lag_seconds_bucket{le="+Inf"} ${n}`);
  dong.push(`g3_ocpp_status_lag_seconds_sum ${(n * treGiay).toFixed(1)}`);
  dong.push(`g3_ocpp_status_lag_seconds_count ${n}`);
  return dong.join('\n');
}

describe('tinhTomTat — NF-02 chỉ kết luận khi mẫu còn về ở NỬA SAU lượt chạy', () => {
  it('mẫu ĐỨNG YÊN từ giữa lượt chạy → KHÔNG ĐỦ MẪU, dù tổng số mẫu nghe không ít', () => {
    // Đây đúng hiện trạng: ocpp-sim chạy 1 phiên mỗi trụ rồi chỉ heartbeat. 30 mẫu nghe
    // ổn, nhưng tất cả nằm ở phút đầu — lúc hệ còn rảnh, chưa gánh 300 xe.
    const kq = chay([
      mau(600, 'g3_ingest_lag_p95_5m_seconds 1', csmsVoi(30)),
      mau(1200, 'g3_ingest_lag_p95_5m_seconds 1', csmsVoi(30)),
      mau(1800, 'g3_ingest_lag_p95_5m_seconds 1', csmsVoi(30)),
    ]);
    const tt = tinhTomTat(kq);

    expect(tt.ocpp_so_mau).toBe(30);
    expect(tt.ocpp_so_mau_nua_sau).toBe(0);
    const bao_cao = vietBaoCao(kq, TS, tt);
    expect(bao_cao).toContain('KHÔNG ĐỦ MẪU');
    expect(bao_cao).toContain('NF-02 chưa được đo dưới tải');
  });

  it('mẫu VẪN VỀ ở nửa sau → mới kết luận ĐẠT/VỠ theo ngưỡng 30s', () => {
    const kq = chay([
      mau(600, 'g3_ingest_lag_p95_5m_seconds 1', csmsVoi(30)),
      mau(1200, 'g3_ingest_lag_p95_5m_seconds 1', csmsVoi(60)),
      mau(1800, 'g3_ingest_lag_p95_5m_seconds 1', csmsVoi(90)),
    ]);
    const tt = tinhTomTat(kq);

    expect(tt.ocpp_so_mau_nua_sau).toBe(30);
    const bao_cao = vietBaoCao(kq, TS, tt);
    expect(bao_cao).not.toContain('KHÔNG ĐỦ MẪU');
    expect(bao_cao).toContain('✅ ĐẠT');
  });

  it('mẫu về đều nhưng TRỄ 45s → VỠ ngưỡng NF-02, không được bỏ qua', () => {
    const kq = chay([
      mau(600, 'g3_ingest_lag_p95_5m_seconds 1', csmsVoi(30, 45)),
      mau(1200, 'g3_ingest_lag_p95_5m_seconds 1', csmsVoi(60, 45)),
      mau(1800, 'g3_ingest_lag_p95_5m_seconds 1', csmsVoi(90, 45)),
    ]);

    expect(vietBaoCao(kq, TS, tinhTomTat(kq))).toMatch(/NF-02.*❌ VỠ NGƯỠNG/);
  });
});

describe('tinhTomTat — NF-10 không được tự khen khi chưa đối soát phiên nào', () => {
  it('chưa có phiên nào đối soát → KHÔNG ĐO ĐƯỢC, dù gauge lệch trả 0', () => {
    // Gauge g3_reconciliation_lech_max_pct trả 0 khi bảng rỗng. Đọc thô sẽ ra
    // "lệch 0% ✅ ĐẠT" — nghe như khớp hoàn hảo, thật ra là chưa đối soát gì.
    const kq = chay([
      mau(
        900,
        'g3_ingest_lag_p95_5m_seconds 1',
        '',
        ['g3_reconciliation_lech_max_pct 0', 'g3_reconciliation_checked_24h 0'].join('\n'),
      ),
    ]);

    const bao_cao = vietBaoCao(kq, TS, tinhTomTat(kq));
    expect(bao_cao).toContain('_24h qua chưa đối soát phiên nào_');
    expect(bao_cao).toMatch(/NF-10.*KHÔNG ĐO ĐƯỢC/);
  });

  it('có phiên đối soát và lệch 2,5% → VỠ ngưỡng NF-10', () => {
    const api = `
g3_reconciliation_results{status="khop"} 12
g3_reconciliation_results{status="lech"} 1
g3_reconciliation_checked_24h 13
g3_reconciliation_lech_max_pct 2.5
`;
    const kq = chay([mau(900, 'g3_ingest_lag_p95_5m_seconds 1', '', api)]);
    const tt = tinhTomTat(kq);

    expect(tt.lech_max_pct).toBe(2.5);
    expect(vietBaoCao(kq, TS, tt)).toMatch(/NF-10.*2\.500%.*❌ VỠ NGƯỠNG/);
  });
});

describe('vietBaoCao — mục lỗi', () => {
  it('tiến trình chết giữa chừng phải hiện ở mục 4 và kéo NF-04 khỏi trạng thái ĐẠT', () => {
    const kq = chay([mau(900, 'g3_ingest_lag_p95_5m_seconds 1')]);
    kq.tien_trinh_chet = [
      { ten: 'ingest', ma_thoat: 1, tin_hieu: null, luc: '2026-08-19T10:15:00.000Z' },
    ];

    const bao_cao = vietBaoCao(kq, TS, tinhTomTat(kq));
    expect(bao_cao).toContain('Tiến trình `ingest` CHẾT giữa chừng');
    expect(bao_cao).toContain('⚠️ XEM MỤC 4');
  });

  it('bản tin bị cách ly được liệt kê kèm LÝ DO, không chỉ đếm số', () => {
    const kq = chay([
      mau(900, 'g3_ingest_lag_p95_5m_seconds 1\ng3_ingest_records_total{result="quarantine"} 20'),
    ]);
    kq.ly_do_cach_ly = [{ ly_do: 'vin_khong_ton_tai: G3-SIM-0001', so: 20 }];

    expect(vietBaoCao(kq, TS, tinhTomTat(kq))).toContain('vin_khong_ton_tai: G3-SIM-0001');
  });

  it('lệch đồng hồ thiết bị phải nổi lên mục lỗi (ADR-010 — gắn cờ vi phạm oan)', () => {
    const kq = chay([mau(900, 'g3_ingest_lag_p95_5m_seconds 1\ng3_ingest_lech_dong_ho_total 7')]);

    expect(vietBaoCao(kq, TS, tinhTomTat(kq))).toContain('giờ thiết bị chạy TRƯỚC máy chủ');
  });

  it('lượt chạy sạch thì nói rõ là sạch, không để mục 4 trống lửng lơ', () => {
    const kq = chay([mau(900, 'g3_ingest_lag_p95_5m_seconds 1')]);

    expect(vietBaoCao(kq, TS, tinhTomTat(kq))).toContain('Không có lỗi nào trong lượt chạy');
  });
});
