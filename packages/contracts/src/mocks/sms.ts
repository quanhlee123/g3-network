// F-F1 — Bản mock ISmsSender cho Phase 1: in ra console thay vì gửi SMS thật (quy tắc 12).
// Giữ lại danh sách tin đã gửi để test khẳng định nội dung mà không cần nhà cung cấp thật.
import type { ISmsSender, SmsMessage } from '../sms';

export class ConsoleSmsSender implements ISmsSender {
  /** Toàn bộ tin đã "gửi" trong tiến trình này — chỉ dùng cho test & demo. */
  readonly sent: SmsMessage[] = [];

  constructor(private readonly log: (msg: string) => void = (m) => console.log(m)) {}

  send(message: SmsMessage): Promise<void> {
    this.sent.push(message);
    this.log(`[sms-mock] → ${message.to} (${message.kind}): ${message.body}`);
    return Promise.resolve();
  }

  /** Tin cuối cùng gửi tới một SĐT (test đọc mã OTP qua đây). */
  lastTo(phone: string): SmsMessage | undefined {
    return this.sent.filter((m) => m.to === phone).at(-1);
  }
}
