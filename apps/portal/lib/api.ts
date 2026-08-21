// F-E1 — Tầng gọi apps/api từ MÁY CHỦ portal (Server Component / Route Handler).
//
// Quy tắc 2 tinh thần: màn hình không tự dựng URL và không tự bắt lỗi HTTP rải rác.
// Mọi lời gọi đi qua đây để có đúng một chỗ xử lý: gắn token, hạn chờ, dịch lỗi sang
// tiếng Việt (NF-17), và phân biệt "hết phiên" với "không đủ quyền" — hai thứ này cần
// hai cách xử lý khác hẳn nhau trên giao diện.
//
// File này CHỈ chạy trên máy chủ: nó dùng docPhien() → next/headers, thứ Next.js từ chối
// biên dịch trong Client Component. Không cần thêm gói `server-only` để ép điều đó.
import { apiTimeoutMs, apiUrl } from './config';
import { docPhien } from './phien';

export interface LoiApi {
  status: number;
  code: string;
  message: string;
}

export type KetQua<T> = { ok: true; data: T } | { ok: false; loi: LoiApi };

/** Lỗi mạng/hạn chờ được quy về cùng một hình dạng với lỗi HTTP để màn hình chỉ xử lý một kiểu. */
function loiMang(message: string): LoiApi {
  return { status: 0, code: 'khong_goi_duoc_api', message };
}

export async function goiApi<T>(
  duongDan: string,
  opts: { method?: string; body?: unknown; token?: string } = {},
): Promise<KetQua<T>> {
  const token = opts.token ?? (await docPhien())?.token;
  if (!token) {
    return {
      ok: false,
      loi: { status: 401, code: 'chua_dang_nhap', message: 'Phiên đăng nhập đã hết hạn.' },
    };
  }

  const dieuKhien = new AbortController();
  const henGio = setTimeout(() => {
    dieuKhien.abort();
  }, apiTimeoutMs());

  try {
    const res = await fetch(`${apiUrl()}${duongDan}`, {
      method: opts.method ?? 'GET',
      headers: {
        authorization: `Bearer ${token}`,
        ...(opts.body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
      // Dữ liệu vận hành phải là số MỚI NHẤT. Không có dòng này thì Next cache lại và
      // quản lý đội nhìn bản đồ của lần tải trước mà không biết.
      cache: 'no-store',
      signal: dieuKhien.signal,
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: LoiApi } | null;
      return {
        ok: false,
        loi: {
          status: res.status,
          code: body?.error?.code ?? 'loi_khong_ro',
          message: body?.error?.message ?? `API trả mã ${String(res.status)}.`,
        },
      };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return {
        ok: false,
        loi: loiMang('API không phản hồi kịp. Kiểm tra apps/api còn chạy không.'),
      };
    }
    return {
      ok: false,
      loi: loiMang(
        'Không kết nối được tới API. Chạy `docker compose up -d && npm run dev` rồi thử lại.',
      ),
    };
  } finally {
    clearTimeout(henGio);
  }
}

// ---- Hình dạng dữ liệu các endpoint portal dùng --------------------------------------
// Giữ đúng tên trường của API (tiếng Việt không dấu ở đâu API dùng tiếng Việt không dấu)
// để đọc code cạnh /docs không phải dịch qua lại.

export interface Xe {
  id: string;
  vin: string;
  model: string;
  warranty_state: string;
  customer_name: string;
  capacity_kwh: number | null;
  soh_pct: number | null;
  last_reading_at: string | null;
  soc_pct: number | null;
  odometer_km: number | null;
  device_last_seen_at: string | null;
  device_power_status: string | null;
}

export interface DanhSachXe {
  total: number;
  limit: number;
  offset: number;
  items: Xe[];
}

export interface DiemXe {
  vehicle_id: string;
  vin: string;
  time: string;
  lat: number;
  lng: number;
  speed_kmh: number | null;
  soc_pct: number | null;
  cu_giay: number;
}

export interface BanDoDoi {
  so_xe: number;
  items: DiemXe[];
}

export interface CanhBao {
  id: string;
  type: string;
  severity: number;
  status: string;
  vehicle_id: string;
  vin: string;
  device_id: string | null;
  payload: unknown;
  triggered_at: string;
  resolved_at: string | null;
}

export interface DanhSachCanhBao {
  total: number;
  theo_loai: Record<string, number>;
  theo_muc_do: Record<string, number>;
  items: CanhBao[];
}

export interface ThietBi {
  device_id: string;
  device_serial: string;
  vehicle_id: string;
  vin: string;
  last_seen_at: string | null;
  im_lang_giay: number | null;
  power_status: string;
  canh_bao_dang_mo: string | null;
  loai_im_lang: string | null;
}

export interface SucKhoeThietBi {
  total: number;
  items: ThietBi[];
}

export interface ToiLaAi {
  id: string;
  full_name: string;
  role: string;
  customer_id: string | null;
  permissions: { permission: string; scope: string; require_open_ticket: boolean }[];
}
