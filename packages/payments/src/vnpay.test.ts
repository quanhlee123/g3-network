// F-H1 — Test cổng VNPay SANDBOX.
//
// Không gọi mạng, không cần tài khoản VNPay: mọi thứ kiểm được là chữ ký, định dạng tham số
// và rào chắn môi trường. Bí mật ký dùng ở đây là chuỗi GIẢ do test tự đặt (quy tắc 3 & 12).
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  chuoiThamSo,
  dinhDangGio,
  kiemTraSandbox,
  VnpaySandboxGateway,
  type VnpayConfig,
} from './vnpay';

/** Cấu hình GIẢ — không phải thông tin thật của bất kỳ tài khoản nào. */
const CAU_HINH: VnpayConfig = {
  tmnCode: 'GIA0TEST',
  hashSecret: 'chuoi-bi-mat-gia-cho-test-khong-phai-that', // gitleaks:allow
  payUrl: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
  returnUrl: 'http://localhost:3000/payments/ket-qua',
};

const cong = (): VnpaySandboxGateway => new VnpaySandboxGateway(CAU_HINH);

describe('F-H1 — rào chắn SANDBOX ONLY', () => {
  it('TỪ CHỐI KHỞI ĐỘNG khi URL không phải sandbox', () => {
    // Đây là rào chắn quan trọng nhất của cả tính năng: một biến môi trường cấu hình nhầm
    // là đủ để hệ thống bắt đầu tạo lệnh thu tiền THẬT của người THẬT (CLAUDE.md quy tắc 12).
    expect(() => kiemTraSandbox('https://vnpayment.vn/paymentv2/vpcpay.html')).toThrow(
      /TỪ CHỐI KHỞI ĐỘNG/,
    );
    expect(() => kiemTraSandbox('https://pay.vnpay.vn/vpcpay.html')).toThrow(/sandbox/);
  });

  it('hàm dựng cũng hỏng ngay, không đợi tới giao dịch đầu tiên', () => {
    expect(
      () => new VnpaySandboxGateway({ ...CAU_HINH, payUrl: 'https://vnpayment.vn/vpcpay.html' }),
    ).toThrow(/TỪ CHỐI KHỞI ĐỘNG/);
  });

  it('chấp nhận host sandbox', () => {
    expect(() => kiemTraSandbox(CAU_HINH.payUrl)).not.toThrow();
  });

  it('URL rác bị từ chối chứ không âm thầm cho qua', () => {
    expect(() => kiemTraSandbox('khong-phai-url')).toThrow(/không phải URL hợp lệ/);
  });

  it('thiếu mã website / bí mật ký thì báo rõ cách sửa', () => {
    expect(() => new VnpaySandboxGateway({ ...CAU_HINH, hashSecret: '' })).toThrow(/infra\/\.env/);
  });
});

describe('F-H1 — tạo link thanh toán đúng đặc tả VNPay 2.1.0', () => {
  it('số tiền nhân 100 và tham số bắt buộc có đủ', async () => {
    const checkout = await cong().taoThanhToan({
      reference: 'G3TEST0001',
      amountVnd: 140_000,
      description: 'Sac xe G3-SIM-VIN-0001 - 40 kWh',
      ipAddress: '10.0.0.1',
      createdAt: new Date('2026-06-12T02:00:00Z'),
    });

    const u = new URL(checkout.payUrl);
    // Sai chỗ nhân 100 là lệch đúng 100 lần số tiền — đắt nhất trong các lỗi định dạng
    expect(u.searchParams.get('vnp_Amount')).toBe('14000000');
    expect(u.searchParams.get('vnp_TxnRef')).toBe('G3TEST0001');
    expect(u.searchParams.get('vnp_TmnCode')).toBe('GIA0TEST');
    expect(u.searchParams.get('vnp_Version')).toBe('2.1.0');
    expect(u.searchParams.get('vnp_CurrCode')).toBe('VND');
    expect(u.searchParams.get('vnp_IpAddr')).toBe('10.0.0.1');
    expect(u.searchParams.get('vnp_SecureHash')).toMatch(/^[0-9a-f]{128}$/); // SHA-512 hex
    expect(u.host).toContain('sandbox');
  });

  it('giờ tạo theo múi giờ Việt Nam, không phải UTC', () => {
    // 02:00Z = 09:00 giờ VN. Sai múi giờ ở đây làm VNPay từ chối vì link "chưa tới hạn".
    expect(dinhDangGio(new Date('2026-06-12T02:00:00Z'), 'Asia/Ho_Chi_Minh')).toBe(
      '20260612090000',
    );
  });

  it('chuỗi ký sắp xếp theo tên tham số và mã hoá URL', () => {
    expect(chuoiThamSo({ b: '2', a: 'x y', c: 'á' })).toBe('a=x+y&b=2&c=%C3%A1');
  });
});

