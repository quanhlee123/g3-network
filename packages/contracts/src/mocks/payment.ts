// F-H1 — Cổng thanh toán GIẢ chạy hoàn toàn trong tiến trình (quy tắc 2: mỗi interface
// phải có ít nhất 1 bản mock hoạt động được; quy tắc 12: dữ liệu giả 100%).
//
// Dùng cho: test tự động, demo Gate 0 / nghiệm thu tuần 8, và làm mặc định khi chưa cấu
// hình VNPay sandbox — hệ thống phải chạy được end-to-end trên máy sạch không cần tài khoản
// cổng nào (đây là yêu cầu "3 lệnh trên máy sạch" của README).
//
// Ký bằng HMAC-SHA256 với khoá do người gọi truyền vào. Không phải để bảo mật thật —
// mà để test đường "chữ ký sai thì từ chối" chạy trên đúng đường code như bản thật.
import { createHmac, randomUUID } from 'node:crypto';
import type {
  IPaymentGateway,
  PaymentCallback,
  PaymentCheckout,
  PaymentIntent,
  PaymentMethod,
  WebhookAck,
} from '../payment';

export interface MockPaymentOptions {
  /** Khoá ký GIẢ. Không phải secret thật (quy tắc 3 & 12). */
  secret?: string;
  /** Gốc URL trang thanh toán giả — demo mở được bằng trình duyệt để chụp màn hình. */
  payUrlBase?: string;
  method?: PaymentMethod;
}

/** Bản ghi mà mock giữ lại để test dựng webhook giống hệt cổng thật gửi về. */
export interface MockPaymentRecord {
  reference: string;
  amountVnd: number;
  description: string;
  gatewayRef: string;
}

export class MockPaymentGateway implements IPaymentGateway {
  readonly method: PaymentMethod;
  readonly ten = 'Cổng thanh toán GIẢ (nội bộ)';
  /** Các lần thanh toán đã tạo, theo reference. */
  readonly daTao = new Map<string, MockPaymentRecord>();

  readonly #secret: string;
  readonly #payUrlBase: string;

  constructor(opts: MockPaymentOptions = {}) {
    this.#secret = opts.secret ?? 'khoa-mock-thanh-toan-khong-phai-secret'; // gitleaks:allow
    this.#payUrlBase = opts.payUrlBase ?? 'http://localhost:3000/payments/gia/tra-tien';
    this.method = opts.method ?? 'wallet';
  }

  taoThanhToan(intent: PaymentIntent): Promise<PaymentCheckout> {
    const gatewayRef = `MOCK-${randomUUID().slice(0, 12).toUpperCase()}`;
    this.daTao.set(intent.reference, {
      reference: intent.reference,
      amountVnd: intent.amountVnd,
      description: intent.description,
      gatewayRef,
    });
    const q = new URLSearchParams({
      ref: intent.reference,
      amount: String(intent.amountVnd),
      gateway_ref: gatewayRef,
    });
    return Promise.resolve({
      payUrl: `${this.#payUrlBase}?${q.toString()}`,
      reference: intent.reference,
      amountVnd: intent.amountVnd,
      ...(intent.expiresAt ? { expiresAt: intent.expiresAt.toISOString() } : {}),
    });
  }

  docWebhook(duLieu: Record<string, string>): PaymentCallback {
    const chuKy = duLieu.chu_ky ?? '';
    const dung = this.kyDuLieu(duLieu);
    if (chuKy === '' || chuKy !== dung) {
      throw new Error('Chữ ký webhook không hợp lệ');
    }
    const status = duLieu.trang_thai === 'succeeded' ? 'succeeded' : 'failed';
    return {
      reference: duLieu.ref ?? '',
      gatewayRef: duLieu.gateway_ref ?? '',
      amountVnd: Number(duLieu.amount ?? 0),
      status,
      webhookId: duLieu.webhook_id ?? '',
      ...(duLieu.trang_thai ? { rawCode: duLieu.trang_thai } : {}),
    };
  }

  phanHoiWebhook(ketQua: { chapNhan: boolean; daXuLy?: boolean; lyDo?: string }): WebhookAck {
    if (ketQua.daXuLy === true) {
      return { body: { ket_qua: 'da_xu_ly_truoc_do' } };
    }
    return ketQua.chapNhan
      ? { body: { ket_qua: 'ok' } }
      : { body: { ket_qua: 'tu_choi', ly_do: ketQua.lyDo ?? '' } };
  }

  // --- tiện ích chỉ dùng trong test & demo ------------------------------------------------

  /**
   * Dựng payload webhook như cổng thật sẽ gửi. `webhookId` để mặc định là ngẫu nhiên;
   * truyền cùng một giá trị hai lần chính là kịch bản "cổng gọi lại lần hai".
   */
  taoWebhook(
    reference: string,
    opts: { thanhCong?: boolean; webhookId?: string; amountVnd?: number } = {},
  ): Record<string, string> {
    const ban = this.daTao.get(reference);
    const duLieu: Record<string, string> = {
      ref: reference,
      amount: String(opts.amountVnd ?? ban?.amountVnd ?? 0),
      gateway_ref: ban?.gatewayRef ?? `MOCK-KHONG-CO-${reference.slice(0, 6)}`,
      trang_thai: (opts.thanhCong ?? true) ? 'succeeded' : 'failed',
      webhook_id: opts.webhookId ?? randomUUID(),
    };
    duLieu.chu_ky = this.kyDuLieu(duLieu);
    return duLieu;
  }

  /** Chữ ký trên các trường đã sắp xếp, bỏ chính trường chữ ký. */
  kyDuLieu(duLieu: Record<string, string>): string {
    const chuoi = Object.keys(duLieu)
      .filter((k) => k !== 'chu_ky')
      .sort()
      .map((k) => `${k}=${duLieu[k] ?? ''}`)
      .join('&');
    return createHmac('sha256', this.#secret).update(chuoi).digest('hex');
  }
}
