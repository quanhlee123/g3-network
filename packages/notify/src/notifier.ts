// F-F3 — Bản cài đặt thật của INotifier: cấu hình kênh × vai trò, rate-limit, lịch sử gửi.
//
// Ba nguyên tắc, xem docs/adr/ADR-008-rate-limit-thong-bao.md:
//   1. KHÔNG BAO GIỜ NÉM LỖI ra ngoài — đây là đường đi của cảnh báo an toàn (cháy nổ pin).
//      Nhà cung cấp push/SMS chết thì ghi 'failed' rồi đi tiếp.
//   2. Rate-limit CHỈ áp cho kênh chen ngang (push, SMS). Kênh in-app luôn được ghi,
//      nên dù bị chặn thì thông tin KHÔNG mất — mở app vẫn thấy.
//   3. Cảnh báo nguy cấp (severity 3) không bao giờ bị chặn.
import type {
  INotifier,
  IPushSender,
  ISmsSender,
  NotificationChannel,
  NotificationEvent,
  NotificationOutcome,
} from '@g3/contracts';
import { resolveRateLimit, SEVERITY_BO_QUA_RATE_LIMIT, type RateLimitConfig } from './config';
import { timNguoiNhan, type Queryable, type Recipient } from './recipients';

export interface NotifierServiceDeps {
  db: Queryable;
  push: IPushSender;
  sms: ISmsSender;
  /** Mặc định đọc từ biến môi trường (NOTIFY_RATE_LIMIT_MAX / _WINDOW_S). */
  rateLimit?: RateLimitConfig;
  log?: (msg: string) => void;
}

/** Độ dài tối đa của một tin SMS gửi đi (tránh tin nhiều phần tốn phí ở bản thật). */
const SMS_MAX_KY_TU = 300;

export class NotifierService implements INotifier {
  readonly #db: Queryable;
  readonly #push: IPushSender;
  readonly #sms: ISmsSender;
  readonly #rateLimit: RateLimitConfig;
  readonly #log: (msg: string) => void;

  constructor(deps: NotifierServiceDeps) {
    this.#db = deps.db;
    this.#push = deps.push;
    this.#sms = deps.sms;
    this.#rateLimit = deps.rateLimit ?? resolveRateLimit(process.env);
    this.#log = deps.log ?? (() => {});
  }

  async notify(event: NotificationEvent): Promise<NotificationOutcome[]> {
    try {
      const nguoiNhan = await timNguoiNhan(
        this.#db,
        event.alert_type,
        event.severity,
        event.vehicle_id ?? null,
      );
      if (nguoiNhan.length === 0) {
        // Không phải lỗi (vd alert thiết bị chưa gán xe), nhưng phải thấy được khi vận hành:
        // "cấu hình xong mà không ai nhận" là lỗi cấu hình im lặng, rất khó phát hiện.
        this.#log(
          `[F-F3] không có người nhận cho ${event.alert_type} (severity ${event.severity})`,
        );
        return [];
      }

      const ketQua: NotificationOutcome[] = [];
      for (const nn of nguoiNhan) {
        for (const kenh of nn.channels) {
          ketQua.push(await this.#guiMotKenh(event, nn, kenh));
        }
      }
      return ketQua;
    } catch (err) {
      // Nuốt lỗi CÓ Ý (nguyên tắc 1): thà mất thông báo còn hơn làm chết pipeline ingest
      // hay chặn việc ghi alert vào DB.
      this.#log(`[F-F3] lỗi khi gửi thông báo ${event.alert_type}: ${moTaLoi(err)}`);
      return [];
    }
  }

