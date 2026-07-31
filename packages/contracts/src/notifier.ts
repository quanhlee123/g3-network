// F-F3 — Hợp đồng thông báo đa kênh: push (FCM) · in-app · SMS.
// QUY TẮC 2 (CLAUDE.md): push là tích hợp ngoài (FCM) nên phải qua interface ở đây;
// cấm logic nghiệp vụ gọi thẳng SDK Firebase. Bản mock: ./mocks/push.ts.
//
// INotifier là CỔNG duy nhất mà mọi tính năng dùng để báo cho con người
// (F-A2 pin yếu, F-A4 bất thường, F-A5 geofence, F-J1/J3 thiết bị, F-I2 SOS).
// Bản cài đặt thật ở packages/notify (@g3/notify) — nó mới là chỗ biết bảng
// notification_prefs, rate-limit và lịch sử gửi.
import type { AlertType } from '@g3/shared';

export type NotificationChannel = 'push' | 'in_app' | 'sms';

/** Mức nặng, khớp cột alerts.severity: 1 = sớm · 2 = chính · 3 = nguy cấp. */
export type NotificationSeverity = 1 | 2 | 3;

/**
 * Một sự kiện cần báo cho người. Tầng nghiệp vụ KHÔNG chọn người nhận và KHÔNG chọn kênh —
 * hai việc đó do cấu hình (bảng notification_prefs) quyết định, để vận hành đổi được
 * mà không cần deploy (F-F3: "cấu hình kênh & ngưỡng").
 */
export interface NotificationEvent {
  alert_type: AlertType;
  severity: NotificationSeverity;
  /** Tiếng Việt, ngắn — hiện trên notification bar điện thoại (NF-12: chữ lớn, rõ). */
  title: string;
  body: string;
  /** Xe liên quan — dùng để tìm tài xế được gán và đội sở hữu xe. */
  vehicle_id?: string | null;
  alert_id?: string | null;
  ticket_id?: string | null;
  /** Dữ liệu kèm cho app deep-link tới đúng màn hình (NF-12: tác vụ chính ≤3 chạm). */
  data?: Record<string, unknown>;
}

export interface NotificationOutcome {
  user_id: string;
  channel: NotificationChannel;
  /** 'suppressed' = bị rate-limit chặn (không bao giờ xảy ra với severity 3). */
  status: 'sent' | 'failed' | 'suppressed';
  error?: string;
}

export interface INotifier {
  /**
   * Gửi cho MỌI người nhận hợp lệ của sự kiện.
   *
   * BẮT BUỘC KHÔNG ĐƯỢC NÉM LỖI: đây là đường đi của cảnh báo an toàn (cháy nổ pin).
   * Nhà cung cấp push/SMS chết thì phải ghi 'failed' rồi đi tiếp, tuyệt đối không làm
   * hỏng việc ghi alert hay dừng pipeline ingest.
   */
  notify(event: NotificationEvent): Promise<NotificationOutcome[]>;
}

/** Một bản tin đẩy tới 1 thiết bị. */
export interface PushMessage {
  /** Token thiết bị (FCM). Phase 1 là token GIẢ do mobile mock sinh (quy tắc 12). */
  token: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Cổng gửi push. Ném lỗi khi không gửi được — @g3/notify bắt lỗi đó, ghi 'failed'
 * và tiếp tục các kênh còn lại (không để một kênh hỏng chặn cả cảnh báo).
 */
export interface IPushSender {
  send(message: PushMessage): Promise<void>;
}
