// F-B5 — Nội dung cảnh báo vi phạm sạc gửi cho tài xế / chủ xe.
//
// Tiêu chí F-B5 (sheet 4): "nêu rõ HÀNH VI & CÁCH KHẮC PHỤC". Đây là lý do file này tồn tại
// tách khỏi phần phát hiện: một dòng "vi phạm chính sách sạc" là thông báo vô dụng — tài xế
// đứng ở trạm lúc 2 giờ sáng không suy ra được mình phải làm gì.
//
// Ba ràng buộc khi viết câu:
//   - Tiếng Việt, chữ số cụ thể, không thuật ngữ kỹ thuật (NF-12, NF-17).
//   - Nói ĐƯỢC PHÉP làm gì, không chỉ nói cấm gì.
//   - Không doạ mất bảo hành như một sự đã rồi: Q4 (DECISION-LOG) còn MỞ, chế tài do hợp
//     đồng quyết chứ không phải phần mềm. Câu chữ ở đây dừng ở "ảnh hưởng quyền lợi".
import { moTaKhungGio, type KhungGio } from '../policies/policy';

export type LoaiViPham =
  'outside_hours' | 'soc_above_max' | 'soc_below_min' | 'overpower' | 'duration_exceeded';

/** Số liệu cụ thể của một kết luận vi phạm — vào cả evidence lẫn nội dung cảnh báo. */
export interface SoLieuViPham {
  khung_gio?: KhungGio[];
  so_phut_ngoai_khung?: number;
  soc_pct?: number;
  soc_nguong_pct?: number;
  so_lan?: number;
  so_lan_nguong?: number;
  so_ngay_cua_so?: number;
  cong_suat_kw?: number;
  cong_suat_nguong_kw?: number;
  thoi_luong_phut?: number;
  thoi_luong_nguong_phut?: number;
}

export interface NoiDungCanhBao {
  tieu_de: string;
  hanh_vi: string;
  khac_phuc: string;
}

/** Mức nguy cơ theo loại — vào cột violations.risk_level. */
export const NGUY_CO_THEO_LOAI: Record<LoaiViPham, 'low' | 'medium' | 'high'> = {
  // Sạc sai khung giờ là chuyện giá điện & cam kết hợp đồng, không hại pin trực tiếp.
  outside_hours: 'low',
  duration_exceeded: 'low',
  // Vượt công suất cho phép làm pin nóng hơn thiết kế — hại thật nhưng từng lần một.
  overpower: 'medium',
  // Hai loại dưới đây chỉ được kết luận khi ĐÃ LẶP LẠI nhiều lần (F-B3 "thường xuyên"),
  // và đó đúng là hai hành vi bào mòn pin nhanh nhất: thường xuyên sạc đầy kịch và
  // thường xuyên xả kiệt. Đây là nhóm ảnh hưởng quyền lợi bảo hành rõ rệt nhất.
  soc_above_max: 'high',
  soc_below_min: 'high',
};

/**
 * Mức nặng của cảnh báo (alerts.severity).
 *
 * CỐ Ý không bao giờ trả 3: severity 3 xuyên thủng rate-limit và bắn SMS (ADR-008), chỗ đó
 * dành cho nguy hiểm tính mạng — pin sắp cháy, SOS. Vi phạm hợp đồng sạc, dù nặng, vẫn là
 * việc xử lý trong ngày. Đánh đồng hai loại sẽ làm người nhận quen với chuông báo động.
 */
export function mucNangCanhBao(loai: LoaiViPham): 1 | 2 {
  return NGUY_CO_THEO_LOAI[loai] === 'low' ? 1 : 2;
}

