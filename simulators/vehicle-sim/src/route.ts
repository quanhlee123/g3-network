// F-A1 — Tuyến GPS thật: Hà Nội → Lạng Sơn dọc QL1A (~150 km), tọa độ xấp xỉ
// các mốc dân cư chính. Xe chạy khứ hồi (đến Lạng Sơn thì quay đầu) để chạy dài không bị teleport.

/** Waypoint [lat, lng] xấp xỉ dọc QL1A Hà Nội → Lạng Sơn. */
export const HANOI_LANG_SON_ROUTE: ReadonlyArray<readonly [number, number]> = [
  [21.0285, 105.8542], // Hà Nội (Hồ Gươm)
  [21.0421, 105.9199], // Gia Lâm
  [21.1181, 105.9611], // Từ Sơn
  [21.1861, 106.0763], // TP Bắc Ninh
  [21.2211, 106.0891], // Đáp Cầu (sông Cầu)
  [21.2409, 106.1358], // Việt Yên
  [21.2731, 106.1946], // TP Bắc Giang
  [21.3436, 106.2532], // Lạng Giang
  [21.4009, 106.2691], // Kép
  [21.5081, 106.3439], // Hữu Lũng
  [21.5972, 106.5013], // Cầu Sông Hóa
  [21.6592, 106.6053], // Đồng Mỏ (Chi Lăng)
  [21.7264, 106.6663], // Ải Chi Lăng
  [21.7902, 106.7146], // Bắc Thủy
  [21.8537, 106.7615], // TP Lạng Sơn
];

const EARTH_RADIUS_KM = 6371;

/** Khoảng cách haversine giữa 2 điểm [lat, lng], đơn vị km. */
export function haversineKm(a: readonly [number, number], b: readonly [number, number]): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export interface Route {
  points: ReadonlyArray<readonly [number, number]>;
  /** Khoảng cách tích lũy từ điểm đầu tới từng waypoint (km); phần tử cuối = tổng chiều dài. */
  cumulativeKm: number[];
  lengthKm: number;
}

/** Tính trước khoảng cách tích lũy để nội suy vị trí theo km. */
export function buildRoute(
  points: ReadonlyArray<readonly [number, number]> = HANOI_LANG_SON_ROUTE,
): Route {
  if (points.length < 2) throw new Error('Tuyến cần tối thiểu 2 waypoint');
  const cumulativeKm = [0];
  for (let i = 1; i < points.length; i++) {
    cumulativeKm.push(cumulativeKm[i - 1]! + haversineKm(points[i - 1]!, points[i]!));
  }
  return { points, cumulativeKm, lengthKm: cumulativeKm[cumulativeKm.length - 1]! };
}

/**
 * Vị trí [lat, lng] tại km thứ `routeKm` (nội suy tuyến tính giữa 2 waypoint).
 * Chạy quá chiều dài tuyến thì đi khứ hồi (ping-pong) — không teleport về đầu tuyến.
 */
export function positionAtKm(route: Route, routeKm: number): readonly [number, number] {
  const L = route.lengthKm;
  let km = ((routeKm % (2 * L)) + 2 * L) % (2 * L); // chuẩn hóa về [0, 2L)
  if (km > L) km = 2 * L - km; // chiều về

  const { points, cumulativeKm } = route;
  let i = 1;
  while (i < cumulativeKm.length - 1 && cumulativeKm[i]! < km) i++;
  const segStart = cumulativeKm[i - 1]!;
  const segLen = cumulativeKm[i]! - segStart;
  const t = segLen === 0 ? 0 : (km - segStart) / segLen;
  const [lat1, lng1] = points[i - 1]!;
  const [lat2, lng2] = points[i]!;
  return [lat1 + (lat2 - lat1) * t, lng1 + (lng2 - lng1) * t];
}
