// F-A1/F-C6 — Kịch bản "charge": xe đứng yên, SOC tăng đúng theo công suất sạc.
// Đây là chiều XE của đối soát 3 chiều (NF-10) — sai ở đây là đối soát báo lệch oan.
import { describe, expect, it } from 'vitest';
import { parseSimArgs } from './cli';
import { buildRoute, buildRouteByName, positionAtKm } from './route';
import { mulberry32 } from './rng';
import { createVehicle, tickVehicle } from './vehicle';

const route = buildRoute();
const T0 = Date.UTC(2026, 6, 1, 8, 0, 0);

function cauHinh(extra: string[] = []) {
  return parseSimArgs(['--scenario', 'charge', '--count', '1', ...extra], {});
}

describe('kịch bản charge', () => {
  it('SOC tăng đúng công thức kWh/dung lượng pin (xe 0001 = EVT-262, 105 kWh)', () => {
    const cfg = cauHinh(['--charge-power-kw', '105', '--charge-start-soc', '30']);
    const rand = mulberry32(1);
    let state = createVehicle(0, cfg, route, T0, rand);
    expect(state.model).toBe('EVT-262');
    expect(state.socPct).toBe(30);

    // 105 kW trên pin 105 kWh ⇒ đúng 100%/giờ ⇒ sau 30 phút phải là 30 + 50 = 80%
    const kq = tickVehicle(state, T0 + 30 * 60_000, cfg, route, rand);
    state = kq.state;

    expect(state.socPct).toBeCloseTo(80, 6);
    expect(state.phase).toBe('charging');
    expect(kq.record?.speed_kmh).toBe(0); // đang cắm sạc thì không chạy
  });

  it('odometer đứng yên trong lúc sạc', () => {
    const cfg = cauHinh();
    const rand = mulberry32(1);
    const state = createVehicle(0, cfg, route, T0, rand);
    const kq = tickVehicle(state, T0 + 10 * 60_000, cfg, route, rand);

    expect(kq.record?.odometer_km).toBeCloseTo(state.odometerKm, 1);
  });

  it('SOC không vượt quá 100% dù sạc rất lâu', () => {
    const cfg = cauHinh(['--charge-power-kw', '350', '--charge-start-soc', '90']);
    const rand = mulberry32(1);
    const state = createVehicle(0, cfg, route, T0, rand);

    const kq = tickVehicle(state, T0 + 5 * 3_600_000, cfg, route, rand);

    expect(kq.state.socPct).toBe(100);
  });
});

describe('--route (D-10: hai hành lang có trạm sạc)', () => {
  it('mặc định là tuyến miền Bắc Hà Nội – Lạng Sơn', () => {
    const cfg = parseSimArgs(['--count', '1'], {});
    expect(cfg.route).toBe('bac');
  });

  it('--route nam cho tuyến TP.HCM – Tân An, xe khởi hành đúng vùng', () => {
    const cfg = parseSimArgs(['--count', '1', '--route', 'nam'], {});
    expect(cfg.route).toBe('nam');

    const tuyenNam = buildRouteByName('nam');
    const [lat, lng] = positionAtKm(tuyenNam, 0);
    expect(lat).toBeCloseTo(10.85, 2); // Thủ Đức, không phải Hà Nội
    expect(lng).toBeCloseTo(106.75, 2);
  });

  it('hai tuyến có chiều dài hợp lý và khác nhau', () => {
    const bac = buildRouteByName('bac');
    const nam = buildRouteByName('nam');
    expect(bac.lengthKm).toBeGreaterThan(100);
    expect(nam.lengthKm).toBeGreaterThan(40);
    expect(Math.abs(bac.lengthKm - nam.lengthKm)).toBeGreaterThan(10);
  });

  it('kịch bản xấu — tên tuyến lạ bị từ chối kèm gợi ý', () => {
    expect(() => parseSimArgs(['--route', 'tay'], {})).toThrow(/--route không hợp lệ.*bac.*nam/s);
  });
});

describe('--vin-start (chạy nhiều tiến trình simulator song song)', () => {
  it('dời dải VIN, không đụng tiến trình khác', () => {
    const cfg = cauHinh(['--vin-start', '20']);
    const state = createVehicle(0, cfg, route, T0, mulberry32(1));

    expect(state.vin).toBe('G3-SIM-0020');
  });

  it('mặc định vẫn bắt đầu từ 0001 (giữ nguyên hành vi cũ)', () => {
    const cfg = parseSimArgs(['--count', '2'], {});
    expect(createVehicle(0, cfg, route, T0, mulberry32(1)).vin).toBe('G3-SIM-0001');
    expect(createVehicle(1, cfg, route, T0, mulberry32(1)).vin).toBe('G3-SIM-0002');
  });

  it('dòng xe theo VIN khớp seed: 0001→EVT-262, 0009→EVT-400, 0016→EVT-825', () => {
    const cfg = parseSimArgs(['--count', '1'], {});
    const modelCua = (vinStart: number) =>
      createVehicle(0, { ...cfg, vinStart }, route, T0, mulberry32(1)).model;

    expect(modelCua(1)).toBe('EVT-262');
    expect(modelCua(8)).toBe('EVT-262');
    expect(modelCua(9)).toBe('EVT-400');
    expect(modelCua(15)).toBe('EVT-400');
    expect(modelCua(16)).toBe('EVT-825');
    expect(modelCua(20)).toBe('EVT-825');
  });
});
