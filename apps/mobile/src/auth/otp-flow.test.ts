import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import type { AuthApi } from '../api/auth-api';
import { LuongDangNhapOtp } from './otp-flow';
import { KhoTokenTrongBoNho } from './token-storage';

const SDT = '0900000001'; // SĐT GIẢ trong db:seed (quy tắc 12)

function ketQuaDangNhap(expiresIn = 43_200) {
  return {
    access_token: 'jwt-gia',
    token_type: 'Bearer' as const,
    expires_in: expiresIn,
    user: { id: 'u1', full_name: 'Nguyễn Văn Tài', role: 'driver' },
  };
}

function dungLuong(authApi: Partial<AuthApi>, bayGio = { luc: 1_000_000 }) {
  const khoToken = new KhoTokenTrongBoNho();
  const luong = new LuongDangNhapOtp({
    authApi: authApi as AuthApi,
    khoToken,
    soChuSoOtp: 6,
    giayChoGuiLaiOtp: 60,
    dongHo: () => bayGio.luc,
  });
  return { luong, khoToken, bayGio };
}

describe('LuongDangNhapOtp — đường chính (F-D4 + F-F1)', () => {
  it('xin mã → nhập mã → đăng nhập xong và token được cất vào kho', async () => {
    const xinMa = vi.fn(async () => undefined);
    const xacThucMa = vi.fn(async () => ketQuaDangNhap());
    const { luong, khoToken, bayGio } = dungLuong({ xinMa, xacThucMa });

    let tt = await luong.xinMa(SDT);
    expect(tt.ten).toBe('nhap_ma');
    expect(tt.loi).toBeNull();
    expect(xinMa).toHaveBeenCalledWith(SDT);

    tt = await luong.xacThuc('123456');
    expect(tt.ten).toBe('da_dang_nhap');
    expect(tt.phien?.hoTen).toBe('Nguyễn Văn Tài');
    expect(tt.phien?.hetHanLuc).toBe(bayGio.luc + 43_200 * 1000);
    expect((await khoToken.doc())?.token).toBe('jwt-gia');
  });

  it('mở lại app thì khôi phục phiên đã lưu, không bắt đăng nhập lại', async () => {
    const { luong, khoToken } = dungLuong({});
    await khoToken.ghi({
      token: 'jwt-cu',
      hetHanLuc: 9_999_999_999_999,
      nguoiDungId: 'u1',
      hoTen: 'Nguyễn Văn Tài',
      vaiTro: 'driver',
    });

    const tt = await luong.khoiPhucPhien();
    expect(tt.ten).toBe('da_dang_nhap');
    expect(tt.phien?.token).toBe('jwt-cu');
  });

  it('đăng xuất xoá sạch token và đưa về màn nhập SĐT', async () => {
    const { luong, khoToken } = dungLuong({
      xinMa: vi.fn(async () => undefined),
      xacThucMa: vi.fn(async () => ketQuaDangNhap()),
    });
    await luong.xinMa(SDT);
    await luong.xacThuc('123456');

    const tt = await luong.dangXuat();
    expect(tt.ten).toBe('nhap_sdt');
    expect(tt.phien).toBeNull();
    expect(await khoToken.doc()).toBeNull();
  });
});

describe('LuongDangNhapOtp — kiểm tra tại chỗ, không tốn lượt gọi API', () => {
  it('SĐT sai định dạng thì báo lỗi mà KHÔNG gọi backend', async () => {
    const xinMa = vi.fn(async () => undefined);
    const { luong } = dungLuong({ xinMa });

    const tt = await luong.xinMa('091234');
    expect(tt.ten).toBe('nhap_sdt');
    expect(tt.loi).toContain('Số điện thoại');
    expect(xinMa).not.toHaveBeenCalled();
  });

  it('mã chưa đủ 6 chữ số thì không gửi đi', async () => {
    const xacThucMa = vi.fn(async () => ketQuaDangNhap());
    const { luong } = dungLuong({ xinMa: vi.fn(async () => undefined), xacThucMa });
    await luong.xinMa(SDT);

    const tt = await luong.xacThuc('123');
    expect(tt.ten).toBe('nhap_ma');
    expect(tt.loi).toContain('6 chữ số');
    expect(xacThucMa).not.toHaveBeenCalled();
  });
});

