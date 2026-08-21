// NF-04 — Biến số liệu thô của một lượt load test thành báo cáo Markdown.
//
// Nguyên tắc viết báo cáo: KHÔNG làm đẹp số. Thiếu dữ liệu thì ghi "không đo được" chứ
// không điền 0; kết luận "đạt/vỡ" phải kèm cách đo và giới hạn của cách đo đó.
import {
  layHistogram,
  laySo,
  layTheoNhan,
  layTong,
  phanVi,
  phanViDay,
  trungBinh,
  type DongMetric,
} from './do-luong';
import type { KetQuaChay } from './chay';

export const NF01_NGUONG_S = 30;
export const NF01_MUC_TIEU_S = 10;
export const NF02_NGUONG_S = 30;

export interface ThongSo {
  soXe: number;
  soTram: number;
  soPhut: number;
  chuKyXeMs: number;
  chuKyMauGiay: number;
}

export interface TomTat {
  /** p95 lag đọc từ gauge cửa sổ 5 phút — chính xác từng mẫu, KHÔNG qua bucket. */
  lag_p95_gauge_max: number | null;
  lag_p95_gauge_cuoi: number | null;
  lag_p95_gauge_p95: number | null;
  /** p50/p95/p99 nội suy từ histogram — thô hơn, để đối chiếu. */
  lag_hist_p50: number | null;
  lag_hist_p95: number | null;
  lag_hist_p99: number | null;
  lag_trung_binh: number | null;
  ban_tin: Record<string, number>;
  ban_tin_moi_giay: number | null;
  canh_bao_tong: number;
  canh_bao_theo_nguon: Record<string, number>;
  alert_p95: number | null;
  alert_trung_binh: number | null;
  ocpp_p95: number | null;
  ocpp_trung_binh: number | null;
  ocpp_ban_tin: number;
  /** Tổng số mẫu đo được cho NF-02 tới cuối lượt chạy. */
  ocpp_so_mau: number;
  /**
   * Số mẫu NF-02 phát sinh trong NỬA SAU lượt chạy.
   *
   * Đây mới là con số quyết định có được kết luận NF-02 hay không, chứ không phải tổng số
   * mẫu. Lý do: `ocpp-sim` chạy ĐÚNG MỘT phiên sạc mỗi trụ rồi chỉ còn heartbeat, nên toàn
   * bộ StatusNotification dồn vào phút đầu — lúc hệ còn rảnh. Bằng 0 nghĩa là suốt nửa sau
   * (lúc 300 xe đã chạy hết công suất) KHÔNG có mẫu nào, nên p95 nói về lúc khởi động chứ
   * không nói về NF-02 dưới tải.
   *
   * Đo bằng cách so số đếm histogram ở mẫu cuối với mẫu gần giữa lượt chạy — không dùng
   * ngưỡng "bao nhiêu mẫu/phút" vì con số đó đặt bao nhiêu cũng là tuỳ tiện.
   */
  ocpp_so_mau_nua_sau: number;
  ocpp_thieu_timestamp: number;
  tru_ket_noi: number | null;
  lech_dong_ho: number;
  cach_ly_24h: number | null;
  canh_bao_mo: Record<string, number>;
  doi_soat: Record<string, number>;
  /** Số phiên đối soát trong 24h — CÙNG cửa sổ với lech_max_pct, xem apps/api metrics. */
  doi_soat_24h: number | null;
  lech_max_pct: number | null;
  api_scrape_loi: number | null;
  rss_ingest_max_mb: number | null;
  cpu_ingest_giay: number | null;
}

const cuoiCo = <T>(mau: (T | null)[]): T | null => {
  for (let i = mau.length - 1; i >= 0; i--) {
    const m = mau[i];
    if (m !== null && m !== undefined) return m;
  }
  return null;
};

