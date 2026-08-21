import { describe, expect, it, vi } from 'vitest';
import { lapRapApp } from './app-deps';
import { taoCauHinh } from './config';
import { KhoTokenTrongBoNho } from './auth/token-storage';

const CAU_HINH = taoCauHinh({ EXPO_PUBLIC_API_URL: 'http://api.test' });

function traLoiJson(than: unknown, status = 200) {
  return new Response(JSON.stringify(than), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('lapRapApp — nối dây (F-D4)', () => {
  it('sau khi đăng nhập, lệnh gọi tiếp theo tự mang token mà không phải dựng lại client', async () => {
    const goi: RequestInit[] = [];
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      goi.push(init ?? {});
      if (String(_url).endsWith('/auth/otp/request')) return traLoiJson({ message: 'ok' }, 202);
      if (String(_url).endsWith('/auth/otp/verify')) {
        return traLoiJson({
          access_token: 'jwt-gia',
          token_type: 'Bearer',
          expires_in: 43_200,
          user: { id: 'u1', full_name: 'Nguyễn Văn Tài', role: 'driver' },
        });
      }
      return traLoiJson({
        id: 'u1',
        full_name: 'Nguyễn Văn Tài',
        role: 'driver',
        customer_id: null,
        permissions: [],
      });
    });

    const app = lapRapApp({
      cauHinh: CAU_HINH,
      khoToken: new KhoTokenTrongBoNho(),
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    await app.luongDangNhap.xinMa('0900000001');
    await app.luongDangNhap.xacThuc('123456');
    await app.authApi.layTaiKhoan();

    const headerCuoi = (goi.at(-1)?.headers ?? {}) as Record<string, string>;
    expect(headerCuoi.Authorization).toBe('Bearer jwt-gia');
  });

  it('đăng xuất thì lệnh gọi sau KHÔNG còn mang token cũ', async () => {
    const goi: RequestInit[] = [];
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      goi.push(init ?? {});
      if (String(_url).endsWith('/auth/otp/request')) return traLoiJson({ message: 'ok' }, 202);
      if (String(_url).endsWith('/auth/otp/verify')) {
        return traLoiJson({
          access_token: 'jwt-gia',
          token_type: 'Bearer',
          expires_in: 43_200,
          user: { id: 'u1', full_name: 'Nguyễn Văn Tài', role: 'driver' },
        });
      }
      return traLoiJson({});
    });

    const app = lapRapApp({
      cauHinh: CAU_HINH,
      khoToken: new KhoTokenTrongBoNho(),
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    await app.luongDangNhap.xinMa('0900000001');
    await app.luongDangNhap.xacThuc('123456');
    await app.luongDangNhap.dangXuat();
    await app.authApi.layTaiKhoan();

    const headerCuoi = (goi.at(-1)?.headers ?? {}) as Record<string, string>;
    expect(headerCuoi.Authorization).toBeUndefined();
  });

  it('dùng đúng địa chỉ API trong cấu hình', async () => {
    const fetchFn = vi.fn(async () => traLoiJson({ message: 'ok' }, 202));
    const app = lapRapApp({
      cauHinh: CAU_HINH,
      khoToken: new KhoTokenTrongBoNho(),
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    await app.luongDangNhap.xinMa('0900000001');
    expect((fetchFn.mock.calls[0] as unknown as [string])[0]).toBe(
      'http://api.test/auth/otp/request',
    );
  });
});
