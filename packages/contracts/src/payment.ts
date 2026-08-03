// F-H1 — Hợp đồng cổng thanh toán. QUY TẮC 2 (CLAUDE.md): thanh toán là tích hợp ngoài,
// logic nghiệp vụ CẤM gọi thẳng SDK/API cổng. Bản mock: ./mocks/payment.ts.
// Bản VNPay SANDBOX: @g3/payments.
//
// BA RÀNG BUỘC KHÔNG ĐƯỢC PHÁ (quy tắc 12 + mục Ranh giới của CLAUDE.md):
//
//   1. SANDBOX ONLY ở Phase 1. Không cấu hình cổng production, không tiền thật.
//   2. KHÔNG BAO GIỜ chạm dữ liệu thẻ. Interface này cố tình KHÔNG có chỗ nào nhận số thẻ,
//      CVV, tên chủ thẻ hay ngày hết hạn — người dùng nhập thẳng trên trang của cổng
//      (tokenization phía cổng, sheet 8). Thêm trường như vậy vào đây là vi phạm nghiêm trọng.
//   3. Secret (mã bí mật ký) CHỈ đọc từ biến môi trường, không hằng số, không log.
//
// Momo KHÔNG nằm trong phạm vi Phase 1 (prompt 08.4 giao cho nhà thầu) — enum phương thức
// dưới đây cố tình không có 'momo' dù DB có, để không ai vô tình dựng nửa vời.

/** Phương thức thanh toán được cài đặt ở Phase 1. DB còn có 'momo' nhưng CHƯA làm. */
export type PaymentMethod = 'vnpay' | 'wallet';

/** Yêu cầu tạo một lần thanh toán. KHÔNG chứa và sẽ không bao giờ chứa dữ liệu thẻ. */
export interface PaymentIntent {
  /**
   * Mã tham chiếu do G3 sinh, duy nhất toàn hệ. Cổng trả lại nguyên vẹn trong webhook —
   * đây là sợi dây duy nhất nối tiền về đúng phiên sạc.
   */
  reference: string;
  amountVnd: number;
  /** Mô tả hiện trên trang thanh toán (tiếng Việt, NF-17). */
  description: string;
  /** Trang app quay về sau khi người dùng thanh toán xong. */
  returnUrl?: string;
  /** IP người trả — VNPay bắt buộc có trong chữ ký. */
  ipAddress?: string;
  createdAt?: Date;
  expiresAt?: Date;
}

/** Kết quả tạo thanh toán: app mở `payUrl` hoặc dựng QR từ nó. */
export interface PaymentCheckout {
  payUrl: string;
  reference: string;
  amountVnd: number;
  expiresAt?: string;
}

export type PaymentStatus = 'pending' | 'succeeded' | 'failed';

/** Một lần cổng báo kết quả về (webhook/IPN), đã xác thực chữ ký và chuẩn hoá. */
export interface PaymentCallback {
  reference: string;
  /** Mã giao dịch phía cổng — dùng để đối soát với sao kê. */
  gatewayRef: string;
  amountVnd: number;
  status: PaymentStatus;
  /**
   * Định danh DUY NHẤT của LẦN GỌI WEBHOOK NÀY.
   *
   * Cổng thanh toán được phép gọi lại nhiều lần (mạng chập chờn, cổng retry) — đó là hành
   * vi bình thường, không phải lỗi. Giá trị này đi thẳng vào cột UNIQUE
   * `payment_transactions.gateway_webhook_id` để lần thứ hai bị DB từ chối, chứ không dựa
   * vào việc tầng ứng dụng nhớ kiểm tra.
   */
  webhookId: string;
  /** Mã trạng thái thô của cổng, giữ lại để điều tra khi đối soát lệch. */
  rawCode?: string;
  message?: string;
}

/**
 * Nội dung phải trả về cho cổng sau khi xử lý webhook (VNPay quy định dạng cụ thể).
 *
 * CỐ Ý không có mã HTTP: cổng thanh toán báo kết quả xử lý bằng NỘI DUNG BODY, còn HTTP thì
 * luôn 200. Trả 4xx/5xx sẽ bị hiểu là "chưa nhận được" và cổng retry mãi — kể cả khi lý do
 * thật là "chữ ký sai", tức là ta tự tạo ra một vòng lặp vô hạn cho mỗi request giả mạo.
 */
export interface WebhookAck {
  body: Record<string, string>;
}

export interface IPaymentGateway {
  /** Tên cổng, khớp giá trị enum `payment_method` trong DB. */
  readonly method: PaymentMethod;
  /** Tên hiển thị cho log & màn hình vận hành. */
  readonly ten: string;

  /** Tạo lần thanh toán, trả về URL để app mở hoặc dựng QR. */
  taoThanhToan(intent: PaymentIntent): Promise<PaymentCheckout>;

  /**
   * Xác thực chữ ký & chuẩn hoá dữ liệu webhook.
   *
   * NÉM LỖI khi chữ ký sai. Endpoint webhook không có token đăng nhập (cổng thanh toán
   * không đăng nhập được vào hệ mình), nên CHỮ KÝ CHÍNH LÀ cơ chế xác thực duy nhất —
   * bỏ qua nó là mở cửa cho bất kỳ ai bơm "đã thanh toán thành công" vào hệ thống.
   */
  docWebhook(duLieu: Record<string, string>): PaymentCallback;

  /** Phản hồi trả về cho cổng. `daXuLy` = webhook này đã được ghi nhận trước đó. */
  phanHoiWebhook(ketQua: { chapNhan: boolean; daXuLy?: boolean; lyDo?: string }): WebhookAck;
}
