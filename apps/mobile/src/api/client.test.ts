import { describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError } from './client';

function traLoi(than: unknown, status = 200): Response {
  return new Response(than === undefined ? '' : JSON.stringify(than), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function taoClient(fetchFn: typeof fetch, layToken?: () => string | null) {
  return new ApiClient({ baseUrl: 'http://api.test', timeoutMs: 50, fetchFn, layToken });
}

describe('ApiClient — đường chính (F-D4)', () => {
  it('gọi đúng URL, đúng method và trả về thân JSON', async () => {
    const fetchFn = vi.fn(async () => traLoi({ ok: true }));
    const kq = await taoClient(fetchFn as unknown as typeof fetch).goi<{ ok: boolean }>(
      '/stations/map',
    );

    expect(kq).toEqual({ ok: true });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://api.test/stations/map');
    expect(init.method).toBe('GET');
  });

  it('gắn Bearer token vào header khi đã đăng nhập', async () => {
    const fetchFn = vi.fn(async () => traLoi({}));
    await taoClient(fetchFn as unknown as typeof fetch, () => 'token-gia').goi('/auth/me');

    const init = (fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-gia');
  });

  it('route công khai KHÔNG gắn token dù đang có token', async () => {
    const fetchFn = vi.fn(async () => traLoi({}, 202));
    await taoClient(fetchFn as unknown as typeof fetch, () => 'token-gia').goi(
      '/auth/otp/request',
      { method: 'POST', body: { phone: '0900000001' }, congKhai: true },
    );

    const init = (fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(init.body).toBe('{"phone":"0900000001"}');
  });

  it('204 không thân thì trả undefined chứ không nổ khi parse JSON', async () => {
    // Phải là null: 204 là "null body status", truyền '' vào Response sẽ ném TypeError.
    const fetchFn = vi.fn(async () => new Response(null, { status: 204 }));
    await expect(taoClient(fetchFn as unknown as typeof fetch).goi('/x')).resolves.toBeUndefined();
  });

  it('200 với thân rỗng cũng không nổ (một số route trả rỗng)', async () => {
    const fetchFn = vi.fn(async () => new Response('', { status: 200 }));
    await expect(taoClient(fetchFn as unknown as typeof fetch).goi('/x')).resolves.toBeUndefined();
  });
});

describe('ApiClient — kịch bản xấu (tài xế vùng sóng yếu)', () => {
  it('MẤT SÓNG: fetch ném lỗi → phân loại mat_song', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('Network request failed');
    });

    const loi = await taoClient(fetchFn as unknown as typeof fetch)
      .goi('/auth/me')
      .catch((e: unknown) => e);

    expect(loi).toBeInstanceOf(ApiError);
    expect((loi as ApiError).loai).toBe('mat_song');
  });

  it('MẠNG CHẬM / PHẢN HỒI ĐẾN TRỄ: quá hạn chờ → phân loại qua_han, không treo mãi', async () => {
    // Máy chủ "treo" lâu hơn timeout 50ms rất nhiều.
    const fetchFn = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_giaiQuyet, tuChoi) => {
          init?.signal?.addEventListener('abort', () => tuChoi(new Error('aborted')));
        }),
    );

    const loi = await taoClient(fetchFn as unknown as typeof fetch)
      .goi('/auth/me')
      .catch((e: unknown) => e);

    expect(loi).toBeInstanceOf(ApiError);
    expect((loi as ApiError).loai).toBe('qua_han');
  });

  it('lỗi nghiệp vụ 4xx: giữ nguyên mã và câu tiếng Việt của backend', async () => {
    const fetchFn = vi.fn(async () =>
      traLoi({ error: { code: 'ma_het_han', message: 'Mã OTP đã hết hạn — xin mã mới.' } }, 401),
    );

    const loi = (await taoClient(fetchFn as unknown as typeof fetch)
      .goi('/auth/otp/verify', { method: 'POST' })
      .catch((e: unknown) => e)) as ApiError;

    expect(loi.loai).toBe('loi_nghiep_vu');
    expect(loi.maLoi).toBe('ma_het_han');
    expect(loi.message).toBe('Mã OTP đã hết hạn — xin mã mới.');
    expect(loi.laHetPhien).toBe(true);
  });

  it('5xx trả HTML (proxy chen ngang) vẫn báo loi_may_chu, không báo phản hồi hỏng', async () => {
    const fetchFn = vi.fn(
      async () => new Response('<html>502 Bad Gateway</html>', { status: 502 }),
    );

    const loi = (await taoClient(fetchFn as unknown as typeof fetch)
      .goi('/auth/me')
      .catch((e: unknown) => e)) as ApiError;

    expect(loi.loai).toBe('loi_may_chu');
    expect(loi.status).toBe(502);
  });

  it('200 nhưng thân không phải JSON → phan_hoi_hong', async () => {
    const fetchFn = vi.fn(async () => new Response('không phải json', { status: 200 }));

    const loi = (await taoClient(fetchFn as unknown as typeof fetch)
      .goi('/auth/me')
      .catch((e: unknown) => e)) as ApiError;

    expect(loi.loai).toBe('phan_hoi_hong');
  });

  it('người dùng rời màn hình: lệnh huỷ của nơi gọi được ném nguyên trạng, không hoá thành lỗi mạng', async () => {
    const boDem = new AbortController();
    const fetchFn = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_giaiQuyet, tuChoi) => {
          init?.signal?.addEventListener('abort', () => tuChoi(new Error('nguoi-dung-huy')));
        }),
    );

    const choDoi = taoClient(fetchFn as unknown as typeof fetch).goi('/auth/me', {
      signal: boDem.signal,
    });
    boDem.abort();

    const loi = await choDoi.catch((e: unknown) => e);
    expect(loi).not.toBeInstanceOf(ApiError);
  });
});
