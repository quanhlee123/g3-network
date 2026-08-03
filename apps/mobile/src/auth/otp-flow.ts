// F-D4 + F-F1 — luồng đăng nhập OTP của app tài xế, viết dạng MÁY TRẠNG THÁI thuần.
//
// Vì sao tách khỏi component: luồng này có nhiều nhánh xấu (mã sai, mã hết hạn, quá số
// lần, mất sóng giữa chừng, người dùng bấm hai lần) và đó chính là những nhánh phải test.
// Để trong React thì muốn test phải dựng cả cây component; để riêng thì test được bằng
// hàm thuần, chạy trong mili giây.
import { isValidPhone as sdtHopLe } from '@g3/shared';
import { ApiError } from '../api/client';
import type { AuthApi } from '../api/auth-api';
import { cauLoiMang, dienThamSo, VI } from '../i18n';
import type { KhoToken, PhienDangNhap } from './token-storage';

export type TenTrangThai =
  'nhap_sdt' | 'dang_xin_ma' | 'nhap_ma' | 'dang_xac_thuc' | 'da_dang_nhap';

export interface TrangThaiOtp {
  ten: TenTrangThai;
  sdt: string;
  /** Câu lỗi tiếng Việt đang hiển thị; null = không có lỗi. */
  loi: string | null;
  /** Mốc epoch ms sớm nhất được xin lại mã; 0 = xin được ngay. */
  duocGuiLaiLuc: number;
  phien: PhienDangNhap | null;
}

export const TRANG_THAI_DAU: TrangThaiOtp = {
  ten: 'nhap_sdt',
  sdt: '',
  loi: null,
  duocGuiLaiLuc: 0,
  phien: null,
};

function loiThanhCau(loi: unknown): string {
  if (loi instanceof ApiError) {
    // Lỗi nghiệp vụ: backend đã trả sẵn câu tiếng Việt hợp ngữ cảnh.
    if (loi.loai === 'loi_nghiep_vu') return loi.message;
    return cauLoiMang(loi.loai);
  }
  return cauLoiMang('khong_ro');
}

export interface PhuThuocLuong {
  authApi: AuthApi;
  khoToken: KhoToken;
  soChuSoOtp: number;
  giayChoGuiLaiOtp: number;
  dongHo?: () => number;
}

/**
 * Luồng đăng nhập OTP. Mỗi phương thức trả về trạng thái MỚI thay vì sửa tại chỗ,
 * để tầng giao diện chỉ việc gán lại state.
 */
export class LuongDangNhapOtp {
  #trangThai: TrangThaiOtp = TRANG_THAI_DAU;
  readonly #pt: PhuThuocLuong;
  readonly #dongHo: () => number;

  constructor(phuThuoc: PhuThuocLuong) {
    this.#pt = phuThuoc;
    this.#dongHo = phuThuoc.dongHo ?? (() => Date.now());
  }

  get trangThai(): TrangThaiOtp {
    return this.#trangThai;
  }

  #dat(thayDoi: Partial<TrangThaiOtp>): TrangThaiOtp {
    this.#trangThai = { ...this.#trangThai, ...thayDoi };
    return this.#trangThai;
  }

  /** Bước 1 — xin mã OTP cho số điện thoại. */
  async xinMa(sdtNhap: string): Promise<TrangThaiOtp> {
    // Bấm hai lần liên tiếp là chuyện thường khi mạng chậm: lần bấm thứ hai không
    // được tạo thêm một request nữa, nếu không backend tính thành 2 lượt xin mã và
    // đẩy tài xế tới hạn mức chống dò mã nhanh gấp đôi.
    if (this.#trangThai.ten === 'dang_xin_ma' || this.#trangThai.ten === 'dang_xac_thuc') {
      return this.#trangThai;
    }

    const sdt = sdtNhap.trim();
    if (!sdtHopLe(sdt)) {
      return this.#dat({ ten: 'nhap_sdt', sdt, loi: VI.dangNhap.sdtKhongHopLe });
    }

    const bayGio = this.#dongHo();
    if (this.#trangThai.duocGuiLaiLuc > bayGio) {
      const conLai = Math.ceil((this.#trangThai.duocGuiLaiLuc - bayGio) / 1000);
      return this.#dat({
        loi: dienThamSo(VI.dangNhap.conLaiGiay, { giay: conLai }),
      });
    }

    this.#dat({ ten: 'dang_xin_ma', sdt, loi: null });
    try {
      await this.#pt.authApi.xinMa(sdt);
    } catch (loi) {
      return this.#dat({ ten: 'nhap_sdt', loi: loiThanhCau(loi) });
    }

    return this.#dat({
      ten: 'nhap_ma',
      loi: null,
      duocGuiLaiLuc: this.#dongHo() + this.#pt.giayChoGuiLaiOtp * 1000,
    });
  }

  /** Bước 2 — đổi mã lấy token. */
  async xacThuc(maNhap: string): Promise<TrangThaiOtp> {
    if (this.#trangThai.ten !== 'nhap_ma') return this.#trangThai;

    const ma = maNhap.trim();
    if (!new RegExp(`^\\d{${this.#pt.soChuSoOtp}}$`).test(ma)) {
      return this.#dat({
        loi: dienThamSo(VI.dangNhap.maChuaDuSo, { soChuSo: this.#pt.soChuSoOtp }),
      });
    }

    this.#dat({ ten: 'dang_xac_thuc', loi: null });
    let ketQua;
    try {
      ketQua = await this.#pt.authApi.xacThucMa(this.#trangThai.sdt, ma);
    } catch (loi) {
      // Quay lại 'nhap_ma' chứ không về 'nhap_sdt': mã sai thì tài xế gõ lại mã,
      // bắt nhập lại số điện thoại là thừa một bước (NF-12 — tác vụ chính ≤3 chạm).
      return this.#dat({ ten: 'nhap_ma', loi: loiThanhCau(loi) });
    }

    const phien: PhienDangNhap = {
      token: ketQua.access_token,
      hetHanLuc: this.#dongHo() + ketQua.expires_in * 1000,
      nguoiDungId: ketQua.user.id,
      hoTen: ketQua.user.full_name,
      vaiTro: ketQua.user.role,
    };
    await this.#pt.khoToken.ghi(phien);
    return this.#dat({ ten: 'da_dang_nhap', loi: null, phien });
  }

  /** Khôi phục phiên đã lưu khi mở lại app — không bắt đăng nhập lại nếu token còn hạn. */
  async khoiPhucPhien(): Promise<TrangThaiOtp> {
    const phien = await this.#pt.khoToken.doc();
    if (!phien) return this.#trangThai;
    return this.#dat({ ten: 'da_dang_nhap', phien, loi: null });
  }

  async dangXuat(): Promise<TrangThaiOtp> {
    await this.#pt.khoToken.xoa();
    this.#trangThai = { ...TRANG_THAI_DAU };
    return this.#trangThai;
  }
}
