// F-H1 — Bản cài đặt thật của IPaymentGateway. Phase 1 CHỈ có VNPay SANDBOX.
// Momo để nhà thầu làm sau (prompt 08.4) — không dựng nửa vời ở đây.
import { MockPaymentGateway, type IPaymentGateway } from '@g3/contracts';
import { VnpaySandboxGateway, type VnpayConfig } from './vnpay';

export { VnpaySandboxGateway, kiemTraSandbox, chuoiThamSo, dinhDangGio } from './vnpay';
export type { VnpayConfig } from './vnpay';

/** Cổng đang bật, đọc từ biến môi trường. */
export type LoaiCong = 'mock' | 'vnpay';

export function docLoaiCong(env: NodeJS.ProcessEnv): LoaiCong {
  const raw = env.PAYMENT_GATEWAY ?? 'mock';
  if (raw === 'mock' || raw === 'vnpay') return raw;
  throw new Error(`PAYMENT_GATEWAY không hợp lệ: "${raw}" (chỉ nhận 'mock' hoặc 'vnpay')`);
}

export function docCauHinhVnpay(env: NodeJS.ProcessEnv): VnpayConfig {
  return {
    tmnCode: env.VNPAY_TMN_CODE ?? '',
    hashSecret: env.VNPAY_HASH_SECRET ?? '',
    payUrl: env.VNPAY_PAY_URL ?? 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
    returnUrl: env.VNPAY_RETURN_URL ?? 'http://localhost:3000/payments/ket-qua',
    ...(env.VNPAY_EXPIRE_MINUTES ? { soPhutHetHan: Number(env.VNPAY_EXPIRE_MINUTES) } : {}),
  };
}

/**
 * Chọn cổng theo biến môi trường.
 *
 * MẶC ĐỊNH là mock, có chủ ý: máy sạch chưa cấu hình gì phải chạy được toàn bộ luồng
 * (yêu cầu "3 lệnh" của README, và demo cho Ban lãnh đạo không phụ thuộc tài khoản VNPay).
 * Bật `vnpay` là hành động tường minh của người vận hành, và ngay cả khi đó vẫn chỉ
 * sandbox — `VnpaySandboxGateway` từ chối khởi động nếu URL không phải host sandbox.
 */
export function taoCongThanhToan(
  env: NodeJS.ProcessEnv = process.env,
  log: (msg: string) => void = () => {},
): IPaymentGateway {
  const loai = docLoaiCong(env);
  if (loai === 'vnpay') {
    const cong = new VnpaySandboxGateway(docCauHinhVnpay(env));
    log(`[F-H1] cổng thanh toán: ${cong.ten}`);
    return cong;
  }
  const cong = new MockPaymentGateway({
    ...(env.PAYMENT_MOCK_SECRET ? { secret: env.PAYMENT_MOCK_SECRET } : {}),
    ...(env.PAYMENT_MOCK_PAY_URL ? { payUrlBase: env.PAYMENT_MOCK_PAY_URL } : {}),
  });
  log(`[F-H1] cổng thanh toán: ${cong.ten} — chưa bật VNPay sandbox`);
  return cong;
}
