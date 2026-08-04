// F-G1 — Test phát hiện ĐỒNG HỒ THIẾT BỊ CHẠY TRƯỚC máy chủ.
//
// Nguồn yêu cầu: tài liệu kỹ thuật Tri-Ring (07/2026) đánh dấu "Timestamp theo UTC" là
// ✖ CHƯA XÁC NHẬN, ghi chú "rủi ro lệch giờ TQ/VN". Trung Quốc UTC+8, Việt Nam UTC+7.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IngestMetrics, LECH_DONG_HO_TOI_DA_GIAY } from './metrics';

let canhBao: string[];

beforeEach(() => {
  canhBao = [];
  vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    canhBao.push(args.map(String).join(' '));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Đọc giá trị một counter trong registry Prometheus. */
async function demCounter(m: IngestMetrics, ten: string): Promise<number> {
  const metrics = await m.registry.getMetricsAsJSON();
  const found = metrics.find((x) => x.name === ten) as { values?: { value: number }[] } | undefined;
  return found?.values?.reduce((s, v) => s + v.value, 0) ?? 0;
}

describe('IngestMetrics — lệch đồng hồ thiết bị', () => {
  it('KỊCH BẢN NGUY HIỂM: thiết bị dùng UTC+8 gắn nhãn UTC (sớm 1 giờ) phải bị phát hiện', async () => {
    const m = new IngestMetrics();
    // Bản ghi mang giờ sớm hơn máy chủ 3600s → lag = -3600.
    m.observeLag(-3600);

    expect(await demCounter(m, 'g3_ingest_lech_dong_ho_total')).toBe(1);
    expect(canhBao.join('\n')).toContain('LỆCH ĐỒNG HỒ');
    // Cảnh báo phải nêu đúng nghi ngờ để người trực biết tìm ở đâu.
    expect(canhBao.join('\n')).toContain('UTC+8');
    // …và nêu hậu quả tiền/pháp lý, không chỉ báo "có bất thường".
    expect(canhBao.join('\n')).toContain('vi phạm sạc');
  });

  it('lệch đồng hồ KHÔNG được lẫn vào metric độ trễ NF-01', async () => {
    const m = new IngestMetrics();
    m.observeLag(-3600);

    // p95 lag vẫn là 0 (đã kẹp) — nghĩa là nhìn NF-01 thì "khoẻ mạnh".
    // Chính vì vậy phải có counter RIÊNG, nếu không lỗi cấu hình thiết bị vô hình.
    expect(m.lagWindow.p95()).toBe(0);
    expect(await demCounter(m, 'g3_ingest_lech_dong_ho_total')).toBe(1);
  });

  it('trôi đồng hồ nhỏ (NTP, hàng đợi) KHÔNG bị báo động giả', async () => {
    const m = new IngestMetrics();
    m.observeLag(-5);
    m.observeLag(-LECH_DONG_HO_TOI_DA_GIAY); // đúng ngưỡng — vẫn chấp nhận

    expect(await demCounter(m, 'g3_ingest_lech_dong_ho_total')).toBe(0);
    expect(canhBao).toEqual([]);
  });

  it('KỊCH BẢN XẤU — bản ghi bù sau mất sóng (lag DƯƠNG lớn) không bị nhầm là lệch đồng hồ', async () => {
    const m = new IngestMetrics();
    // NF-09: xe ra vùng lõm sóng 2 giờ rồi gửi bù — hợp lệ, không phải lỗi đồng hồ.
    m.observeLag(7200);

    expect(await demCounter(m, 'g3_ingest_lech_dong_ho_total')).toBe(0);
    expect(canhBao.join('\n')).not.toContain('LỆCH ĐỒNG HỒ');
  });

  it('chỉ cảnh báo console MỘT lần dù nhiều bản ghi lệch (không spam log)', async () => {
    const m = new IngestMetrics();
    for (let i = 0; i < 50; i++) m.observeLag(-3600);

    // Counter đếm đủ 50 để vận hành thấy quy mô…
    expect(await demCounter(m, 'g3_ingest_lech_dong_ho_total')).toBe(50);
    // …nhưng console chỉ kêu 1 lần, giống cách NF-01 chống spam.
    expect(canhBao.filter((d) => d.includes('LỆCH ĐỒNG HỒ')).length).toBe(1);
  });
});