export function tinhTomTat(kq: KetQuaChay): TomTat {
  const ingestCuoi = cuoiCo(kq.mau.map((m) => m.ingest));
  const csmsCuoi = cuoiCo(kq.mau.map((m) => m.csms));
  const apiCuoi = cuoiCo(kq.mau.map((m) => m.api));

  // Gauge p95 lấy theo TỪNG mẫu: đỉnh trong suốt lượt chạy mới là con số phải đối chiếu
  // với NF-01, chứ không phải giá trị lúc kết thúc (lúc đó tải đã lắng).
  const dayP95 = kq.mau
    .map((m) => (m.ingest ? laySo(m.ingest, 'g3_ingest_lag_p95_5m_seconds') : null))
    .filter((x): x is number => x !== null);

  const histLag = ingestCuoi ? layHistogram(ingestCuoi, 'g3_ingest_lag_seconds') : null;
  const histAlert = ingestCuoi ? layHistogram(ingestCuoi, 'g3_alert_latency_seconds') : null;
  const histOcpp = csmsCuoi ? layHistogram(csmsCuoi, 'g3_ocpp_status_lag_seconds') : null;

  const banTin = ingestCuoi ? layTheoNhan(ingestCuoi, 'g3_ingest_records_total', 'result') : {};
  const tongBanTin = Object.values(banTin).reduce((a, b) => a + b, 0);
  const giayChay = kq.mau.length > 0 ? kq.mau[kq.mau.length - 1]!.giay_tu_dau : 0;

  return {
    lag_p95_gauge_max: dayP95.length > 0 ? Math.max(...dayP95) : null,
    lag_p95_gauge_cuoi: dayP95.length > 0 ? dayP95[dayP95.length - 1]! : null,
    lag_p95_gauge_p95: phanViDay(dayP95, 0.95),
    lag_hist_p50: histLag ? phanVi(histLag, 0.5) : null,
    lag_hist_p95: histLag ? phanVi(histLag, 0.95) : null,
    lag_hist_p99: histLag ? phanVi(histLag, 0.99) : null,
    lag_trung_binh: histLag ? trungBinh(histLag) : null,
    ban_tin: banTin,
    ban_tin_moi_giay: giayChay > 0 ? tongBanTin / giayChay : null,
    canh_bao_tong: ingestCuoi ? layTong(ingestCuoi, 'g3_alerts_total') : 0,
    canh_bao_theo_nguon: ingestCuoi ? layTheoNhan(ingestCuoi, 'g3_alerts_total', 'nguon') : {},
    alert_p95: histAlert ? phanVi(histAlert, 0.95) : null,
    alert_trung_binh: histAlert ? trungBinh(histAlert) : null,
    ocpp_p95: histOcpp ? phanVi(histOcpp, 0.95) : null,
    ocpp_trung_binh: histOcpp ? trungBinh(histOcpp) : null,
    ocpp_ban_tin: csmsCuoi ? layTong(csmsCuoi, 'g3_ocpp_messages_total') : 0,
    ocpp_so_mau: histOcpp ? histOcpp.count : 0,
    ocpp_so_mau_nua_sau: demMauNuaSau(kq),
    ocpp_thieu_timestamp: csmsCuoi ? layTong(csmsCuoi, 'g3_ocpp_status_thieu_timestamp_total') : 0,
    tru_ket_noi: csmsCuoi ? laySo(csmsCuoi, 'g3_ocpp_stations_connected') : null,
    lech_dong_ho: ingestCuoi ? layTong(ingestCuoi, 'g3_ingest_lech_dong_ho_total') : 0,
    cach_ly_24h: apiCuoi ? laySo(apiCuoi, 'g3_telemetry_quarantine_24h') : null,
    canh_bao_mo: apiCuoi ? layTheoNhan(apiCuoi, 'g3_alerts_open', 'severity') : {},
    // Hai dòng dưới bị gitleaks bắt nhầm là "generic-api-key": tên metric dài, nhiều dấu
    // gạch dưới nên điểm entropy cao. Đây là TÊN METRIC Prometheus, xem
    // apps/api/src/routes/metrics.ts. Đánh dấu từng dòng chứ không cho cả file vào
    // allowlist — file này về sau vẫn phải bị quét bình thường.
    doi_soat: apiCuoi ? layTheoNhan(apiCuoi, 'g3_reconciliation_results', 'status') : {}, // gitleaks:allow
    lech_max_pct: apiCuoi ? laySo(apiCuoi, 'g3_reconciliation_lech_max_pct') : null, // gitleaks:allow
    doi_soat_24h: apiCuoi ? laySo(apiCuoi, 'g3_reconciliation_checked_24h') : null,
    api_scrape_loi: apiCuoi ? laySo(apiCuoi, 'g3_api_metrics_scrape_error') : null,
    rss_ingest_max_mb: dinh(
      kq.mau.map((m) => m.ingest),
      'process_resident_memory_bytes',
      1 / 2 ** 20,
    ),
    cpu_ingest_giay: ingestCuoi ? laySo(ingestCuoi, 'process_cpu_seconds_total') : null,
  };
}

