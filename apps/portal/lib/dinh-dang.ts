// F-E1 — Định dạng hiển thị tiếng Việt cho portal (NF-12 chữ lớn dễ đọc, NF-17 đơn vị).
// Đơn vị chuẩn toàn hệ lấy từ @g3/shared để portal, app tài xế và API không lệch nhau.
import { UNITS } from '@g3/shared';

/** "3 phút trước", "2 giờ trước" — quản lý đội cần biết dữ liệu CŨ tới mức nào. */
export function khoangThoiGian(giay: number): string {
  if (giay < 0) return 'vừa xong';
  if (giay < 60) return `${String(Math.floor(giay))} giây trước`;
  if (giay < 3600) return `${String(Math.floor(giay / 60))} phút trước`;
  if (giay < 86_400) return `${String(Math.floor(giay / 3600))} giờ trước`;
  return `${String(Math.floor(giay / 86_400))} ngày trước`;
}

/** Số giây tính từ mốc ISO tới `bayGio`; null nếu không có mốc. */
export function giayKeTu(isoTime: string | null, bayGio: number = Date.now()): number | null {
  if (!isoTime) return null;
  const moc = Date.parse(isoTime);
  if (Number.isNaN(moc)) return null;
  return Math.floor((bayGio - moc) / 1000);
}

/** Giờ Việt Nam, dạng ngắn cho bảng biểu. */
export function gioVn(isoTime: string): string {
  const d = new Date(isoTime);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** SOC hiển thị: không có số thì "—" chứ không phải "0%" (khác nhau về nghĩa). */
export function phanTram(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(0)}%`;
}

export function soKm(value: number | null): string {
  return value === null ? '—' : `${Math.round(value).toLocaleString('vi-VN')} ${UNITS.distance}`;
}

/**
 * Tên tiếng Việt của TOÀN BỘ enum alert_type (migration 0008 + 0011 + 0014 + 0022 + 0023).
 * Thiếu một loại ở đây thì màn hình hiện thẳng mã snake_case cho quản lý đội đọc.
 */
export const TEN_LOAI_CANH_BAO: Record<string, string> = {
  battery_low: 'Pin thấp',
  battery_critical: 'Pin nguy cấp',
  battery_anomaly: 'Bất thường pin',
  charging_violation: 'Vi phạm sạc',
  device_offline: 'Thiết bị mất liên lạc',
  device_tamper: 'Nghi tháo thiết bị',
  geofence: 'Ra/vào vùng',
  maintenance: 'Nhắc bảo dưỡng',
  data_quality: 'Dữ liệu bất thường',
  reconciliation_mismatch: 'Lệch đối soát kWh',
  sos: 'Tài xế bấm SOS',
  sla_breach: 'Quá hạn SLA hỗ trợ',
};

export function tenLoaiCanhBao(type: string): string {
  return TEN_LOAI_CANH_BAO[type] ?? type;
}

/** Nhãn mức độ. severity: 1 sớm · 2 chính · 3 nguy cấp (migration 0008). */
export function tenMucDo(severity: number): string {
  if (severity >= 3) return 'Nguy cấp';
  if (severity === 2) return 'Cần xử lý';
  return 'Theo dõi';
}

/**
 * Hành động gợi ý kèm mỗi cảnh báo — yêu cầu thiết kế của Hành trình 2 bước 2:
 * "Cảnh báo kèm hành động gợi ý (gọi tài xế, xem bằng chứng)".
 * Cảnh báo không nói người đọc phải LÀM GÌ thì chỉ là tiếng ồn.
 */
export function hanhDongGoiY(type: string): string {
  switch (type) {
    case 'battery_low':
      return 'Gọi tài xế, hướng dẫn tới trạm sạc gần nhất.';
    case 'battery_critical':
      return 'Gọi tài xế NGAY — xe có nguy cơ dừng giữa đường.';
    case 'battery_anomaly':
      return 'Yêu cầu dừng xe an toàn, báo kỹ thuật kiểm tra pack pin.';
    case 'charging_violation':
      return 'Xem bằng chứng phiên sạc, nhắc tài xế trước khi thành chuyện bảo hành.';
    case 'device_offline':
      return 'Kiểm tra xe có đang ở vùng lõm sóng; quá lâu thì báo kỹ thuật.';
    case 'device_tamper':
      return 'Xác minh với tài xế xem thiết bị có bị ngắt nguồn hay không.';
    case 'geofence':
      return 'Đối chiếu với lịch trình đã giao cho tài xế.';
    case 'maintenance':
      return 'Đặt lịch bảo dưỡng cho xe.';
    case 'data_quality':
      return 'Báo kỹ thuật: thiết bị đang gửi số liệu không hợp lệ.';
    case 'reconciliation_mismatch':
      return 'Đối chiếu số kWh trụ–xe–thanh toán trước khi chốt hoá đơn (NF-10).';
    case 'sos':
      return 'Gọi lại tài xế NGAY và chuyển CSKH tiếp nhận.';
    case 'sla_breach':
      return 'Ticket quá hạn chưa ai nhận — giục CSKH xử lý.';
    default:
      return 'Xem chi tiết để quyết định bước xử lý.';
  }
}

/** Trạng thái bảo hành hiển thị bằng tiếng Việt (enum warranty_state, migration 0001). */
export function tenTinhTrangBaoHanh(state: string): string {
  switch (state) {
    case 'active':
      return 'Còn hiệu lực';
    case 'at_risk':
      return 'Có rủi ro';
    case 'void':
      return 'Đã mất';
    default:
      return state;
  }
}
