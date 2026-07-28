// F-C6/NF-10 — Suy ra SOC của xe tại một thời điểm bất kỳ từ chuỗi bản ghi telematics.
// Hàm THUẦN, không I/O — đây là phần dễ sai nhất của đối soát nên phải test kỹ riêng.
//
// VÌ SAO NỘI SUY chứ không lấy bản ghi gần nhất: telemetry gửi mỗi ~10s, còn mốc bắt đầu/
// kết thúc phiên sạc do TRỤ báo. Lấy điểm gần nhất tạo sai số tới ~0.5% SOC ở mỗi đầu;
// với phiên nạp ~8% SOC thì riêng sai số biên đã ăn gần hết ngưỡng 1% của NF-10.

export interface DiemSoc {
  timeMs: number;
  socPct: number;
}

export interface KetQuaSoc {
  socPct: number;
  /** 'noi_suy' = kẹp giữa 2 bản ghi · 'gan_nhat' = chỉ có 1 phía, lấy điểm gần nhất. */
  cach: 'noi_suy' | 'gan_nhat' | 'trung_khop';
  /** Khoảng cách thời gian (giây) tới bản ghi gần nhất — dùng để đánh giá độ tin cậy. */
  lech_giay: number;
}

/**
 * SOC tại thời điểm `tMs`.
 * @param diem chuỗi bản ghi ĐÃ SẮP XẾP tăng dần theo thời gian
 * @param cuaSoGiay bản ghi xa hơn ngần này thì coi như không có dữ liệu (trả null)
 */
export function socTaiThoiDiem(
  diem: readonly DiemSoc[],
  tMs: number,
  cuaSoGiay: number,
): KetQuaSoc | null {
  if (diem.length === 0) return null;
  const cuaSoMs = cuaSoGiay * 1000;

  let truoc: DiemSoc | null = null;
  let sau: DiemSoc | null = null;
  for (const d of diem) {
    if (d.timeMs === tMs) {
      return { socPct: d.socPct, cach: 'trung_khop', lech_giay: 0 };
    }
    if (d.timeMs < tMs) truoc = d;
    else {
      sau = d;
      break; // đã sắp xếp tăng dần nên điểm đầu tiên lớn hơn tMs chính là điểm sau gần nhất
    }
  }

  if (truoc && sau) {
    const ty = (tMs - truoc.timeMs) / (sau.timeMs - truoc.timeMs);
    const gan = Math.min(tMs - truoc.timeMs, sau.timeMs - tMs);
    if (gan > cuaSoMs) return null; // hai bản ghi kẹp nhưng cách quá xa: khoảng trống dữ liệu
    return {
      socPct: truoc.socPct + (sau.socPct - truoc.socPct) * ty,
      cach: 'noi_suy',
      lech_giay: Math.round(gan / 1000),
    };
  }

  const mot = truoc ?? sau;
  if (!mot) return null;
  const lech = Math.abs(mot.timeMs - tMs);
  if (lech > cuaSoMs) return null;
  return { socPct: mot.socPct, cach: 'gan_nhat', lech_giay: Math.round(lech / 1000) };
}

/**
 * Năng lượng LẤY TỪ LƯỚI ước tính từ chiều telematics.
 * ΔSOC × dung lượng pin = năng lượng VÀO PIN; chia hiệu suất sạc để quy về đầu công tơ trụ.
 * Xem docs/adr/ADR-007-hieu-suat-sac-doi-soat.md — Phase 1 để hiệu suất = 1.0 vì simulator
 * sinh dữ liệu lý tưởng; phần cứng thật BẮT BUỘC hiệu chuẩn lại trước Gate 1.
 */
export function kwhTuTelematics(
  socDauPct: number,
  socCuoiPct: number,
  dungLuongKwh: number,
  hieuSuat: number,
): number {
  const vaoPin = ((socCuoiPct - socDauPct) / 100) * dungLuongKwh;
  return vaoPin / hieuSuat;
}

/** Lệch tương đối (%) giữa một chiều và chiều tham chiếu (công tơ trụ). */
export function lechPhanTram(giaTri: number, thamChieu: number): number {
  if (thamChieu === 0) return giaTri === 0 ? 0 : Number.POSITIVE_INFINITY;
  return (Math.abs(giaTri - thamChieu) / thamChieu) * 100;
}