/**
 * Số mẫu NF-02 phát sinh trong nửa sau lượt chạy = (đếm ở mẫu cuối) − (đếm ở mẫu giữa).
 * Counter Prometheus chỉ tăng, nên hiệu này luôn ≥ 0 trong một lượt chạy không restart.
 */
function demMauNuaSau(kq: KetQuaChay): number {
  const coCsms = kq.mau.filter((m) => m.csms !== null);
  if (coCsms.length < 2) return 0;
  const dem = (m: (typeof coCsms)[number]): number =>
    layHistogram(m.csms!, 'g3_ocpp_status_lag_seconds').count;
  const giua = coCsms[Math.floor(coCsms.length / 2)]!;
  const cuoi = coCsms[coCsms.length - 1]!;
  return Math.max(0, dem(cuoi) - dem(giua));
}

function dinh(mau: (DongMetric[] | null)[], ten: string, heSo = 1): number | null {
  const gia_tri = mau.map((m) => (m ? laySo(m, ten) : null)).filter((x): x is number => x !== null);
  return gia_tri.length === 0 ? null : Math.max(...gia_tri) * heSo;
}

const so = (x: number | null | undefined, chuSo = 2, donVi = ''): string =>
  x === null || x === undefined ? '_không đo được_' : `${x.toFixed(chuSo)}${donVi}`;

const nguyen = (x: number | null | undefined): string =>
  x === null || x === undefined ? '_không đo được_' : x.toLocaleString('vi-VN');

/** Kết luận đạt/vỡ kèm biểu tượng — dùng cho bảng nghiệm thu ngưỡng. */
function ketLuan(giaTri: number | null, nguong: number): string {
  if (giaTri === null) return '⚠️ KHÔNG ĐO ĐƯỢC';
  return giaTri <= nguong ? '✅ ĐẠT' : '❌ VỠ NGƯỠNG';
}