describe('LuongDangNhapOtp — kịch bản xấu', () => {
  it('MẤT SÓNG lúc xin mã: quay về nhập SĐT kèm câu "mất sóng"', async () => {
    const xinMa = vi.fn(async () => {
      throw new ApiError('mat_song', 'Không gọi được tới máy chủ.');
    });
    const { luong } = dungLuong({ xinMa });

    const tt = await luong.xinMa(SDT);
    expect(tt.ten).toBe('nhap_sdt');
    expect(tt.loi).toBe('Mất sóng. Kiểm tra kết nối rồi thử lại.');
  });

  it('MẤT SÓNG lúc xác thực: Ở LẠI màn nhập mã, không bắt gõ lại SĐT (NF-12)', async () => {
    const { luong } = dungLuong({
      xinMa: vi.fn(async () => undefined),
      xacThucMa: vi.fn(async () => {
        throw new ApiError('mat_song', 'Không gọi được tới máy chủ.');
      }),
    });
    await luong.xinMa(SDT);

    const tt = await luong.xacThuc('123456');
    expect(tt.ten).toBe('nhap_ma');
    expect(tt.sdt).toBe(SDT);
    expect(tt.loi).toContain('Mất sóng');
  });

  it('mã sai: dùng nguyên câu tiếng Việt backend trả về', async () => {
    const { luong } = dungLuong({
      xinMa: vi.fn(async () => undefined),
      xacThucMa: vi.fn(async () => {
        throw new ApiError('loi_nghiep_vu', 'Mã OTP không đúng.', {
          maLoi: 'ma_khong_dung',
          status: 401,
        });
      }),
    });
    await luong.xinMa(SDT);

    const tt = await luong.xacThuc('000000');
    expect(tt.ten).toBe('nhap_ma');
    expect(tt.loi).toBe('Mã OTP không đúng.');
  });

  it('BẤM HAI LẦN khi mạng chậm: chỉ gọi backend ĐÚNG MỘT LẦN', async () => {
    // Nếu không chặn, backend tính 2 lượt xin mã và tài xế chạm trần chống dò mã
    // nhanh gấp đôi — xem OTP_MAX_REQUESTS trong infra/.env.example.
    let giaiQuyet: (() => void) | undefined;
    const xinMa = vi.fn(
      () =>
        new Promise<void>((r) => {
          giaiQuyet = r;
        }),
    );
    const { luong } = dungLuong({ xinMa });

    const lan1 = luong.xinMa(SDT);
    const lan2 = luong.xinMa(SDT); // bấm thêm khi lần 1 chưa xong
    giaiQuyet?.();
    await Promise.all([lan1, lan2]);

    expect(xinMa).toHaveBeenCalledTimes(1);
  });

  it('XIN LẠI MÃ quá sớm bị chặn kèm số giây còn phải chờ', async () => {
    const xinMa = vi.fn(async () => undefined);
    const bayGio = { luc: 1_000_000 };
    const { luong } = dungLuong({ xinMa }, bayGio);

    await luong.xinMa(SDT);
    expect(xinMa).toHaveBeenCalledTimes(1);

    bayGio.luc += 20_000; // mới qua 20 giây, ngưỡng là 60
    const tt = await luong.xinMa(SDT);
    expect(tt.loi).toBe('Gửi lại sau 40 giây');
    expect(xinMa).toHaveBeenCalledTimes(1);

    bayGio.luc += 41_000; // đã qua 61 giây
    await luong.xinMa(SDT);
    expect(xinMa).toHaveBeenCalledTimes(2);
  });

  it('xác thực khi chưa xin mã thì không làm gì', async () => {
    const xacThucMa = vi.fn(async () => ketQuaDangNhap());
    const { luong } = dungLuong({ xacThucMa });

    const tt = await luong.xacThuc('123456');
    expect(tt.ten).toBe('nhap_sdt');
    expect(xacThucMa).not.toHaveBeenCalled();
  });
});

describe('LuongDangNhapOtp — không rò rỉ thông tin tài khoản', () => {
  it('xin mã cho SĐT không tồn tại vẫn sang màn nhập mã như thường', async () => {
    // Backend cố tình luôn trả 202 để người ngoài không dò được tài khoản nào có thật.
    // App PHẢI cư xử giống hệt: không hiện "số này chưa đăng ký", không đổi màn hình
    // khác đi — chênh lệch hành vi nào cũng thành công cụ dò danh sách tài khoản.
    const { luong } = dungLuong({ xinMa: vi.fn(async () => undefined) });

    const tt = await luong.xinMa('0900000999');
    expect(tt.ten).toBe('nhap_ma');
    expect(tt.loi).toBeNull();
  });
});
