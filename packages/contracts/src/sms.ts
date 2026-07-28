// F-F1 — Hợp đồng gửi SMS (OTP đăng nhập; sau này là SMS dự phòng cảnh báo pin ≤10% — F-F3).
// QUY TẮC 2 (CLAUDE.md): SMS là tích hợp ngoài — apps/api CHỈ được biết interface này,
// cấm gọi thẳng SDK nhà mạng/Twilio/eSMS. Bản mock: ./mocks/sms.ts (in ra console).

/** Một tin nhắn cần gửi. */
export interface SmsMessage {
  /** SĐT người nhận. Phase 1 luôn là số GIẢ dải 09000000xx (quy tắc 12). */
  to: string;
  body: string;
  /**
   * Phân loại nghiệp vụ để nhà cung cấp thật chọn brandname/template và để log.
   * 'otp' = mã đăng nhập · 'canh_bao' = cảnh báo pin/bất thường (F-F3).
   */
  kind: 'otp' | 'canh_bao';
}

/**
 * Cổng gửi SMS. Ném lỗi khi không gửi được — tầng gọi quyết định có chặn nghiệp vụ hay không
 * (đăng nhập OTP: chặn; cảnh báo: không được chặn luồng an toàn vì SMS hỏng).
 */
export interface ISmsSender {
  send(message: SmsMessage): Promise<void>;
}
