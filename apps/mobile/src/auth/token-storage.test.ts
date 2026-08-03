import { describe, expect, it } from 'vitest';
import { KhoTokenTrongBoNho, phienConHan, type PhienDangNhap } from './token-storage';

function phien(hetHanLuc: number): PhienDangNhap {
  return {
    token: 'jwt-gia',
    hetHanLuc,
    nguoiDungId: 'u1',
    hoTen: 'Nguyễn Văn Tài',
    vaiTro: 'driver',
  };
}

describe('KhoTokenTrongBoNho (F-D4)', () => {
  it('ghi rồi đọc lại được, xoá thì về null', async () => {
    const kho = new KhoTokenTrongBoNho();
    expect(await kho.doc()).toBeNull();

    await kho.ghi(phien(123));
    expect((await kho.doc())?.token).toBe('jwt-gia');

    await kho.xoa();
    expect(await kho.doc()).toBeNull();
  });
});

describe('phienConHan — biên an toàn', () => {
  const BAY_GIO = 1_000_000;

  it('token còn hạn dài thì dùng được', () => {
    expect(phienConHan(phien(BAY_GIO + 3_600_000), BAY_GIO)).toBe(true);
  });

  it('token đã hết hạn thì không dùng', () => {
    expect(phienConHan(phien(BAY_GIO - 1), BAY_GIO)).toBe(false);
  });

  it('chưa có phiên thì không dùng', () => {
    expect(phienConHan(null, BAY_GIO)).toBe(false);
  });

  it('token SẮP hết hạn (còn 10 giây) bị coi là hết — tránh 401 giữa chừng', () => {
    // Không có biên an toàn thì tài xế bấm SOS lúc token còn 2 giây sẽ ăn 401
    // đúng lúc cần nhất.
    expect(phienConHan(phien(BAY_GIO + 10_000), BAY_GIO)).toBe(false);
  });

  it('token còn nhiều hơn biên an toàn 30 giây thì vẫn dùng', () => {
    expect(phienConHan(phien(BAY_GIO + 31_000), BAY_GIO)).toBe(true);
  });
});
