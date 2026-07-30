// D-10 — Khoá lại tính NHẤT QUÁN ĐỊA LÝ giữa dữ liệu seed và tuyến của simulator.
//
// Lỗi đã xảy ra thật: seed đặt cả 3 trạm quanh TP.HCM còn vehicle-sim chỉ chạy tuyến
// Hà Nội – Lạng Sơn, nên cảnh báo pin F-A2 gợi ý "trạm gần nhất cách 1.130,5 km". Đúng về
// toán, vô nghĩa về vận hành — và nó đã lên tới bảng demo Gate 0 trước khi bị phát hiện.
//
// Test này là hàng rào: thêm tuyến mới mà quên thêm trạm (hoặc ngược lại) là test đỏ ngay.
import { describe, expect, it } from 'vitest';
import { SEED_STATIONS } from '@g3/db';
import { buildRouteByName, haversineKm, positionAtKm, TEN_TUYEN } from '@g3/vehicle-sim';

/** Xe tải điện không thể coi một trạm cách xa hơn mức này là "gợi ý điều hướng". */
const KHOANG_CACH_TOI_DA_KM = 60;

/** Khoảng cách từ một điểm [lat, lng] tới trạm seed gần nhất. */
function kmToiTramGanNhat(diem: readonly [number, number]): { km: number; code: string } {
  let tot = { km: Number.POSITIVE_INFINITY, code: '' };
  for (const s of SEED_STATIONS) {
    const km = haversineKm(diem, [s.lat, s.lon]);
    if (km < tot.km) tot = { km, code: s.code };
  }
  return tot;
}

describe('D-10 — mọi tuyến simulator đều có trạm sạc trong tầm với', () => {
  it.each(TEN_TUYEN)('tuyến "%s": mọi điểm trên tuyến có trạm trong %s km', (ten) => {
    const route = buildRouteByName(ten);

    // Quét dọc tuyến mỗi 5 km thay vì chỉ tại waypoint — khoảng trống giữa 2 waypoint
    // cũng là chỗ xe có thể tụt pin.
    const xa: { km: number; code: string; taiKm: number }[] = [];
    for (let km = 0; km <= route.lengthKm; km += 5) {
      const gan = kmToiTramGanNhat(positionAtKm(route, km));
      if (gan.km > KHOANG_CACH_TOI_DA_KM) xa.push({ ...gan, taiKm: km });
    }

    expect(
      xa,
      `tuyến ${ten} có ${xa.length} điểm cách trạm gần nhất quá ${KHOANG_CACH_TOI_DA_KM} km ` +
        `(xa nhất: ${Math.round(xa[0]?.km ?? 0)} km tại km ${xa[0]?.taiKm ?? 0})`,
    ).toEqual([]);
  });

  it('mỗi hành lang có ít nhất 3 trạm phục vụ', () => {
    for (const ten of TEN_TUYEN) {
      const route = buildRouteByName(ten);
      const phucVu = new Set<string>();
      for (let km = 0; km <= route.lengthKm; km += 5) {
        const gan = kmToiTramGanNhat(positionAtKm(route, km));
        if (gan.km <= KHOANG_CACH_TOI_DA_KM) phucVu.add(gan.code);
      }
      expect(phucVu.size, `tuyến ${ten} chỉ có ${phucVu.size} trạm phục vụ`).toBeGreaterThanOrEqual(
        3,
      );
    }
  });

  it('mã trạm trong seed không trùng nhau', () => {
    const ma = SEED_STATIONS.map((s) => s.code);
    expect(new Set(ma).size).toBe(ma.length);
  });
});
