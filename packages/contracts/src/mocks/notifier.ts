// F-F3 — Bản mock INotifier: ghi sự kiện vào RAM, không đụng DB và không gọi nhà cung cấp.
// Dùng cho test của các tính năng SINH ra thông báo (F-A2, F-A4, F-A5, F-J1/J3, F-I2) —
// những test đó cần biết "có báo đúng sự kiện không", không cần biết đường đi từng kênh.
// Đường đi từng kênh là việc của test packages/notify.
import type { INotifier, NotificationEvent, NotificationOutcome } from '../notifier';

export class MockNotifier implements INotifier {
  /** Mọi sự kiện đã nhận, theo thứ tự. */
  readonly events: NotificationEvent[] = [];

  /** Đặt true để mô phỏng khung thông báo hỏng — luồng an toàn vẫn phải chạy tiếp. */
  loi = false;

  notify(event: NotificationEvent): Promise<NotificationOutcome[]> {
    if (this.loi) return Promise.reject(new Error('notifier-mock: hỏng'));
    this.events.push(event);
    return Promise.resolve([]);
  }

  /** Các sự kiện thuộc một loại alert. */
  theoLoai(alertType: NotificationEvent['alert_type']): NotificationEvent[] {
    return this.events.filter((e) => e.alert_type === alertType);
  }

  /** Các sự kiện của một xe. */
  theoXe(vehicleId: string): NotificationEvent[] {
    return this.events.filter((e) => e.vehicle_id === vehicleId);
  }

  xoa(): void {
    this.events.length = 0;
  }
}
