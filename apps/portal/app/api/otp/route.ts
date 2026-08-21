// F-F1 — Bước 1 đăng nhập: xin mã OTP.
// Chỉ chuyển tiếp sang apps/api. Phase 1 mã in ra console của apps/api (không gửi SMS thật).
import { NextResponse } from 'next/server';
import { apiUrl } from '../../../lib/config';

export async function POST(request: Request): Promise<NextResponse> {
  const { phone } = (await request.json()) as { phone?: string };
  if (!phone) {
    return NextResponse.json({ message: 'Chưa nhập số điện thoại.' }, { status: 400 });
  }

  try {
    const res = await fetch(`${apiUrl()}/auth/otp/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone }),
      cache: 'no-store',
    });
    const body = (await res.json().catch(() => null)) as {
      message?: string;
      error?: { message?: string };
    } | null;

    if (!res.ok) {
      return NextResponse.json(
        { message: body?.error?.message ?? 'Không xin được mã OTP.' },
        { status: res.status },
      );
    }
    return NextResponse.json({ message: body?.message ?? 'Đã gửi mã OTP.' });
  } catch {
    return NextResponse.json(
      { message: 'Không kết nối được tới API. Kiểm tra apps/api còn chạy không.' },
      { status: 502 },
    );
  }
}
