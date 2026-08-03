// F-D4 — nơi lắp ráp phụ thuộc của app tài xế (composition root).
//
// Gom việc "new" vào một chỗ để: (1) màn hình chỉ nhận đồ đã lắp sẵn, không tự dựng;
// (2) test thay được từng mảnh; (3) khi gắn expo-secure-store hay bản đồ thật thì chỉ
// sửa file này chứ không lần mò khắp cây component.
import { ApiClient } from './api/client';
import { AuthApi } from './api/auth-api';
import { APP_CONFIG, type CauHinhApp } from './config';
import { LuongDangNhapOtp } from './auth/otp-flow';
import { KhoTokenTrongBoNho, type KhoToken, type PhienDangNhap } from './auth/token-storage';

export interface BoPhuThuoc {
  cauHinh: CauHinhApp;
  apiClient: ApiClient;
  authApi: AuthApi;
  khoToken: KhoToken;
  luongDangNhap: LuongDangNhapOtp;
}

export interface TuyChonLapRap {
  cauHinh?: CauHinhApp;
  khoToken?: KhoToken;
  fetchFn?: typeof fetch;
  dongHo?: () => number;
}

export function lapRapApp(tuyChon: TuyChonLapRap = {}): BoPhuThuoc {
  const cauHinh = tuyChon.cauHinh ?? APP_CONFIG;
  // ⚠️ Phase 1 dùng kho trong bộ nhớ: đóng app là mất phiên, phải đăng nhập lại.
  // Bản thật (expo-secure-store → Android Keystore) gắn ở bước có màn hình.
  const khoToken = tuyChon.khoToken ?? new KhoTokenTrongBoNho();

  // Token được đọc qua hàm chứ không chụp giá trị một lần: đăng nhập xong thì các lệnh
  // gọi sau tự có token mà không phải dựng lại client.
  let phienHienTai: PhienDangNhap | null = null;
  void khoToken.doc().then((p) => {
    phienHienTai = p;
  });

  const apiClient = new ApiClient({
    baseUrl: cauHinh.apiBaseUrl,
    timeoutMs: cauHinh.timeoutMs,
    fetchFn: tuyChon.fetchFn,
    layToken: () => phienHienTai?.token ?? null,
  });

  const authApi = new AuthApi(apiClient);

  // Bọc kho token để mọi thay đổi phiên đều cập nhật luôn biến dùng cho header.
  const khoTokenDongBo: KhoToken = {
    doc: async () => {
      phienHienTai = await khoToken.doc();
      return phienHienTai;
    },
    ghi: async (phien) => {
      await khoToken.ghi(phien);
      phienHienTai = phien;
    },
    xoa: async () => {
      await khoToken.xoa();
      phienHienTai = null;
    },
  };

  const luongDangNhap = new LuongDangNhapOtp({
    authApi,
    khoToken: khoTokenDongBo,
    soChuSoOtp: cauHinh.soChuSoOtp,
    giayChoGuiLaiOtp: cauHinh.giayChoGuiLaiOtp,
    dongHo: tuyChon.dongHo,
  });

  return { cauHinh, apiClient, authApi, khoToken: khoTokenDongBo, luongDangNhap };
}
