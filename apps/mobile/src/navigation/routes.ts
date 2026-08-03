// F-D4 — bảng màn hình và luật điều hướng của app tài xế.
//
// ⚠️ PHẠM VI: đây mới là KHUNG điều hướng (có những màn hình nào, màn nào cần đăng nhập,
// vào app thì rơi vào đâu). BỐ CỤC từng màn hình chờ wireframe của Thiết kế theo chuẩn
// INPUT-03 §2 — xem docs/design/YEU-CAU-WIREFRAME.md. Danh sách dưới đây bám đúng
// 10 màn hình tối thiểu mà INPUT-03 liệt kê cho P1.0, để khi wireframe về thì chỉ việc
// gắn giao diện vào chỗ đã có sẵn.

export const MAN_HINH = {
  dangNhap: 'dang-nhap',
  chinh: 'chinh',
  banDoTram: 'ban-do-tram',
  chiTietTram: 'chi-tiet-tram',
  quetQr: 'quet-qr',
  phienSac: 'phien-sac',
  bienNhan: 'bien-nhan',
  sos: 'sos',
  danhSachCanhBao: 'danh-sach-canh-bao',
  dongY: 'dong-y-du-lieu',
} as const;

export type TenManHinh = (typeof MAN_HINH)[keyof typeof MAN_HINH];

export interface DinhNghiaManHinh {
  ten: TenManHinh;
  /** Mã PRD mà màn hình phục vụ (quy tắc 1). */
  maPrd: string[];
  /** Phải đăng nhập mới vào được. */
  canDangNhap: boolean;
  /** Tiêu đề tiếng Việt hiển thị trên thanh điều hướng. */
  tieuDe: string;
  /** Mã wireframe tương ứng trong docs/design/screens/ (chưa có file — chờ Thiết kế). */
  wireframe: string;
}

export const BANG_MAN_HINH: Record<TenManHinh, DinhNghiaManHinh> = {
  [MAN_HINH.dangNhap]: {
    ten: MAN_HINH.dangNhap,
    maPrd: ['F-D4', 'F-F1'],
    canDangNhap: false,
    tieuDe: 'Đăng nhập',
    wireframe: 'SCR-01',
  },
  [MAN_HINH.chinh]: {
    ten: MAN_HINH.chinh,
    maPrd: ['F-D4'],
    canDangNhap: true,
    tieuDe: 'Trang chính',
    wireframe: 'SCR-02',
  },
  [MAN_HINH.banDoTram]: {
    ten: MAN_HINH.banDoTram,
    maPrd: ['F-D1'],
    canDangNhap: true,
    tieuDe: 'Bản đồ trạm sạc',
    wireframe: 'SCR-03',
  },
  [MAN_HINH.chiTietTram]: {
    ten: MAN_HINH.chiTietTram,
    maPrd: ['F-D1', 'F-C2'],
    canDangNhap: true,
    tieuDe: 'Chi tiết trạm',
    wireframe: 'SCR-04',
  },
  [MAN_HINH.quetQr]: {
    ten: MAN_HINH.quetQr,
    maPrd: ['F-H1'],
    canDangNhap: true,
    tieuDe: 'Quét mã trụ sạc',
    wireframe: 'SCR-05',
  },
  [MAN_HINH.phienSac]: {
    ten: MAN_HINH.phienSac,
    maPrd: ['F-H1', 'F-C2'],
    canDangNhap: true,
    tieuDe: 'Đang sạc',
    wireframe: 'SCR-06',
  },
  [MAN_HINH.bienNhan]: {
    ten: MAN_HINH.bienNhan,
    maPrd: ['F-H1', 'F-H3'],
    canDangNhap: true,
    tieuDe: 'Biên nhận',
    wireframe: 'SCR-07',
  },
  [MAN_HINH.sos]: {
    ten: MAN_HINH.sos,
    maPrd: ['F-I2'],
    // SOS KHÔNG mở cho người chưa đăng nhập: endpoint /sos của backend cần token để
    // biết xe nào, tài xế nào, đính kèm SOC và vị trí. Trường hợp tài xế chưa đăng nhập
    // mà gặp sự cố thì lối thoát là gọi hotline — phần đó thuộc D-09/Q6, còn MỞ.
    canDangNhap: true,
    tieuDe: 'Khẩn cấp',
    wireframe: 'SCR-08',
  },
  [MAN_HINH.danhSachCanhBao]: {
    ten: MAN_HINH.danhSachCanhBao,
    maPrd: ['F-A2', 'F-F3'],
    canDangNhap: true,
    tieuDe: 'Cảnh báo',
    wireframe: 'SCR-09',
  },
  [MAN_HINH.dongY]: {
    ten: MAN_HINH.dongY,
    maPrd: ['F-F2', 'F-G4'],
    canDangNhap: true,
    tieuDe: 'Đồng ý sử dụng dữ liệu',
    wireframe: 'SCR-10',
  },
};

/**
 * Màn hình mở đầu tuỳ theo đã đăng nhập hay chưa.
 * Mặc định là TỪ CHỐI (quy tắc 6): chưa đăng nhập thì luôn về màn đăng nhập.
 */
export function manHinhMoDau(daDangNhap: boolean): TenManHinh {
  return daDangNhap ? MAN_HINH.chinh : MAN_HINH.dangNhap;
}

/** Có được vào màn hình này với trạng thái đăng nhập hiện tại không. */
export function duocVao(ten: TenManHinh, daDangNhap: boolean): boolean {
  const dinhNghia = BANG_MAN_HINH[ten];
  if (!dinhNghia) return false;
  return dinhNghia.canDangNhap ? daDangNhap : true;
}

/** Bị chặn thì đá về đâu. */
export function manHinhThayThe(ten: TenManHinh, daDangNhap: boolean): TenManHinh {
  return duocVao(ten, daDangNhap) ? ten : manHinhMoDau(daDangNhap);
}
