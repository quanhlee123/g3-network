// F-A1 — Tuyến GPS xấp xỉ theo các mốc dân cư chính. Xe chạy khứ hồi (đến cuối tuyến thì
// quay đầu) để chạy dài không bị teleport.
//
// D-10 (ĐÃ CHỐT 2026-07-29): có HAI tuyến để đội xe giả lập luôn chạy gần trạm sạc thật
// trong seed — trước đây tuyến chỉ ở miền Bắc còn trạm chỉ ở miền Nam, nên "trạm gần nhất"
// trong cảnh báo pin (F-A2) ra hơn 1.000 km, vô nghĩa về vận hành.

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

/**
 * Waypoint [lat, lng] xấp xỉ trục TP.HCM (Thủ Đức) → Long An (Tân An) qua QL1A/QL22,
 * đi sát 3 trạm seed miền Nam: G3-ST-001 Thủ Đức · G3-ST-002 Bình Chánh · G3-ST-003 Bến Lức.
 */
export const HCM_TAN_AN_ROUTE: ReadonlyArray<readonly [number, number]> = [
  [10.85, 106.75], // Thủ Đức (sát trạm G3-ST-001)
  [10.8142, 106.7215], // Cầu Sài Gòn
  [10.7769, 106.7009], // Quận 1 (Bến Thành)
  [10.7488, 106.6626], // Quận 8 (cầu Chà Và)
  [10.72, 106.6], // Bình Chánh (sát trạm G3-ST-002)
  [10.6871, 106.5423], // Tân Túc
  [10.63, 106.48], // Bến Lức (sát trạm G3-ST-003)
  [10.5352, 106.4131], // TP Tân An (Long An)
];

/** Tên tuyến dùng cho cờ `--route`. */
export const TUYEN = {
  bac: HANOI_LANG_SON_ROUTE,
  nam: HCM_TAN_AN_ROUTE,
} as const;

export type TenTuyen = keyof typeof TUYEN;
export const TEN_TUYEN = Object.keys(TUYEN) as TenTuyen[];

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

/** Dựng tuyến theo tên (`--route bac|nam`). */
export function buildRouteByName(ten: TenTuyen): Route {
  return buildRoute(TUYEN[ten]);
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