export function noiDungCanhBao(loai: LoaiViPham, s: SoLieuViPham, vin: string): NoiDungCanhBao {
  switch (loai) {
    case 'outside_hours':
      return {
        tieu_de: `Xe ${vin}: sạc ngoài khung giờ cho phép`,
        hanh_vi:
          `Phiên sạc vừa rồi có ${lamTron(s.so_phut_ngoai_khung)} phút nằm ngoài khung giờ ` +
          `được phép của hợp đồng (${s.khung_gio ? moTaKhungGio(s.khung_gio) : 'theo chính sách'}).`,
        khac_phuc:
          `Lần sau hãy bắt đầu và kết thúc phiên sạc trong khung ` +
          `${s.khung_gio ? moTaKhungGio(s.khung_gio) : 'giờ cho phép'}. Nếu chuyến đi buộc phải ` +
          'sạc ngoài giờ, báo quản lý đội để xin điều chỉnh chính sách trước khi sạc.',
      };
    case 'soc_above_max':
      return {
        tieu_de: `Xe ${vin}: thường xuyên sạc quá ${s.soc_nguong_pct}%`,
        hanh_vi:
          `Đã ${s.so_lan} lần sạc vượt mức ${s.soc_nguong_pct}% trong ${s.so_ngay_cua_so} ngày ` +
          `qua (lần này lên ${lamTron(s.soc_pct)}%). Sạc đầy kịch thường xuyên làm pin chai nhanh ` +
          'và ảnh hưởng quyền lợi bảo hành.',
        khac_phuc:
          `Dừng sạc quanh mức ${s.soc_nguong_pct}% cho các chuyến chạy hằng ngày. Chỉ sạc đầy ` +
          'hơn khi thật sự cần cho chuyến dài, và nên đi ngay sau khi sạc xong thay vì để xe đầy pin qua đêm.',
      };
    case 'soc_below_min':
      return {
        tieu_de: `Xe ${vin}: thường xuyên để pin cạn dưới ${s.soc_nguong_pct}%`,
        hanh_vi:
          `Đã ${s.so_lan} lần vào trạm khi pin dưới ${s.soc_nguong_pct}% trong ${s.so_ngay_cua_so} ` +
          `ngày qua (lần này còn ${lamTron(s.soc_pct)}%). Xả kiệt thường xuyên làm giảm tuổi thọ pin ` +
          'và ảnh hưởng quyền lợi bảo hành.',
        khac_phuc:
          `Hãy vào trạm khi pin còn trên ${s.soc_nguong_pct}%. Xem gợi ý trạm gần nhất trong app ` +
          'ngay khi nhận cảnh báo pin yếu, đừng đợi tới mức cạn.',
      };
    case 'overpower':
      return {
        tieu_de: `Xe ${vin}: sạc vượt công suất cho phép`,
        hanh_vi:
          `Phiên sạc đạt ${lamTron(s.cong_suat_kw)} kW, vượt mức ${s.cong_suat_nguong_kw} kW mà ` +
          'chính sách bảo hành cho phép. Sạc nhanh quá mức làm pin nóng hơn thiết kế.',
        khac_phuc:
          `Chọn trụ hoặc chế độ sạc có công suất tối đa ${s.cong_suat_nguong_kw} kW. Nếu trụ không ` +
          'chọn được mức công suất, báo quản lý đội để đổi trạm cho các lần sau.',
      };
    case 'duration_exceeded':
      return {
        tieu_de: `Xe ${vin}: phiên sạc kéo dài quá quy định`,
        hanh_vi:
          `Phiên sạc kéo dài ${lamTron(s.thoi_luong_phut)} phút, vượt mức ` +
          `${s.thoi_luong_nguong_phut} phút của chính sách.`,
        khac_phuc:
          `Rút súng sạc trong vòng ${s.thoi_luong_nguong_phut} phút. Nếu cần cắm lâu hơn vì lý do ` +
          'vận hành, báo quản lý đội trước để ghi nhận.',
      };
  }
}

function lamTron(v: number | undefined): string {
  if (v === undefined) return '—';
  return String(Math.round(v * 10) / 10);
}