export function vietBaoCao(kq: KetQuaChay, ts: ThongSo, tt: TomTat): string {
  const vo01 = tt.lag_p95_gauge_max !== null && tt.lag_p95_gauge_max > NF01_NGUONG_S;
  const vo02 = tt.ocpp_p95 !== null && tt.ocpp_p95 > NF02_NGUONG_S;
  const phutChay = kq.mau.length > 0 ? kq.mau[kq.mau.length - 1]!.giay_tu_dau / 60 : 0;

  const dong: string[] = [];
  const d = (s = ''): void => void dong.push(s);

  d('# Load test 300 xe — kết quả đo (NF-04)');
  d();
  d('> Tài liệu này do `npm run loadtest` sinh ra. Chạy lại là ghi đè.');
  d('> Cách chạy lại nằm ở cuối file. Dữ liệu GIẢ 100% (quy tắc 12).');
  d();
  d(`- **Bắt đầu:** ${kq.bat_dau}`);
  d(`- **Kết thúc:** ${kq.ket_thuc}`);
  d(`- **Thời lượng thực đo:** ${phutChay.toFixed(1)} phút (đặt ${ts.soPhut} phút)`);
  d(`- **Tải:** ${ts.soXe} xe · ${ts.soTram} trụ sạc · xe gửi mỗi ${ts.chuKyXeMs / 1000}s`);
  d(`- **Chu kỳ lấy mẫu:** ${ts.chuKyMauGiay}s · ${kq.mau.length} mẫu`);
  d();

  d('## 1. Kết luận theo ngưỡng PRD');
  d();
  d('| Mã | Yêu cầu | Ngưỡng | Đo được | Kết luận |');
  d('|---|---|---|---|---|');
  d(
    `| NF-01 | Độ trễ telematics xe → hệ thống | ≤30s p95 (mục tiêu ≤10s) | ` +
      `${so(tt.lag_p95_gauge_max, 2, 's')} (đỉnh p95 cửa sổ 5 phút) | ${ketLuan(tt.lag_p95_gauge_max, NF01_NGUONG_S)} |`,
  );
  // NF-02 chỉ được kết luận khi mẫu còn tiếp tục về ở NỬA SAU lượt chạy — lúc hệ đã gánh
  // đủ tải. Không dùng ngưỡng "mẫu/phút" vì đặt bao nhiêu cũng là con số tuỳ tiện.
  const ocppDuMau = tt.ocpp_so_mau > 0 && tt.ocpp_so_mau_nua_sau > 0;
  d(
    `| NF-02 | Độ trễ trạng thái trụ (OCPP) | ≤30s | ${so(tt.ocpp_p95, 2, 's')} (p95 trên ` +
      `${nguyen(tt.ocpp_so_mau)} mẫu) | ${
        ocppDuMau ? ketLuan(tt.ocpp_p95, NF02_NGUONG_S) : '⚠️ KHÔNG ĐỦ MẪU — xem mục 3'
      } |`,
  );
  d(
    `| NF-04 | ${ts.soXe} xe đồng thời, không đổi kiến trúc | ${ts.soXe} xe | ` +
      `${nguyen(tt.ban_tin.valid ?? 0)} bản ghi hợp lệ, ${so(tt.ban_tin_moi_giay, 1)} bản tin/giây | ` +
      `${kq.tien_trinh_chet.length === 0 && !vo01 ? '✅ ĐẠT' : '⚠️ XEM MỤC 4'} |`,
  );
  // Gauge lệch trả 0 khi CHƯA đối soát phiên nào — 0% ở đây KHÔNG có nghĩa "khớp hoàn hảo".
  //
  // Số phiên phải đếm theo ĐÚNG cửa sổ 24h của gauge lệch. KHÔNG được thay bằng
  // g3_reconciliation_results (số đếm toàn thời gian): trộn hai cửa sổ là cách âm thầm nhất
  // để báo cáo tự khen — số phiên lấy của mấy tháng trước, còn lệch thì lấy của 24h vốn rỗng.
  //
  // Metric đếm 24h chỉ có từ Prompt 11. Số liệu thô của lượt chạy CŨ hơn không có nó, và khi
  // đó câu trả lời đúng là "không đo được", KHÔNG phải mượn tạm con số cửa sổ khác.
  const soPhienDoiSoat = tt.doi_soat_24h;
  const doDuocNf10 = soPhienDoiSoat !== null && soPhienDoiSoat > 0;
  d(
    `| NF-10 | Lệch đối soát 3 chiều | <1% | ${
      doDuocNf10
        ? `${so(tt.lech_max_pct, 3, '%')} trên ${nguyen(soPhienDoiSoat)} phiên/24h`
        : soPhienDoiSoat === 0
          ? '_24h qua chưa đối soát phiên nào_'
          : '_lượt chạy này chưa có metric đếm 24h_'
    } | ${doDuocNf10 ? ketLuan(tt.lech_max_pct, 1) : '⚠️ KHÔNG ĐO ĐƯỢC'} |`,
  );
  d(
    `| NF-14 | Dashboard + alert ingest gián đoạn | có | Prometheus + Grafana + 10 luật alert | ✅ ĐẠT |`,
  );
  d();
  d(
    '**Mục tiêu ≤10s của NF-01:** ' +
      (tt.lag_p95_gauge_max === null
        ? '_không đo được_'
        : tt.lag_p95_gauge_max <= NF01_MUC_TIEU_S
          ? `✅ đạt cả mục tiêu (${so(tt.lag_p95_gauge_max, 2, 's')} ≤ 10s)`
          : `chưa đạt mục tiêu (${so(tt.lag_p95_gauge_max, 2, 's')} > 10s) nhưng vẫn trong ngưỡng bắt buộc 30s`),
  );
  d();

  d('## 2. Độ trễ ingest (NF-01)');
  d();
  d('Hai cách đo song song, cố ý không gộp:');
  d();
  d('| Cách đo | Giá trị | Ghi chú |');
  d('|---|---|---|');
  d(
    `| p95 cửa sổ 5 phút — ĐỈNH | ${so(tt.lag_p95_gauge_max, 3, 's')} | Chính xác từng mẫu. **Đây là con số dùng để kết luận NF-01.** |`,
  );
  d(
    `| p95 cửa sổ 5 phút — p95 của các mẫu | ${so(tt.lag_p95_gauge_p95, 3, 's')} | Bỏ ảnh hưởng của 1–2 mẫu đỉnh cá biệt |`,
  );
  d(
    `| p95 cửa sổ 5 phút — lúc kết thúc | ${so(tt.lag_p95_gauge_cuoi, 3, 's')} | Trạng thái cuối lượt chạy |`,
  );
  d(`| Histogram p50 | ${so(tt.lag_hist_p50, 3, 's')} | Nội suy từ bucket |`);
  d(
    `| Histogram p95 | ${so(tt.lag_hist_p95, 3, 's')} | Nội suy từ bucket — **thô**, xem cảnh báo dưới |`,
  );
  d(`| Histogram p99 | ${so(tt.lag_hist_p99, 3, 's')} | Nội suy từ bucket |`);
  d(`| Trung bình (sum/count) | ${so(tt.lag_trung_binh, 3, 's')} | Không bị bucket làm nhòe |`);
  d();
  d(
    '> ⚠️ **Giới hạn của cột histogram:** bucket của `g3_ingest_lag_seconds` là ' +
      '`[1, 5, 10, 30, 60, 300, 3600]`. Nếu phân vị rơi vào khoảng 10→30 thì sai số nội suy ' +
      'có thể tới hàng chục giây. Vì vậy kết luận NF-01 ở mục 1 lấy theo gauge p95 ' +
      '(`g3_ingest_lag_p95_5m_seconds`, tính trên từng mẫu), không lấy theo histogram.',
  );
  d();

  d('## 3. Thông lượng, cảnh báo và trạm sạc');
  d();
  d('| Chỉ số | Giá trị |');
  d('|---|---|');
  d(`| Bản ghi ghi mới (valid) | ${nguyen(tt.ban_tin.valid ?? 0)} |`);
  d(`| Bản ghi trùng/gửi bù (duplicate) | ${nguyen(tt.ban_tin.duplicate ?? 0)} |`);
  d(`| Bản tin bị cách ly (quarantine) | ${nguyen(tt.ban_tin.quarantine ?? 0)} |`);
  d(`| Thông lượng trung bình | ${so(tt.ban_tin_moi_giay, 2)} bản tin/giây |`);
  d(`| Cảnh báo bắn ra trong lượt chạy | ${nguyen(tt.canh_bao_tong)} |`);
  for (const [nguon, n] of Object.entries(tt.canh_bao_theo_nguon)) {
    d(`| — nguồn \`${nguon}\` | ${nguyen(n)} |`);
  }
  d(`| Trễ cảnh báo — p95 | ${so(tt.alert_p95, 2, 's')} |`);
  d(`| Trễ cảnh báo — trung bình | ${so(tt.alert_trung_binh, 2, 's')} |`);
  d(`| Bản tin OCPP đã xử lý | ${nguyen(tt.ocpp_ban_tin)} |`);
  d(`| Trễ trạng thái trụ — p95 | ${so(tt.ocpp_p95, 2, 's')} |`);
  d(`| Trễ trạng thái trụ — trung bình | ${so(tt.ocpp_trung_binh, 2, 's')} |`);
  d(
    `| Số mẫu đo NF-02 | ${nguyen(tt.ocpp_so_mau)} tổng · **${nguyen(tt.ocpp_so_mau_nua_sau)} ở nửa sau lượt chạy** |`,
  );
  d(`| Trụ đang kết nối lúc kết thúc | ${nguyen(tt.tru_ket_noi)} / ${ts.soTram} |`);
  d(`| RAM ingest (đỉnh RSS) | ${so(tt.rss_ingest_max_mb, 0, ' MB')} |`);
  d(`| CPU ingest (tổng giây) | ${so(tt.cpu_ingest_giay, 1, 's')} |`);
  d();
  d(
    '> **Trễ cảnh báo đo ở đâu:** histogram `g3_alert_latency_seconds` của services/ingest, ' +
      'đo từ ts THIẾT BỊ của bản ghi kích hoạt tới lúc ghi xong dòng `alerts`. Không đo lại ' +
      'được từ database: cột `alerts.triggered_at` cố ý lưu GIỜ THIẾT BỊ (để bằng chứng ' +
      'bảo hành nói đúng thời điểm xe chạm ngưỡng), nên hiệu `triggered_at − payload.do_luc` ' +
      'luôn bằng 0 và **không** phải độ trễ.',
  );
  d();
  if (!ocppDuMau) {
    d('> ⚠️ **NF-02 chưa được đo dưới tải — đọc kỹ chỗ này trước khi tin con số p95 ở trên.**');
    d('>');
    d(
      `> \`simulators/ocpp-sim\` chạy **đúng một** phiên sạc mỗi trụ rồi chuyển sang chỉ gửi ` +
        `heartbeat (xem \`simulators/ocpp-sim/src/index.ts\`: \`runSession()\` gọi một lần, sau ` +
        `đó \`setInterval\` chỉ còn \`heartbeat()\`). Vì vậy toàn bộ ${nguyen(tt.ocpp_so_mau)} ` +
        `StatusNotification dồn vào khoảng một phút đầu: nửa sau của ${phutChay.toFixed(0)} ` +
        `phút chạy chỉ phát sinh thêm ${nguyen(tt.ocpp_so_mau_nua_sau)} mẫu.`,
    );
    d('>');
    d(
      '> Nghĩa là con số p95 ở trên nói về **lúc 10 trụ cùng khởi động**, KHÔNG nói về NF-02 ' +
        'khi hệ đang gánh 300 xe suốt 30 phút. Nó vẫn là số thật và vẫn có ích (chứng minh ' +
        'đường OCPP thông), nhưng **chưa đủ để nghiệm thu NF-02**.',
    );
    d('>');
    d(
      '> Muốn đo thật thì `ocpp-sim` phải lặp phiên liên tục — đây là việc **chưa làm**, ' +
        'đã ghi vào [debt-register.md](debt-register.md).',
    );
    d();
  }

  d('## 4. Lỗi và bất thường quan sát được');
  d();
  const loi: string[] = [];
  if (kq.tien_trinh_chet.length > 0) {
    for (const p of kq.tien_trinh_chet) {
      loi.push(
        `- ❌ Tiến trình \`${p.ten}\` CHẾT giữa chừng lúc ${p.luc} (mã thoát ${p.ma_thoat ?? '—'}, tín hiệu ${p.tin_hieu ?? '—'})`,
      );
    }
  }
  const tongHut = kq.scrape_hut.ingest + kq.scrape_hut.csms + kq.scrape_hut.api;
  if (tongHut > 0) {
    loi.push(
      `- ⚠️ Hụt ${tongHut}/${kq.mau.length * 3} lượt lấy mẫu /metrics ` +
        `(ingest ${kq.scrape_hut.ingest} · csms ${kq.scrape_hut.csms} · api ${kq.scrape_hut.api})`,
    );
  }
  if ((tt.ban_tin.quarantine ?? 0) > 0) {
    loi.push(`- ⚠️ ${nguyen(tt.ban_tin.quarantine)} bản tin bị cách ly, lý do:`);
    if (kq.ly_do_cach_ly.length === 0) {
      loi.push('  - _không đọc được bảng telemetry_quarantine để phân loại_');
    }
    for (const r of kq.ly_do_cach_ly.slice(0, 8)) {
      loi.push(`  - \`${r.ly_do.replace(/`/g, "'")}\` × ${nguyen(r.so)}`);
    }
    if (kq.ly_do_cach_ly.length > 8) {
      loi.push(
        `  - …và ${kq.ly_do_cach_ly.length - 8} lý do khác — xem bảng \`telemetry_quarantine\``,
      );
    }
  }
  if (tt.lech_dong_ho > 0) {
    loi.push(
      `- ❌ ${nguyen(tt.lech_dong_ho)} bản ghi có giờ thiết bị chạy TRƯỚC máy chủ (nghi lệch múi giờ — ADR-010)`,
    );
  }
  if (tt.ocpp_thieu_timestamp > 0) {
    loi.push(
      `- ⚠️ ${nguyen(tt.ocpp_thieu_timestamp)} StatusNotification không kèm timestamp → không đo được NF-02 cho các bản tin đó`,
    );
  }
  if (tt.api_scrape_loi === 1) {
    loi.push(
      '- ❌ apps/api không đọc được PostgreSQL ở lượt scrape cuối — số nghiệp vụ không đáng tin',
    );
  }
  if (kq.loi_stderr.length > 0) {
    const theoTen = new Map<string, number>();
    for (const l of kq.loi_stderr) theoTen.set(l.ten, (theoTen.get(l.ten) ?? 0) + 1);
    loi.push(
      `- ⚠️ ${kq.loi_stderr.length} dòng stderr nghi là lỗi: ` +
        [...theoTen.entries()].map(([t, n]) => `${t} (${n})`).join(', '),
    );
    for (const l of kq.loi_stderr.slice(0, 5)) {
      loi.push(`  - \`${l.ten}\`: ${l.dong.replace(/`/g, "'")}`);
    }
  }
  if (loi.length === 0) {
    d('Không có lỗi nào trong lượt chạy: không tiến trình nào chết, không hụt lấy mẫu,');
    d('không bản tin nào bị cách ly, không lệch đồng hồ.');
  } else {
    for (const l of loi) d(l);
  }
  d();

  d('## 5. Nếu vỡ ngưỡng — nguyên nhân nghi ngờ & đề xuất');
  d();
  if (!vo01 && !vo02) {
    d(
      ocppDuMau
        ? 'Không vỡ ngưỡng NF-01 hay NF-02 trong lượt chạy này, nên mục này không có đề xuất.'
        : 'NF-01 không vỡ ngưỡng, nên mục này không có đề xuất tối ưu. **NF-02 thì không phải ' +
            '"không vỡ" — nó CHƯA ĐO ĐƯỢC**, xem cảnh báo ở mục 3.',
    );
    d();
    d('**Cảnh báo về phạm vi kết luận** — lượt chạy này KHÔNG chứng minh được:');
    d();
    d(`- Hệ chịu được **1.200+ xe** (mốc 2029 của NF-04). Mới đo ở mốc ${ts.soXe} xe.`);
    d('- Hệ chịu được khi **mất sóng hàng loạt rồi gửi bù cùng lúc** (NF-09) — kịch bản này');
    d('  dồn dữ liệu 48 giờ của nhiều xe vào cùng một khoảnh khắc, khác hẳn tải đều.');
    d('- Hệ chịu được với **dữ liệu tích lũy nhiều tháng** trong `telematics_readings`.');
    d('  Database ở lượt chạy này gần như trống, nên chưa chạm giới hạn về index và I/O.');
    if (!doDuocNf10) {
      d('- **Đối soát 3 chiều (NF-10) chạy được dưới tải.** Không có phiên sạc mới nào phát');
      d('  sinh trong lượt chạy (cùng nguyên nhân với NF-02: `ocpp-sim` không lặp phiên), nên');
      d('  job đối soát không có gì để đối soát.');
    }
  } else {
    d('> ⚠️ Theo CLAUDE.md, phần dưới CHỈ nêu nguyên nhân và đề xuất — **chưa tối ưu gì**.');
    d('> Người duyệt chọn hạng mục và thứ tự thực hiện.');
    d();
    if (vo01) {
      d(`### NF-01 vỡ: p95 = ${so(tt.lag_p95_gauge_max, 2, 's')} > 30s`);
      d();
      d('Nguyên nhân nghi ngờ, xếp theo khả năng cao → thấp:');
      d();
      d('1. **Pipeline ingest xử lý tuần tự từng bản tin.** `IngestPipeline.handle` chạy');
      d('   `await` nối tiếp: ghi telemetry → cảnh báo pin → bất thường → geofence →');
      d('   cập nhật `devices`. Mỗi bản tin tốn nhiều lượt round-trip tới PostgreSQL.');
      d('   → Đề xuất: đo trước bằng `pg_stat_statements` xem truy vấn nào chiếm thời gian,');
      d('     rồi mới quyết định gộp truy vấn hay xử lý theo lô.');
      d('2. **Pool kết nối chỉ có 5** (`services/ingest/src/index.ts`, `max: 5`).');
      d('   → Đề xuất: thử nâng pool và đo lại. Đây là một dòng cấu hình, nhưng vẫn cần');
      d('     đo trước–sau vì nâng pool quá tay sẽ đẩy tranh chấp xuống PostgreSQL.');
      d('3. **Đánh giá cảnh báo chạy trên MỌI bản ghi.** F-A2/F-A4/F-A5 đều truy vấn DB.');
      d('   → Đề xuất: cân nhắc nhớ tạm ngưỡng/luật lâu hơn trong RAM (hiện đã có cache');
      d('     nhưng vẫn nạp lại trạng thái theo xe).');
      d('4. **Máy chạy test cũng đang chạy 300 tiến trình giả lập xe.** Simulator và hệ');
      d('   thống tranh CPU với nhau → số đo bi quan hơn thực tế.');
      d('   → Đề xuất: chạy lại với simulator ở máy khác trước khi kết luận kiến trúc.');
      d();
    }
    if (vo02) {
      d(`### NF-02 vỡ: p95 = ${so(tt.ocpp_p95, 2, 's')} > 30s`);
      d();
      d('1. **CSMS ghi `connectors` mỗi StatusNotification** — một UPDATE cho mỗi bản tin.');
      d('   → Đề xuất: kiểm tra index trên `(station_id, ocpp_connector_id)` trước.');
      d('2. **Trụ và xe dùng chung một PostgreSQL** — tải telemetry đè lên đường OCPP.');
      d('   → Đề xuất: đo riêng (chạy load test chỉ có trụ, không có xe) để tách nguyên nhân.');
      d();
    }
  }
  d();

  d('## 6. Cách chạy lại');
  d();
  d('```bash');
  d('docker compose -f infra/docker-compose.yml up -d');
  d('npm run db:migrate && npm run db:seed');
  d(`npm run loadtest -- --vehicles ${ts.soXe} --stations ${ts.soTram} --minutes ${ts.soPhut}`);
  d('```');
  d();
  d('Lệnh trên tự bật `services/ingest`, `services/csms`, `apps/api`, hai simulator, đo,');
  d('rồi tắt sạch và ghi đè chính file này. Log từng tiến trình nằm ở `load-test-logs/`.');
  d();
  d('Xem trực quan trong lúc chạy: Grafana <http://localhost:3001> → dashboard');
  d('"G3 Network — Sức khỏe hệ thống & đường dữ liệu".');
  d();

  return dong.join('\n');
}
