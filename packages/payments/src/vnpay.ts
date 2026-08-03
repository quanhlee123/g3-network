// F-H1 — Cổng VNPay, CHỈ MÔI TRƯỜNG SANDBOX (quy tắc 12 + mục Ranh giới của CLAUDE.md).
//
// Cài đặt theo đặc tả VNPay 2.1.0: ký HMAC-SHA512 trên chuỗi tham số đã sắp xếp.
// KHÔNG dùng SDK bên ngoài — chỉ `node:crypto`, nên không kéo theo phụ thuộc nào có thể
// tự ý gọi mạng.
//
// KHÔNG CÓ và sẽ không có ở đây:
//   - Dữ liệu thẻ dưới mọi hình thức. Người dùng nhập thẳng trên trang VNPay.
//   - Cấu hình môi trường production. Hàm dựng TỪ CHỐI khởi động nếu URL không phải sandbox
//     — xem chặn ở `kiemTraSandbox()`. Đây là rào chắn kỹ thuật, không phải lời nhắc.
//   - Giá trị secret trong mã nguồn. Chỉ đọc từ biến môi trường (quy tắc 3).
import { createHmac } from 'node:crypto';
import type {
  IPaymentGateway,
  PaymentCallback,
  PaymentCheckout,
  PaymentIntent,
  PaymentMethod,
  WebhookAck,
} from '@g3/contracts';

export interface VnpayConfig {
  /** Mã website do VNPay cấp cho tài khoản SANDBOX. */
  tmnCode: string;
  /** Chuỗi bí mật ký — CHỈ từ biến môi trường, không bao giờ log ra. */
  hashSecret: string;
  /** Endpoint tạo thanh toán. Bắt buộc là host sandbox. */
  payUrl: string;
  /** URL app quay về sau khi trả tiền. */
  returnUrl: string;
  /** Múi giờ dựng vnp_CreateDate (VNPay dùng giờ Việt Nam). */
  muiGio?: string;
  /** Số phút hiệu lực của link thanh toán. */
  soPhutHetHan?: number;
}

/** Chuỗi bắt buộc có trong host để được coi là môi trường thử nghiệm. */
const DAU_HIEU_SANDBOX = 'sandbox';

/**
 * Chặn cứng môi trường production.
 *
 * Phase 1 tuyên bố rõ "chưa có tiền thật, thanh toán chỉ dùng SANDBOX". Nếu chỉ ghi điều
 * đó vào tài liệu thì một biến môi trường cấu hình nhầm là đủ để hệ thống bắt đầu tạo lệnh
 * thu tiền thật của người thật. Rào chắn phải nằm trong mã, và phải làm hỏng lúc KHỞI ĐỘNG
 * chứ không phải lúc có giao dịch đầu tiên.
 */
export function kiemTraSandbox(payUrl: string): void {
  let host: string;
  try {
    host = new URL(payUrl).host;
  } catch {
    throw new Error(`VNPAY_PAY_URL không phải URL hợp lệ: "${payUrl}"`);
  }
  if (!host.toLowerCase().includes(DAU_HIEU_SANDBOX)) {
    throw new Error(
      `TỪ CHỐI KHỞI ĐỘNG: VNPAY_PAY_URL trỏ tới "${host}" — không phải môi trường sandbox. ` +
        'Phase 1 chỉ được dùng sandbox (CLAUDE.md quy tắc 12 & mục Ranh giới). ' +
        'Muốn chạy production phải có ADR được duyệt và người chịu trách nhiệm ký.',
    );
  }
}

export class VnpaySandboxGateway implements IPaymentGateway {
  readonly method: PaymentMethod = 'vnpay';
  readonly ten = 'VNPay (SANDBOX)';
  readonly #c: Required<Pick<VnpayConfig, 'muiGio' | 'soPhutHetHan'>> & VnpayConfig;

  constructor(config: VnpayConfig) {
    kiemTraSandbox(config.payUrl);
    if (config.tmnCode === '' || config.hashSecret === '') {
      throw new Error(
        'Thiếu VNPAY_TMN_CODE hoặc VNPAY_HASH_SECRET. Điền vào infra/.env (KHÔNG commit) — ' +
          'xem bảng biến môi trường trong README.',
      );
    }
    this.#c = { muiGio: 'Asia/Ho_Chi_Minh', soPhutHetHan: 15, ...config };
  }

