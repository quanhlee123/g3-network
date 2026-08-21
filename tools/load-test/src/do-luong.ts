// NF-04 — Đọc và diễn giải text Prometheus. Tách riêng khỏi phần chạy tải để test được
// bằng chuỗi cố định, không cần dựng cả hệ thống.
//
// Vì sao tự viết parser thay vì gọi thư viện: /metrics là text theo dòng, phần load test
// cần đúng 3 thứ (gauge, counter có nhãn, histogram bucket). Kéo cả prom-client client-side
// vào đây tốn hơn phần việc nó làm.

/** Một dòng metric đã tách nhãn. */
export interface DongMetric {
  ten: string;
  nhan: Record<string, string>;
  gia_tri: number;
}

/** Tách text Prometheus thành danh sách dòng (bỏ # HELP/# TYPE và dòng trống). */
export function docMetrics(text: string): DongMetric[] {
  const ket_qua: DongMetric[] = [];
  for (const dong of text.split('\n')) {
    const s = dong.trim();
    if (s === '' || s.startsWith('#')) continue;
    const m = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{(.*)\})?\s+(.+)$/.exec(s);
    if (!m) continue;
    const gia_tri = Number(m[4]);
    if (!Number.isFinite(gia_tri)) continue; // bỏ NaN/+Inf — không đưa rác vào thống kê
    ket_qua.push({ ten: m[1]!, nhan: docNhan(m[3] ?? ''), gia_tri });
  }
  return ket_qua;
}

function docNhan(raw: string): Record<string, string> {
  const nhan: Record<string, string> = {};
  // Nhãn Prometheus: key="value" ngăn bằng dấu phẩy; giá trị có thể chứa dấu phẩy nên
  // phải bắt theo cặp ngoặc kép chứ không split(',').
  for (const m of raw.matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g)) {
    nhan[m[1]!] = m[2]!.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
  }
  return nhan;
}

/** Giá trị gauge/counter không nhãn; null nếu metric chưa xuất hiện. */
export function laySo(dong: DongMetric[], ten: string): number | null {
  const d = dong.find((x) => x.ten === ten);
  return d ? d.gia_tri : null;
}

/** Tổng mọi chuỗi thời gian của một metric (cộng hết các nhãn). */
export function layTong(dong: DongMetric[], ten: string): number {
  return dong.filter((x) => x.ten === ten).reduce((t, x) => t + x.gia_tri, 0);
}

/** Counter tách theo MỘT nhãn, vd g3_ingest_records_total theo `result`. */
export function layTheoNhan(dong: DongMetric[], ten: string, nhan: string): Record<string, number> {
  const ket_qua: Record<string, number> = {};
  for (const d of dong.filter((x) => x.ten === ten)) {
    const key = d.nhan[nhan] ?? '(khong_nhan)';
    ket_qua[key] = (ket_qua[key] ?? 0) + d.gia_tri;
  }
  return ket_qua;
}

export interface Histogram {
  /** Cận trên → số mẫu tích lũy (đã cộng dồn theo đúng nghĩa Prometheus). */
  buckets: { le: number; count: number }[];
  sum: number;
  count: number;
}

/** Gom `<ten>_bucket` + `_sum` + `_count` thành 1 histogram (cộng mọi nhãn khác). */
export function layHistogram(dong: DongMetric[], ten: string): Histogram {
  const gop = new Map<number, number>();
  for (const d of dong.filter((x) => x.ten === `${ten}_bucket`)) {
    const le = d.nhan.le === '+Inf' ? Number.POSITIVE_INFINITY : Number(d.nhan.le);
    if (Number.isNaN(le)) continue;
    gop.set(le, (gop.get(le) ?? 0) + d.gia_tri);
  }
  return {
    buckets: [...gop.entries()].map(([le, count]) => ({ le, count })).sort((a, b) => a.le - b.le),
    sum: layTong(dong, `${ten}_sum`),
    count: layTong(dong, `${ten}_count`),
  };
}

/**
 * Nội suy phân vị từ histogram, đúng cách histogram_quantile() của Prometheus làm.
 *
 * ĐỌC KỸ TRƯỚC KHI TIN CON SỐ NÀY: độ chính xác bị giới hạn bởi bề rộng bucket. Bucket
 * của g3_ingest_lag_seconds là [1,5,10,30,60,300,3600] — nếu p95 rơi vào bucket 10→30 thì
 * sai số có thể tới 20 giây. Với NF-01 (ngưỡng 30s) điều đó CÓ NGHĨA: kết luận "đạt" hay
 * "vỡ" không được dựa duy nhất vào con số này. Báo cáo load test đối chiếu thêm gauge
 * g3_ingest_lag_p95_5m_seconds (p95 thật, tính trên từng mẫu) chính vì lý do đó.
 */
export function phanVi(h: Histogram, q: number): number | null {
  if (h.count === 0 || h.buckets.length === 0) return null;
  const dich = q * h.count;
  let truoc_le = 0;
  let truoc_count = 0;
  for (const b of h.buckets) {
    if (b.count >= dich) {
      if (b.le === Number.POSITIVE_INFINITY) return truoc_le; // không nội suy ra vô cực
      const trong_bucket = b.count - truoc_count;
      if (trong_bucket <= 0) return b.le;
      return truoc_le + ((dich - truoc_count) / trong_bucket) * (b.le - truoc_le);
    }
    truoc_le = b.le;
    truoc_count = b.count;
  }
  return truoc_le;
}

/** Trung bình một histogram — sum/count. Cách đo duy nhất KHÔNG bị bucket làm nhòe. */
export function trungBinh(h: Histogram): number | null {
  return h.count === 0 ? null : h.sum / h.count;
}

/** Phân vị của một dãy số đo được trực tiếp (không qua bucket) — dùng cho mẫu gauge. */
export function phanViDay(gia_tri: readonly number[], q: number): number | null {
  if (gia_tri.length === 0) return null;
  const sorted = [...gia_tri].sort((a, b) => a - b);
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * q) - 1));
  return sorted[i]!;
}

/**
 * Lấy /metrics hoặc /health của một service.
 * Trả về null thay vì ném lỗi: một lần scrape hụt giữa 30 phút không được làm hỏng cả
 * lượt đo — số lần hụt chính là một CHỈ SỐ của bài test, phải đếm chứ không phải bỏ chạy.
 */
export async function lay(url: string, timeoutMs = 5_000): Promise<string | null> {
  const bo = AbortSignal.timeout(timeoutMs);
  try {
    const res = await fetch(url, { signal: bo });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}
