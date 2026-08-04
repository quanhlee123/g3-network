// F-F1 — Bước 2 đăng nhập: đổi mã OTP lấy token, cất vào cookie httpOnly (xem lib/phien.ts).
// Token KHÔNG bao giờ được trả về cho trình duyệt trong body — đó là toàn bộ mục đích của
// cách làm này.
import { NextResponse } from 'next/server';
import { apiUrl } from '../../../lib/config';
import { COOKIE_PHIEN, thuocTinhCookie } from '../../../lib/phien';

export async function POST(request: Request): Promise<NextResponse> {
  const { phone, code } = (await request.json()) as { phone?: string; code?: string };
  if (!phone || !code) {
    return NextResponse.json({ message: 'Thiếu số điện thoại hoặc mã OTP.' }, { status: 400 });
  }

  try {
    const res = await fetch(`${apiUrl()}/auth/otp/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone, code }),
      cache: 'no-store',
    });
    const body = (await res.json().catch(() => null)) as {
      access_token?: string;
      expires_in?: number;
      user?: { full_name: string; role: string };
      error?: { message?: string };
    } | null;

    if (!res.ok || !body?.access_token) {
      return NextResponse.json(
        { message: body?.error?.message ?? 'Mã OTP không đúng.' },
        { status: res.status === 200 ? 401 : res.status },
      );
    }

    const reply = NextResponse.json({ user: body.user ?? null });
    reply.cookies.set(
      COOKIE_PHIEN,
      body.access_token,
      // Cookie hết hạn cùng lúc với token: tránh cảnh trình duyệt còn cookie mà API đã
      // từ chối, khiến người dùng thấy màn hình lỗi thay vì màn hình đăng nhập.
      thuocTinhCookie(body.expires_in ?? 3600),
    );
    return reply;
  } catch {
    return NextResponse.json(
      { message: 'Không kết nối được tới API. Kiểm tra apps/api còn chạy không.' },
      { status: 502 },
    );
  }
}

/** Đăng xuất: xoá cookie phiên. */
export async function DELETE(): Promise<NextResponse> {
  const reply = NextResponse.json({ message: 'Đã đăng xuất.' });
  reply.cookies.set(COOKIE_PHIEN, '', thuocTinhCookie(0));
  return reply;
}
