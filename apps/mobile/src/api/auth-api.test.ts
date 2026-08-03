import { describe, expect, it, vi } from 'vitest';
import { normalizePhone as chuanHoaSdt, isValidPhone as sdtHopLe } from '@g3/shared';
import { AuthApi } from './auth-api';
import { ApiClient } from './client';

describe('chuẩn hoá SĐT — phải khớp TUYỆT ĐỐI với backend (F-F1)', () => {
  // Nay app và backend dùng CHUNG một hàm (packages/shared/src/phone.ts), nên bảng này
  // không còn phải canh cho khớp một bản sao nữa. Giữ nguyên bảng vì nó khoá HÀNH VI:
  // đổi cách chuẩn hoá ở packages/shared là test này đỏ ở cả hai bên.
  const mauThu: Array<[string, string]> = [
    ['0912345678', '0912345678'],
    ['+84912345678', '0912345678'],
    ['84912345678', '0912345678'], // 11 ký tự — nhánh '84' áp dụng
    ['8412345678', '8412345678'], // 10 ký tự — nhánh '84' KHÔNG áp dụng
    ['0912 345 678', '0912345678'],
    ['091-234-5678', '0912345678'],
    ['091.234.5678', '0912345678'],
    ['(091)2345678', '(091)2345678'], // ngoặc KHÔNG bị bỏ — backend chỉ bỏ \s . -
    ['', ''],
    ['0900000001', '0900000001'], // SĐT giả trong db:seed
  ];

  it.each(mauThu)('“%s” → “%s”', (dauVao, mongDoi) => {
    expect(chuanHoaSdt(dauVao)).toBe(mongDoi);
  });

  it('“8412345678” (10 ký tự) KHÔNG bị đổi thành 04… — đây là chỗ dễ lệch nhất', () => {
    // Nếu ai đó nới điều kiện length >= 11 thành >= 10, app sẽ âm thầm gửi đi một SỐ
    // KHÁC số người dùng gõ. Test này khoá lại hành vi đó.
    expect(chuanHoaSdt('8412345678')).toBe('8412345678');
    expect(sdtHopLe('8412345678')).toBe(false);
  });

  it('nhận SĐT hợp lệ và từ chối SĐT hỏng', () => {
    expect(sdtHopLe('0912345678')).toBe(true);
    expect(sdtHopLe('+84912345678')).toBe(true);
    expect(sdtHopLe('0912 345 678')).toBe(true);
    expect(sdtHopLe('912345678')).toBe(false); // thiếu số 0 đầu
    expect(sdtHopLe('091234')).toBe(false); // quá ngắn
    expect(sdtHopLe('abc')).toBe(false);
    expect(sdtHopLe('')).toBe(false);
  });
});

describe('AuthApi (F-D4 + F-F1)', () => {
  function taoApi(fetchFn: typeof fetch) {
    return new AuthApi(new ApiClient({ baseUrl: 'http://api.test', timeoutMs: 100, fetchFn }));
  }

  it('xinMa gửi SĐT đã chuẩn hoá tới /auth/otp/request', async () => {
    const fetchFn = vi.fn(
      async () => new Response(JSON.stringify({ message: 'ok' }), { status: 202 }),
    );
    await taoApi(fetchFn as unknown as typeof fetch).xinMa('+84 912 345 678');

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://api.test/auth/otp/request');
    expect(JSON.parse(init.body as string)).toEqual({ phone: '0912345678' });
  });

  it('xacThucMa cắt khoảng trắng thừa quanh mã rồi trả token', async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            access_token: 'jwt-gia',
            token_type: 'Bearer',
            expires_in: 43200,
            user: { id: 'u1', full_name: 'Nguyễn Văn Tài', role: 'driver' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );

    const kq = await taoApi(fetchFn as unknown as typeof fetch).xacThucMa('0912345678', ' 123456 ');

    expect(kq.access_token).toBe('jwt-gia');
    expect(kq.user.role).toBe('driver');
    const init = (fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(init.body as string).code).toBe('123456');
  });
});
