// F-A1 — Test tuyến Hà Nội–Lạng Sơn: nội suy vị trí và chạy khứ hồi.
import { describe, expect, it } from 'vitest';
import { buildRoute, HANOI_LANG_SON_ROUTE, haversineKm, positionAtKm } from './route';

describe('tuyến Hà Nội – Lạng Sơn', () => {
  const route = buildRoute();

  it('dài khoảng 150 km và khoảng cách tích lũy tăng đơn điệu', () => {
    expect(route.lengthKm).toBeGreaterThan(120);
    expect(route.lengthKm).toBeLessThan(200);
    for (let i = 1; i < route.cumulativeKm.length; i++) {
      expect(route.cumulativeKm[i]!).toBeGreaterThan(route.cumulativeKm[i - 1]!);
    }
  });

  it('km 0 = Hà Nội, km cuối = Lạng Sơn', () => {
    expect(positionAtKm(route, 0)).toEqual(HANOI_LANG_SON_ROUTE[0]);
    const cuoi = positionAtKm(route, route.lengthKm);
    expect(cuoi[0]).toBeCloseTo(21.8537, 3);
    expect(cuoi[1]).toBeCloseTo(106.7615, 3);
  });

  it('mọi vị trí nội suy nằm trong khung tọa độ Việt Nam', () => {
    for (let km = 0; km <= route.lengthKm; km += 5) {
      const [lat, lng] = positionAtKm(route, km);
      expect(lat).toBeGreaterThan(20.5);
      expect(lat).toBeLessThan(22.5);
      expect(lng).toBeGreaterThan(105.5);
      expect(lng).toBeLessThan(107.5);
    }
  });

  it('chạy quá cuối tuyến thì quay đầu (khứ hồi), không teleport về Hà Nội', () => {
    const L = route.lengthKm;
    expect(positionAtKm(route, L + 10)).toEqual(positionAtKm(route, L - 10));
    expect(positionAtKm(route, 2 * L)).toEqual(positionAtKm(route, 0));
  });

  it('haversine: Hà Nội – Lạng Sơn đường chim bay ~130 km', () => {
    const km = haversineKm(
      HANOI_LANG_SON_ROUTE[0]!,
      HANOI_LANG_SON_ROUTE[HANOI_LANG_SON_ROUTE.length - 1]!,
    );
    expect(km).toBeGreaterThan(100);
    expect(km).toBeLessThan(160);
  });
});
