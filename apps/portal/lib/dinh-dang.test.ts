// F-E1 — Test định dạng hiển thị (NF-17 đơn vị, NF-12 tiếng Việt).
import { describe, expect, it } from 'vitest';
import {
  giayKeTu,
  hanhDongGoiY,
  khoangThoiGian,
  phanTram,
  soKm,
  tenLoaiCanhBao,
  tenMucDo,
} from './dinh-dang';

describe('khoangThoiGian', () => {
  it('đổi bậc đơn vị đúng chỗ', () => {
    expect(khoangThoiGian(0)).toBe('0 giây trước');
    expect(khoangThoiGian(59)).toBe('59 giây trước');
    expect(khoangThoiGian(60)).toBe('1 phút trước');
    expect(khoangThoiGian(3599)).toBe('59 phút trước');
    expect(khoangThoiGian(3600)).toBe('1 giờ trước');
    expect(khoangThoiGian(86_400)).toBe('1 ngày trước');
  });

  it('KỊCH BẢN XẤU — đồng hồ thiết bị chạy nhanh hơn máy chủ (giây âm)', () => {
    // NF-09: giờ thiết bị và giờ máy chủ có thể lệch. Không được hiện "-3 giây trước".
    expect(khoangThoiGian(-3)).toBe('vừa xong');
  });
});

describe('giayKeTu', () => {
  const bayGio = Date.parse('2026-08-04T10:00:00Z');

  it('tính đúng số giây từ mốc ISO', () => {
    expect(giayKeTu('2026-08-04T09:59:00Z', bayGio)).toBe(60);
  });

  it('KỊCH BẢN XẤU — xe chưa từng gửi dữ liệu (null) trả về null chứ không phải 0', () => {
    // 0 nghĩa là "vừa gửi xong", null nghĩa là "chưa bao giờ gửi" — hai chuyện khác hẳn nhau.
    expect(giayKeTu(null, bayGio)).toBeNull();
  });

  it('KỊCH BẢN XẤU — mốc thời gian hỏng thì trả null, không trả NaN', () => {
    expect(giayKeTu('khong-phai-ngay-thang', bayGio)).toBeNull();
  });
});

describe('phanTram & soKm', () => {
  it('phân biệt "chưa có số" với "số bằng 0"', () => {
    expect(phanTram(null)).toBe('—');
    expect(phanTram(0)).toBe('0%');
    expect(soKm(null)).toBe('—');
  });

  it('số km dùng dấu phân cách kiểu Việt Nam và đơn vị NF-17', () => {
    expect(soKm(12345)).toBe('12.345 km');
  });
});

describe('nhãn cảnh báo', () => {
  it('dịch loại cảnh báo sang tiếng Việt', () => {
    expect(tenLoaiCanhBao('battery_critical')).toBe('Pin nguy cấp');
    expect(tenLoaiCanhBao('charging_violation')).toBe('Vi phạm sạc');
  });

  it('loại lạ vẫn hiện được, không làm trống ô', () => {
    expect(tenLoaiCanhBao('loai_moi_chua_dich')).toBe('loai_moi_chua_dich');
  });

  it('mức độ theo severity 1–3 của migration 0008', () => {
    expect(tenMucDo(1)).toBe('Theo dõi');
    expect(tenMucDo(2)).toBe('Cần xử lý');
    expect(tenMucDo(3)).toBe('Nguy cấp');
  });

  it('mọi loại cảnh báo đều có hành động gợi ý (yêu cầu thiết kế Hành trình 2 bước 2)', () => {
    // Danh sách này phải khớp TOÀN BỘ enum alert_type trong DB — thiếu một giá trị thì
    // quản lý đội thấy mã snake_case và một câu gợi ý chung chung vô nghĩa.
    // Kiểm tra thật: `SELECT enumlabel FROM pg_enum ... WHERE typname='alert_type'`.
    const moiLoai = [
      'battery_low',
      'battery_critical',
      'battery_anomaly',
      'charging_violation',
      'device_offline',
      'device_tamper',
      'geofence',
      'maintenance',
      'data_quality',
      'reconciliation_mismatch',
      'sos',
      'sla_breach',
    ];
    for (const loai of moiLoai) {
      expect(hanhDongGoiY(loai).length).toBeGreaterThan(10);
      // Và phải có TÊN TIẾNG VIỆT, không rơi về chính mã enum.
      expect(tenLoaiCanhBao(loai)).not.toBe(loai);
    }
  });
});
