// Nghiệm thu tuần 8 — chọn khung giờ ToU cho kịch bản "sạc SAI khung giờ".
//
// Vấn đề: demo chạy vào bất kỳ giờ nào trong ngày, mà kịch bản đòi phiên sạc phải nằm NGOÀI
// khung giờ cho phép. Đặt cứng "22:00–06:00" thì chạy demo lúc 23h sẽ ra kết quả NGƯỢC với
// lời thuyết minh — trước Ban lãnh đạo thì đó là hỏng nặng hơn cả việc demo lỗi.
//
// Cách làm: dựng khung giờ cho phép LÙI VỀ QUÁ KHỨ so với lúc chạy. Khung
// [now − 6h, now − 3h) chắc chắn không chứa `now`, kể cả khi nó vắt qua nửa đêm.

/** Số phút kể từ nửa đêm ĐỊA PHƯƠNG. */
export function phutDiaPhuong(at: Date, muiGio: string): number {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: muiGio,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(at);
  const lay = (t: string): number => Number(p.find((x) => x.type === t)?.value ?? '0');
  return lay('hour') * 60 + lay('minute');
}

function hhmm(phut: number): string {
  const p = ((phut % 1440) + 1440) % 1440;
  return `${String(Math.floor(p / 60)).padStart(2, '0')}:${String(p % 60).padStart(2, '0')}`;
}

export interface KhungGio {
  from: string;
  to: string;
}

/**
 * Khung giờ cho phép sạc mà thời điểm `at` chắc chắn NẰM NGOÀI.
 *
 * `luiGio` / `daiGio` chọn sao cho khung kết thúc trước `at` một khoảng đủ dài để cả phiên
 * sạc của demo (vài phút) vẫn nằm ngoài khung.
 */
export function khungGioLoaiTru(at: Date, muiGio: string, luiGio = 6, daiGio = 3): KhungGio {
  const bayGio = phutDiaPhuong(at, muiGio);
  return {
    from: hhmm(bayGio - luiGio * 60),
    to: hhmm(bayGio - (luiGio - daiGio) * 60),
  };
}
