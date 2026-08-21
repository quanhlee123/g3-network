// F-F1 — Chuẩn hoá & kiểm tra SĐT Việt Nam. NGUỒN SỰ THẬT DUY NHẤT cho cả backend
// (apps/api) lẫn app tài xế (apps/mobile). Trước đây mỗi bên giữ một bản sao và phải
// khớp nhau từng ký tự bằng tay.
//
// VÌ SAO PHẢI DÙNG CHUNG: app chỉ được phép gửi lên ĐÚNG cái backend sẽ hiểu. Hai bản
// lệch nhau một chút thôi là app âm thầm gửi đi một SỐ KHÁC số người dùng gõ.
//
// Chỗ dễ lệch nhất là nhánh '84': nó đòi ĐỦ 11 ký tự. Với '8412345678' (10 ký tự) thì
// nhánh này KHÔNG áp dụng — số được giữ nguyên rồi bị từ chối vì không bắt đầu bằng 0.
// Nếu ai đó "nới" điều kiện thành >= 10 cho rộng rãi, số ấy biến thành '0412345678' —
// một thuê bao hoàn toàn khác. Muốn chấp nhận thêm định dạng thì sửa Ở ĐÂY, một chỗ.
//
// Lưu ý cũng cố ý: chỉ bỏ khoảng trắng, dấu chấm và gạch nối — KHÔNG bỏ ngoặc đơn.
//
// RÀNG BUỘC: file này nằm trong bundle React Native (NF-13) — CẤM import 'node:*',
// CẤM dùng Buffer/process/__dirname. Chỉ JavaScript thuần.

/** SĐT hợp lệ sau chuẩn hoá: bắt đầu bằng số 0, tổng cộng 9–12 chữ số. */
export const PHONE_PATTERN = /^0\d{8,11}$/;

/**
 * Chuẩn hoá SĐT Việt Nam về dạng 0xxxxxxxxx: bỏ khoảng trắng/dấu chấm/gạch nối,
 * +84 và 84 (đủ 11 ký tự) → 0.
 *
 * Nhờ vậy "0900 000 001", "+84900000001" và "0900000001" là cùng một tài khoản.
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/[\s.-]/g, '');
  if (digits.startsWith('+84')) return `0${digits.slice(3)}`;
  if (digits.startsWith('84') && digits.length >= 11) return `0${digits.slice(2)}`;
  return digits;
}

/**
 * SĐT có dùng được không, xét SAU khi chuẩn hoá. Backend dùng để chặn ở biên API,
 * app tài xế dùng để báo lỗi tại chỗ trước khi gọi mạng — cùng một câu trả lời.
 */
export function isValidPhone(raw: string): boolean {
  return PHONE_PATTERN.test(normalizePhone(raw));
}
