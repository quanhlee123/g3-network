import { describe, expect, it } from 'vitest';
import {
  BANG_MAN_HINH,
  MAN_HINH,
  duocVao,
  manHinhMoDau,
  manHinhThayThe,
  type TenManHinh,
} from './routes';

describe('Khung điều hướng app tài xế (F-D4)', () => {
  it('có đủ 10 màn hình tối thiểu của P1.0 theo INPUT-03 §2', () => {
    expect(Object.keys(BANG_MAN_HINH)).toHaveLength(10);
  });

  it('mỗi màn hình đều gắn ít nhất 1 mã PRD (quy tắc 1) và 1 mã wireframe', () => {
    for (const dinhNghia of Object.values(BANG_MAN_HINH)) {
      expect(dinhNghia.maPrd.length).toBeGreaterThan(0);
      for (const ma of dinhNghia.maPrd) expect(ma).toMatch(/^F-[A-K]\d$/);
      expect(dinhNghia.wireframe).toMatch(/^SCR-\d{2}$/);
    }
  });

  it('mã wireframe không trùng nhau', () => {
    const ma = Object.values(BANG_MAN_HINH).map((d) => d.wireframe);
    expect(new Set(ma).size).toBe(ma.length);
  });

  it('tiêu đề đều bằng tiếng Việt, không để trống (NF-12)', () => {
    for (const dinhNghia of Object.values(BANG_MAN_HINH)) {
      expect(dinhNghia.tieuDe.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('Luật vào màn hình — mặc định TỪ CHỐI (quy tắc 6)', () => {
  it('chưa đăng nhập thì mở app vào màn đăng nhập', () => {
    expect(manHinhMoDau(false)).toBe(MAN_HINH.dangNhap);
    expect(manHinhMoDau(true)).toBe(MAN_HINH.chinh);
  });

  it('CHỈ màn đăng nhập là vào được khi chưa đăng nhập', () => {
    const moKhiChuaDangNhap = (Object.keys(BANG_MAN_HINH) as TenManHinh[]).filter((ten) =>
      duocVao(ten, false),
    );
    expect(moKhiChuaDangNhap).toEqual([MAN_HINH.dangNhap]);
  });

  it('SOS cũng cần đăng nhập — endpoint /sos đòi token để biết xe và vị trí', () => {
    expect(duocVao(MAN_HINH.sos, false)).toBe(false);
    expect(duocVao(MAN_HINH.sos, true)).toBe(true);
  });

  it('đã đăng nhập thì vào được mọi màn hình', () => {
    for (const ten of Object.keys(BANG_MAN_HINH) as TenManHinh[]) {
      expect(duocVao(ten, true)).toBe(true);
    }
  });

  it('bị chặn thì đá về màn đăng nhập, không đứng im ở màn trắng', () => {
    expect(manHinhThayThe(MAN_HINH.phienSac, false)).toBe(MAN_HINH.dangNhap);
    expect(manHinhThayThe(MAN_HINH.phienSac, true)).toBe(MAN_HINH.phienSac);
  });

  it('tên màn hình lạ bị từ chối thay vì lọt qua', () => {
    expect(duocVao('khong-ton-tai' as TenManHinh, true)).toBe(false);
  });
});