  async #guiMotKenh(
    event: NotificationEvent,
    nn: Recipient,
    kenh: NotificationChannel,
  ): Promise<NotificationOutcome> {
    // Nguyên tắc 2 + 3: in-app không bao giờ bị chặn, severity 3 không bao giờ bị chặn.
    const apRateLimit = kenh !== 'in_app' && event.severity < SEVERITY_BO_QUA_RATE_LIMIT;
    if (apRateLimit && (await this.#vuotHanMuc(nn.user_id, event.alert_type, kenh))) {
      const ly_do = `rate_limit: quá ${this.#rateLimit.max} tin/${this.#rateLimit.windowS}s`;
      await this.#ghiLichSu(event, nn, kenh, 'suppressed', ly_do);
      return { user_id: nn.user_id, channel: kenh, status: 'suppressed', error: ly_do };
    }

    let loi: string | null = null;
    try {
      await this.#dispatch(event, nn, kenh);
    } catch (err) {
      loi = moTaLoi(err);
    }
    const status = loi === null ? 'sent' : 'failed';
    await this.#ghiLichSu(event, nn, kenh, status, loi);
    return {
      user_id: nn.user_id,
      channel: kenh,
      status,
      ...(loi === null ? {} : { error: loi }),
    };
  }

  /** Đưa bản tin ra kênh tương ứng. Ném lỗi = kênh đó thất bại (được ghi 'failed'). */
  async #dispatch(
    event: NotificationEvent,
    nn: Recipient,
    kenh: NotificationChannel,
  ): Promise<void> {
    if (kenh === 'in_app') return; // bản ghi notifications CHÍNH LÀ hộp thư in-app

    if (kenh === 'push') {
      if (nn.push_tokens.length === 0) throw new Error('chua_dang_ky_thiet_bi_nhan_push');
      const loi: string[] = [];
      for (const token of nn.push_tokens) {
        try {
          await this.#push.send({
            token,
            title: event.title,
            body: event.body,
            ...(event.data ? { data: event.data } : {}),
          });
        } catch (err) {
          loi.push(moTaLoi(err));
        }
      }
      // Đẩy được tới ÍT NHẤT 1 thiết bị là coi như tới tay người dùng.
      if (loi.length === nn.push_tokens.length) throw new Error(loi.join('; '));
      return;
    }

    if (nn.phone === null || nn.phone === '') throw new Error('khong_co_so_dien_thoai');
    await this.#sms.send({
      to: nn.phone,
      body: `${event.title} — ${event.body}`.slice(0, SMS_MAX_KY_TU),
      kind: 'canh_bao',
    });
  }

  /**
   * Đếm số tin ĐÃ GỬI trong cửa sổ. Cố ý KHÔNG đếm tin 'suppressed': nếu đếm cả tin bị chặn
   * thì mỗi lần chặn lại kéo dài cửa sổ, người dùng có thể bị im lặng vô thời hạn.
   */
  async #vuotHanMuc(
    userId: string,
    alertType: string,
    kenh: NotificationChannel,
  ): Promise<boolean> {
    const res = await this.#db.query(
      `SELECT count(*)::int AS n FROM notifications
       WHERE user_id = $1::uuid AND alert_type = $2::alert_type AND channel = $3::notification_channel
         AND status = 'sent'
         AND created_at > now() - ($4::int * interval '1 second')`,
      [userId, alertType, kenh, this.#rateLimit.windowS],
    );
    return (res.rows[0]?.n as number) >= this.#rateLimit.max;
  }

  async #ghiLichSu(
    event: NotificationEvent,
    nn: Recipient,
    kenh: NotificationChannel,
    status: 'sent' | 'failed' | 'suppressed',
    loi: string | null,
  ): Promise<void> {
    await this.#db.query(
      `INSERT INTO notifications
         (user_id, channel, status, alert_id, ticket_id, alert_type, severity, title, body, data, error)
       VALUES ($1::uuid, $2::notification_channel, $3::notification_status, $4::uuid, $5::uuid,
               $6::alert_type, $7, $8, $9, $10::jsonb, $11)`,
      [
        nn.user_id,
        kenh,
        status,
        event.alert_id ?? null,
        event.ticket_id ?? null,
        event.alert_type,
        event.severity,
        event.title,
        event.body,
        event.data ? JSON.stringify(event.data) : null,
        loi,
      ],
    );
  }
}

function moTaLoi(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
