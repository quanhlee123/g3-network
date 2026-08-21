import { describe, expect, it } from 'vitest';
import { taoCauHinh } from './config';

describe('@g3/mobile — cấu hình (F-D4, quy tắc 3)', () => {
  it('đọc địa chỉ API từ biến môi trường, không hardcode', () => {
    const ch = taoCauHinh({ EXPO_PUBLIC_API_URL: 'http://192.168.1.50:3000' });
    expect(ch.apiBaseUrl).toBe('http://192.168.1.50:3000');
    expect(ch.dungApiUrlMacDinh).toBe(false);
  });

  it('cắt dấu / thừa ở cuối để không ghép thành //auth/otp/request', () => {
    expect(taoCauHinh({ EXPO_PUBLIC_API_URL: 'http://a.b:3000///' }).apiBaseUrl).toBe(
      'http://a.b:3000',
    );
  });

  it('chưa khai biến thì bật cờ báo đang dùng địa chỉ giả lập', () => {
    const ch = taoCauHinh({});
    expect(ch.dungApiUrlMacDinh).toBe(true);
    // 10.0.2.2 chỉ đúng trên trình giả lập Android; điện thoại thật cần IP LAN.
    expect(ch.apiBaseUrl).toContain('10.0.2.2');
  });

  it('chuỗi rỗng hoặc toàn khoảng trắng cũng coi như chưa khai', () => {
    expect(taoCauHinh({ EXPO_PUBLIC_API_URL: '   ' }).dungApiUrlMacDinh).toBe(true);
  });

  it('timeout sai kiểu thì rơi về mặc định thay vì thành NaN', () => {
    expect(taoCauHinh({ EXPO_PUBLIC_API_TIMEOUT_MS: 'mười giây' }).timeoutMs).toBe(10_000);
    expect(taoCauHinh({ EXPO_PUBLIC_API_TIMEOUT_MS: '-5' }).timeoutMs).toBe(10_000);
    expect(taoCauHinh({ EXPO_PUBLIC_API_TIMEOUT_MS: '3000' }).timeoutMs).toBe(3000);
  });

  it('nhắm Android tầm trung (NF-13) và mã OTP 6 chữ số như backend', () => {
    const ch = taoCauHinh({});
    expect(ch.targetPlatform).toBe('android');
    expect(ch.soChuSoOtp).toBe(6);
  });
});
