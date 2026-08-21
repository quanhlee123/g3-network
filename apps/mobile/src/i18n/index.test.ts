import { describe, expect, it } from 'vitest';
import { VI, cauLoiDangNhap, cauLoiMang, dienThamSo } from './index';

describe('i18n tiếng Việt (NF-12)', () => {
  it('thay tham số trong câu', () => {
    expect(dienThamSo(VI.dangNhap.daGuiMa, { sdt: '0900000001' })).toBe(
      'Đã gửi mã xác nhận tới số 0900000001.',
    );
    expect(dienThamSo(VI.dangNhap.conLaiGiay, { giay: 40 })).toBe('Gửi lại sau 40 giây');
  });

  it('thiếu tham số thì GIỮ NGUYÊN ô {…} để lỗi lộ ra lúc test', () => {
    expect(dienThamSo('Còn {giay} giây', {})).toBe('Còn {giay} giây');
  });

  it('câu không có ô nào thì trả nguyên văn', () => {
    expect(dienThamSo('Đăng nhập')).toBe('Đăng nhập');
  });
});

describe('Ánh xạ mã lỗi → câu tiếng Việt', () => {
  it('phủ đủ 3 mã lỗi OTP mà backend có thể trả', () => {
    // Khớp với apps/api/src/routes/auth.ts — thêm mã mới ở backend thì thêm câu ở đây.
    for (const ma of ['ma_khong_dung', 'ma_het_han', 'qua_so_lan']) {
      expect(cauLoiDangNhap(ma)).not.toBe(VI.loiMang.khong_ro);
      expect(cauLoiDangNhap(ma).length).toBeGreaterThan(0);
    }
  });

  it('mã lạ rơi về câu chung thay vì hiện mã máy cho tài xế', () => {
    expect(cauLoiDangNhap('loi_gi_do_moi')).toBe(VI.loiMang.khong_ro);
  });

  it('lỗi mạng có câu riêng cho từng loại, đều nói rõ việc cần làm', () => {
    expect(cauLoiMang('mat_song')).toContain('Mất sóng');
    expect(cauLoiMang('qua_han')).toContain('Thử lại');
    expect(cauLoiMang('loi_may_chu')).toContain('Thử lại');
  });

  it('không câu nào lẫn thuật ngữ tiếng Anh', () => {
    const tuCam = ['error', 'network', 'timeout', 'failed', 'unauthorized'];
    const moiCau = [
      ...Object.values(VI.loiMang),
      ...Object.values(VI.loiDangNhap),
      ...Object.values(VI.phien),
    ];
    for (const cau of moiCau) {
      for (const tu of tuCam) expect(cau.toLowerCase()).not.toContain(tu);
    }
  });
});
