// F-E1/F-F1 — Phiên đăng nhập của portal.
//
// Token nằm trong cookie httpOnly, KHÔNG nằm trong localStorage:
//   - localStorage đọc được bằng JavaScript, nên một lỗi XSS bất kỳ trên portal là mất
//     token của quản lý đội — token đó xem được vị trí toàn đội (NF-06).
//   - httpOnly thì mã trên trình duyệt không chạm tới được; chỉ máy chủ Next.js đọc và
//     gắn vào header khi gọi apps/api.
// Hệ quả có chủ ý: mọi lời gọi API đi qua máy chủ portal, trình duyệt không nói chuyện
// thẳng với apps/api.
import { cookies } from 'next/headers';

export const COOKIE_PHIEN = 'g3_phien';

export interface PhienDangNhap {
  token: string;
}

/** Đọc phiên hiện tại; null nghĩa là chưa đăng nhập. */
export async function docPhien(): Promise<PhienDangNhap | null> {
  const store = await cookies();
  const token = store.get(COOKIE_PHIEN)?.value;
  return token ? { token } : null;
}

/**
 * Thuộc tính cookie phiên. `secure` bật theo NODE_ENV: Phase 1 chạy local qua http://
 * nên bật cứng sẽ làm cookie không bao giờ được gửi và không ai đăng nhập được.
 */
export function thuocTinhCookie(maxAgeSeconds: number): {
  httpOnly: true;
  sameSite: 'lax';
  path: '/';
  secure: boolean;
  maxAge: number;
} {
  return {
    httpOnly: true,
    // 'lax' đủ chặn CSRF cho các thao tác POST xuyên trang mà vẫn cho phép điều hướng
    // bình thường từ link.
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: maxAgeSeconds,
  };
}
