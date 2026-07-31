// F-F3 — Bản mock IPushSender cho Phase 1: in ra console thay vì gọi FCM thật (quy tắc 12).
// Giữ danh sách bản tin đã "đẩy" để test khẳng định nội dung mà không cần Firebase.
import type { IPushSender, PushMessage } from '../notifier';

export class ConsolePushSender implements IPushSender {
  /** Toàn bộ bản tin đã "đẩy" trong tiến trình này — chỉ dùng cho test & demo. */
  readonly sent: PushMessage[] = [];

  /** Đặt true để mô phỏng nhà cung cấp push chết (kịch bản xấu bắt buộc của DoD). */
  loi = false;

  constructor(private readonly log: (msg: string) => void = (m) => console.log(m)) {}

  send(message: PushMessage): Promise<void> {
    if (this.loi) return Promise.reject(new Error('push-mock: nhà cung cấp không phản hồi'));
    this.sent.push(message);
    this.log(`[push-mock] → ${message.token}: ${message.title} — ${message.body}`);
    return Promise.resolve();
  }

  /** Bản tin cuối cùng đẩy tới một token. */
  lastTo(token: string): PushMessage | undefined {
    return this.sent.filter((m) => m.token === token).at(-1);
  }
}
