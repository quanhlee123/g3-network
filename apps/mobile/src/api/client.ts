// F-D4 — tầng gọi API của app tài xế: gắn token, đặt hạn chờ, phân loại lỗi.
//
// Vì sao phân loại lỗi kỹ đến vậy: tài xế chạy tuyến dài, vùng sóng yếu là chuyện
// THƯỜNG NGÀY chứ không phải ngoại lệ hiếm. "Mất sóng" và "hệ thống lỗi" đòi hai hành
// động khác nhau (đi tiếp rồi thử lại · gọi tổng đài), nên app phải phân biệt được
// thay vì hiện chung một câu "có lỗi xảy ra".
//
// fetch được TIÊM VÀO thay vì gọi thẳng global — để test chạy được không cần mạng
// (tinh thần quy tắc 2: phần phụ thuộc bên ngoài phải thay thế được bằng bản giả).

export type LoaiLoiApi =
  /** Không gọi tới được máy chủ: mất sóng, sai địa chỉ, DNS hỏng. */
  | 'mat_song'
  /** Gọi được nhưng quá hạn chờ — mạng chậm hoặc máy chủ treo. */
  | 'qua_han'
  /** Máy chủ trả 5xx. */
  | 'loi_may_chu'
  /** Máy chủ trả 4xx kèm mã lỗi nghiệp vụ (vd ma_khong_dung). */
  | 'loi_nghiep_vu'
  /** Trả về thứ không đọc được thành JSON đúng khuôn. */
  | 'phan_hoi_hong';

export class ApiError extends Error {
  readonly loai: LoaiLoiApi;
  /** Mã lỗi nghiệp vụ backend trả về, vd 'ma_het_han'. Chỉ có khi loai='loi_nghiep_vu'. */
  readonly maLoi?: string;
  readonly status?: number;

  constructor(
    loai: LoaiLoiApi,
    message: string,
    tuyChon: { maLoi?: string; status?: number } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.loai = loai;
    this.maLoi = tuyChon.maLoi;
    this.status = tuyChon.status;
  }

  /** Phiên đăng nhập hết hạn — nơi gọi cần đá người dùng về màn hình đăng nhập. */
  get laHetPhien(): boolean {
    return this.status === 401;
  }
}

export interface CauHinhClient {
  baseUrl: string;
  timeoutMs: number;
  /** Trả token hiện có để gắn header Authorization; null = chưa đăng nhập. */
  layToken?: () => string | null;
  /** Mặc định dùng fetch toàn cục; test tiêm bản giả. */
  fetchFn?: typeof fetch;
}

export interface TuyChonGoi {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH';
  body?: unknown;
  /** Bỏ qua header Authorization (dùng cho route công khai như xin OTP). */
  congKhai?: boolean;
  /** Cho phép nơi gọi huỷ sớm, vd người dùng rời màn hình. */
  signal?: AbortSignal;
}

/** Khuôn lỗi backend: { error: { code, message } } — xem apps/api/src/errors.ts. */
function docLoiBackend(than: unknown): { code: string; message: string } | null {
  if (typeof than !== 'object' || than === null) return null;
  const loi = (than as { error?: unknown }).error;
  if (typeof loi !== 'object' || loi === null) return null;
  const { code, message } = loi as { code?: unknown; message?: unknown };
  if (typeof code !== 'string' || typeof message !== 'string') return null;
  return { code, message };
}

export class ApiClient {
  private readonly cauHinh: Required<Pick<CauHinhClient, 'baseUrl' | 'timeoutMs'>> & CauHinhClient;

  constructor(cauHinh: CauHinhClient) {
    this.cauHinh = { ...cauHinh, baseUrl: cauHinh.baseUrl.replace(/\/+$/, '') };
  }

  async goi<T>(duongDan: string, tuyChon: TuyChonGoi = {}): Promise<T> {
    const { method = 'GET', body, congKhai = false, signal } = tuyChon;
    const fetchFn = this.cauHinh.fetchFn ?? globalThis.fetch;
    const boDem = new AbortController();

    // Hạn chờ của app và lệnh huỷ từ nơi gọi phải cùng tác động lên một request.
    // Ghi lý do vào biến riêng thay vì abort(reason): React Native chạy trên nhiều
    // phiên bản AbortController, có bản abort() không nhận tham số nào.
    let doQuaHan = false;
    const hetHan = setTimeout(() => {
      doQuaHan = true;
      boDem.abort();
    }, this.cauHinh.timeoutMs);
    const huyTheoNoiGoi = () => boDem.abort();
    signal?.addEventListener('abort', huyTheoNoiGoi, { once: true });

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (!congKhai) {
      const token = this.cauHinh.layToken?.();
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    let phanHoi: Response;
    try {
      phanHoi = await fetchFn(`${this.cauHinh.baseUrl}${duongDan}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: boDem.signal,
      });
    } catch (loi) {
      // Nơi gọi chủ động huỷ thì ném nguyên trạng, không biến thành lỗi mạng.
      if (signal?.aborted) throw loi;
      if (doQuaHan) {
        throw new ApiError('qua_han', 'Quá hạn chờ phản hồi từ máy chủ.');
      }
      throw new ApiError('mat_song', 'Không gọi được tới máy chủ.');
    } finally {
      clearTimeout(hetHan);
      signal?.removeEventListener('abort', huyTheoNoiGoi);
    }

    // 204 và các phản hồi rỗng: không có gì để đọc.
    if (phanHoi.status === 204) return undefined as T;

    let than: unknown;
    const chuoi = await phanHoi.text();
    if (chuoi.length === 0) {
      than = undefined;
    } else {
      try {
        than = JSON.parse(chuoi);
      } catch {
        // 5xx kèm trang HTML (proxy, gateway) là trường hợp hay gặp — báo lỗi máy chủ
        // sẽ đúng bản chất hơn là báo "phản hồi hỏng".
        if (phanHoi.status >= 500) {
          throw new ApiError('loi_may_chu', 'Máy chủ đang gặp sự cố.', {
            status: phanHoi.status,
          });
        }
        throw new ApiError('phan_hoi_hong', 'Phản hồi không phải JSON hợp lệ.', {
          status: phanHoi.status,
        });
      }
    }

    if (phanHoi.ok) return than as T;

    const loiBackend = docLoiBackend(than);
    if (phanHoi.status >= 500) {
      throw new ApiError('loi_may_chu', loiBackend?.message ?? 'Máy chủ đang gặp sự cố.', {
        maLoi: loiBackend?.code,
        status: phanHoi.status,
      });
    }
    if (loiBackend) {
      // Câu tiếng Việt của backend đã hợp ngữ cảnh nghiệp vụ — dùng luôn, app chỉ tự
      // sinh câu cho những lỗi backend không biết (mất sóng, quá hạn).
      throw new ApiError('loi_nghiep_vu', loiBackend.message, {
        maLoi: loiBackend.code,
        status: phanHoi.status,
      });
    }
    throw new ApiError('phan_hoi_hong', 'Máy chủ trả lỗi không đúng khuôn.', {
      status: phanHoi.status,
    });
  }
}
