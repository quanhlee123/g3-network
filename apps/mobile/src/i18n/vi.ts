// F-D4 — kho chuỗi tiếng Việt của app tài xế (NF-12: giao diện tiếng Việt).
// Toàn bộ chữ hiển thị nằm ở đây, KHÔNG viết thẳng vào component — để người không biết
// code vẫn sửa được câu chữ, và để rà lại giọng văn trước khi giao cho tài xế thật.
//
// Quy ước viết câu cho tài xế (persona: đang lái, ngoài nắng, có thể đeo găng):
// - Câu ngắn, chủ ngữ rõ, không dùng thuật ngữ kỹ thuật ("mất sóng" chứ không "network error").
// - Lỗi luôn kèm việc CẦN LÀM tiếp theo, không chỉ mô tả cái sai.
// - Không viết tắt tiếng Anh trừ đơn vị đã quen (kWh, km, SOC).

export const VI = {
  chung: {
    tenApp: 'G3 Network',
    tiepTuc: 'Tiếp tục',
    thuLai: 'Thử lại',
    huy: 'Huỷ',
    dangTai: 'Đang tải…',
  },

  dangNhap: {
    tieuDe: 'Đăng nhập',
    nhanSdt: 'Số điện thoại',
    goYSdt: 'Nhập số điện thoại của bạn',
    nutXinMa: 'Gửi mã xác nhận',
    nhanMa: 'Mã xác nhận',
    goYMa: 'Nhập 6 chữ số vừa nhận',
    nutXacNhan: 'Xác nhận',
    nutGuiLaiMa: 'Gửi lại mã',
    daGuiMa: 'Đã gửi mã xác nhận tới số {sdt}.',
    conLaiGiay: 'Gửi lại sau {giay} giây',
    sdtKhongHopLe: 'Số điện thoại chưa đúng. Nhập dạng 0912345678.',
    maChuaDuSo: 'Mã xác nhận gồm {soChuSo} chữ số.',
  },

  // Khớp với mã lỗi backend trả về ở apps/api/src/routes/auth.ts.
  loiDangNhap: {
    ma_khong_dung: 'Mã xác nhận không đúng. Kiểm tra lại tin nhắn.',
    ma_het_han: 'Mã đã hết hạn. Bấm "Gửi lại mã" để nhận mã mới.',
    qua_so_lan: 'Nhập sai quá số lần cho phép. Bấm "Gửi lại mã" để nhận mã mới.',
    sdt_khong_hop_le: 'Số điện thoại chưa đúng. Nhập dạng 0912345678.',
  },

  // Lỗi ở tầng mạng — backend không trả gì nên app tự sinh câu.
  loiMang: {
    mat_song: 'Mất sóng. Kiểm tra kết nối rồi thử lại.',
    qua_han: 'Mạng chậm quá, chưa nhận được phản hồi. Thử lại giúp tôi.',
    loi_may_chu: 'Hệ thống đang bận. Thử lại sau ít phút.',
    phan_hoi_hong: 'Nhận được dữ liệu lạ từ hệ thống. Thử lại giúp tôi.',
    khong_ro: 'Có lỗi xảy ra. Thử lại giúp tôi.',
  },

  phien: {
    hetHan: 'Phiên đăng nhập đã hết hạn. Đăng nhập lại giúp tôi.',
  },
} as const;

export type ViCatalog = typeof VI;