  taoThanhToan(intent: PaymentIntent): Promise<PaymentCheckout> {
    const tao = intent.createdAt ?? new Date();
    const het = intent.expiresAt ?? new Date(tao.getTime() + this.#c.soPhutHetHan * 60_000);

    const thamSo: Record<string, string> = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: this.#c.tmnCode,
      // VNPay nhận số tiền nhân 100 (đơn vị nhỏ nhất). Sai chỗ này là lệch 100 lần.
      vnp_Amount: String(Math.round(intent.amountVnd) * 100),
      vnp_CurrCode: 'VND',
      vnp_TxnRef: intent.reference,
      vnp_OrderInfo: intent.description,
      vnp_OrderType: 'other',
      vnp_Locale: 'vn',
      vnp_ReturnUrl: intent.returnUrl ?? this.#c.returnUrl,
      vnp_IpAddr: intent.ipAddress ?? '127.0.0.1',
      vnp_CreateDate: dinhDangGio(tao, this.#c.muiGio),
      vnp_ExpireDate: dinhDangGio(het, this.#c.muiGio),
    };

    const chuoiKy = chuoiThamSo(thamSo);
    const chuKy = this.#ky(chuoiKy);
    const payUrl = `${this.#c.payUrl}?${chuoiKy}&vnp_SecureHash=${chuKy}`;

    return Promise.resolve({
      payUrl,
      reference: intent.reference,
      amountVnd: intent.amountVnd,
      expiresAt: het.toISOString(),
    });
  }

  /**
   * Xác thực IPN của VNPay rồi chuẩn hoá.
   *
   * Endpoint webhook không có token đăng nhập — cổng thanh toán không đăng nhập được vào hệ
   * mình. Chữ ký HMAC CHÍNH LÀ cơ chế xác thực duy nhất; bỏ qua nó là để bất kỳ ai gọi được
   * URL đều bơm được "đã thanh toán thành công" vào hồ sơ doanh thu.
   */
  docWebhook(duLieu: Record<string, string>): PaymentCallback {
    const nhan = duLieu.vnp_SecureHash ?? '';
    const conLai: Record<string, string> = {};
    for (const [k, v] of Object.entries(duLieu)) {
      if (k === 'vnp_SecureHash' || k === 'vnp_SecureHashType') continue;
      if (!k.startsWith('vnp_')) continue; // tham số lạ không tham gia ký
      conLai[k] = v;
    }
    const dung = this.#ky(chuoiThamSo(conLai));
    if (nhan === '' || nhan.toLowerCase() !== dung.toLowerCase()) {
      throw new Error('Chữ ký webhook VNPay không hợp lệ');
    }

    const maPhanHoi = duLieu.vnp_ResponseCode ?? '';
    const trangThaiGd = duLieu.vnp_TransactionStatus ?? '';
    const status = maPhanHoi === '00' && trangThaiGd === '00' ? 'succeeded' : 'failed';

    return {
      reference: duLieu.vnp_TxnRef ?? '',
      gatewayRef: duLieu.vnp_TransactionNo ?? '',
      amountVnd: Math.round(Number(duLieu.vnp_Amount ?? 0) / 100),
      status,
      // VNPay không có "id của lần gọi webhook", nên khoá chống trùng dựng từ bộ ba định
      // danh giao dịch. Cổng retry cùng một giao dịch sẽ ra cùng chuỗi này → DB chặn.
      webhookId: `vnpay:${duLieu.vnp_TxnRef ?? ''}:${duLieu.vnp_TransactionNo ?? ''}:${maPhanHoi}`,
      rawCode: maPhanHoi,
      ...(duLieu.vnp_OrderInfo ? { message: duLieu.vnp_OrderInfo } : {}),
    };
  }

  /** Mã phản hồi theo đúng bảng của VNPay — sai định dạng là cổng retry vô hạn. */
  phanHoiWebhook(ketQua: { chapNhan: boolean; daXuLy?: boolean; lyDo?: string }): WebhookAck {
    if (ketQua.daXuLy === true) {
      return { body: { RspCode: '02', Message: 'Order already confirmed' } };
    }
    if (!ketQua.chapNhan) {
      return { body: { RspCode: '01', Message: ketQua.lyDo ?? 'Order not found' } };
    }
    return { body: { RspCode: '00', Message: 'Confirm Success' } };
  }

  #ky(chuoi: string): string {
    return createHmac('sha512', this.#c.hashSecret).update(chuoi, 'utf8').digest('hex');
  }
}

/**
 * Chuỗi tham số đã sắp xếp theo tên, giá trị đã mã hoá URL — VNPay ký trên đúng chuỗi này.
 * Dấu cách mã thành '+' theo URLSearchParams, khớp cách VNPay dựng lại phía họ.
 */
export function chuoiThamSo(thamSo: Record<string, string>): string {
  return Object.keys(thamSo)
    .sort()
    .map((k) => `${k}=${encodeURIComponent(thamSo[k] ?? '').replace(/%20/g, '+')}`)
    .join('&');
}

/** yyyyMMddHHmmss theo giờ Việt Nam — định dạng VNPay quy định. */
export function dinhDangGio(d: Date, muiGio: string): string {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: muiGio,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(d);
  const lay = (t: string): string => p.find((x) => x.type === t)?.value ?? '00';
  return `${lay('year')}${lay('month')}${lay('day')}${lay('hour')}${lay('minute')}${lay('second')}`;
}