describe('F-H1 — xác thực webhook (IPN)', () => {
  /** Dựng payload IPN đã ký đúng, như VNPay sẽ gửi về. */
  function ipn(ghiDe: Record<string, string> = {}): Record<string, string> {
    const duLieu: Record<string, string> = {
      vnp_Amount: '14000000',
      vnp_BankCode: 'NCB',
      vnp_ResponseCode: '00',
      vnp_TmnCode: 'GIA0TEST',
      vnp_TransactionNo: '14022618',
      vnp_TransactionStatus: '00',
      vnp_TxnRef: 'G3TEST0001',
      ...ghiDe,
    };
    const chuKy = createHmac('sha512', CAU_HINH.hashSecret)
      .update(chuoiThamSo(duLieu), 'utf8')
      .digest('hex');
    return { ...duLieu, vnp_SecureHash: chuKy };
  }

  it('chữ ký đúng → đọc được kết quả, số tiền chia lại 100', () => {
    const cb = cong().docWebhook(ipn());

    expect(cb.reference).toBe('G3TEST0001');
    expect(cb.amountVnd).toBe(140_000);
    expect(cb.status).toBe('succeeded');
    expect(cb.gatewayRef).toBe('14022618');
  });

  it('CHỮ KÝ SAI → ném lỗi (đây là xác thực duy nhất của endpoint công khai)', () => {
    const gia = { ...ipn(), vnp_SecureHash: 'a'.repeat(128) };

    expect(() => cong().docWebhook(gia)).toThrow(/Chữ ký webhook VNPay không hợp lệ/);
  });

  it('thiếu chữ ký → ném lỗi, không mặc định cho qua', () => {
    const thieu = { ...ipn() };
    delete thieu.vnp_SecureHash;

    expect(() => cong().docWebhook(thieu)).toThrow(/không hợp lệ/);
  });

  it('sửa SỐ TIỀN sau khi ký → chữ ký không còn khớp', () => {
    // Ca tấn công thực tế nhất: bắt được webhook rồi đổi số tiền.
    const gia = { ...ipn(), vnp_Amount: '100' };

    expect(() => cong().docWebhook(gia)).toThrow(/không hợp lệ/);
  });

  it('mã phản hồi khác 00 → thất bại, không phải thành công', () => {
    const cb = cong().docWebhook(ipn({ vnp_ResponseCode: '24', vnp_TransactionStatus: '02' }));

    expect(cb.status).toBe('failed');
    expect(cb.rawCode).toBe('24');
  });

  it('webhookId ổn định cho cùng một giao dịch — nền tảng của chống trùng', () => {
    // Cổng retry cùng giao dịch phải ra CÙNG webhookId thì cột UNIQUE ở DB mới chặn được.
    const a = cong().docWebhook(ipn());
    const b = cong().docWebhook(ipn());

    expect(a.webhookId).toBe(b.webhookId);
    expect(a.webhookId).toContain('G3TEST0001');
  });

  it('phản hồi cho cổng đúng bảng mã VNPay', () => {
    const g = cong();

    expect(g.phanHoiWebhook({ chapNhan: true }).body).toEqual({
      RspCode: '00',
      Message: 'Confirm Success',
    });
    expect(g.phanHoiWebhook({ chapNhan: true, daXuLy: true }).body.RspCode).toBe('02');
    expect(g.phanHoiWebhook({ chapNhan: false }).body.RspCode).toBe('01');
  });
});
