// F-C1 · F-C2 — CRUD danh mục trạm + bản đồ trạm cho app.
//
// Ranh giới được kiểm tra kỹ nhất ở đây: Vận hành sửa được trạng thái KHAI THÁC của TRẠM,
// nhưng KHÔNG sửa được trạng thái của TỪNG TRỤ. Trạng thái trụ là số đo từ OCPP (F-C2,
// NF-02 ≤30s, "chính xác ≥99%") — mở đường ghi tay là làm hỏng chính tiêu chí đó.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, loginAs, type Harness } from '../test/app-harness';
import { seedWorld, type TestWorld } from '../test/world';

let h: Harness;
let w: TestWorld;
let vanHanh: string;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  w = await seedWorld(h.db);
  vanHanh = await loginAs(h.app, w.users.energy_ops.phone);
});

const TRAM_MOI = {
  code: 'G3-ST-TEST-NEW',
  name: 'Trạm sạc test mới (GIẢ)',
  lat: 10.9,
  lng: 106.8,
  area: 'TP.HCM — Test mới',
  total_power_kw: 360,
  operating_hours: '24/7',
  connectors: [
    { ocpp_connector_id: 1, max_power_kw: 120 },
    { ocpp_connector_id: 2, max_power_kw: 180, standard: 'CCS2' },
  ],
};

describe('F-C1 — CRUD trạm (sheet 9: Vận hành G3 Energy ✓)', () => {
  it('Vận hành tạo được trạm kèm trụ; trụ mới mặc định Available', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/stations',
      headers: { authorization: vanHanh },
      payload: TRAM_MOI,
    });

    expect(res.statusCode, res.body).toBe(201);
    const t = res.json();
    expect(t.code).toBe('G3-ST-TEST-NEW');
    expect(t.lat).toBeCloseTo(10.9, 5);
    expect(t.lng).toBeCloseTo(106.8, 5);
    expect(t.connectors).toHaveLength(2);
    expect(t.connectors_total).toBe(2);
    expect(t.connectors_available).toBe(2);
    expect((t.connectors as { max_power_kw: number }[])[1]!.max_power_kw).toBe(180);
  });

  it('sửa được trạng thái KHAI THÁC của trạm sang bảo trì', async () => {
    const res = await h.app.inject({
      method: 'PATCH',
      url: `/stations/${w.stationId}`,
      headers: { authorization: vanHanh },
      payload: { status: 'maintenance', note: 'Thay tủ điện, dự kiến 2 ngày' },
    });

    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().status).toBe('maintenance');
    const db = await h.db.query(
      `SELECT status::text AS status, note, updated_by FROM charging_stations WHERE id = $1`,
      [w.stationId],
    );
    expect(db.rows[0]!.status).toBe('maintenance');
    expect(db.rows[0]!.note).toContain('tủ điện');
    // Dấu vết ai sửa — không có thì mỗi lần trạm biến mất khỏi bản đồ lại phải đi hỏi vòng
    expect(db.rows[0]!.updated_by).toBe(w.users.energy_ops.id);
  });

  it('thêm trụ vào trạm đã có', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: `/stations/${w.stationId}/connectors`,
      headers: { authorization: vanHanh },
      payload: { ocpp_connector_id: 2, max_power_kw: 150 },
    });

    expect(res.statusCode, res.body).toBe(201);
    expect(res.json().ocpp_connector_id).toBe(2);
    expect(res.json().status).toBe('Available');
  });

  it('sửa công suất trụ (không đụng trạng thái)', async () => {
    const res = await h.app.inject({
      method: 'PATCH',
      url: `/stations/${w.stationId}/connectors/${w.connectorId}`,
      headers: { authorization: vanHanh },
      payload: { max_power_kw: 200 },
    });

    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().max_power_kw).toBe(200);
    expect(res.json().status).toBe('Available');
  });
});

describe('F-C2 — trạng thái TRỤ chỉ đến từ OCPP, không sửa được qua API', () => {
  it('gửi status trong body PATCH trụ bị schema từ chối', async () => {
    // Nếu ca này thành 200 thì tiêu chí F-C2 "trạng thái súng chính xác ≥99%" hết ý nghĩa:
    // con số đó sẽ đo độ chăm chỉ của người nhập liệu, không đo trụ.
    const res = await h.app.inject({
      method: 'PATCH',
      url: `/stations/${w.stationId}/connectors/${w.connectorId}`,
      headers: { authorization: vanHanh },
      payload: { status: 'Faulted' },
    });

    expect(res.statusCode).toBe(400);
    const con = await h.db.query(`SELECT status::text AS status FROM connectors WHERE id = $1`, [
      w.connectorId,
    ]);
    expect(con.rows[0]!.status).toBe('Available');
  });

  it('KHÔNG có endpoint nào ghi connectors.status trong đặc tả OpenAPI', async () => {
    const spec = h.app.swagger() as {
      paths: Record<string, Record<string, { requestBody?: unknown }>>;
    };
    const coTruongStatus: string[] = [];
    for (const [duongDan, methods] of Object.entries(spec.paths)) {
      if (!duongDan.includes('connector')) continue;
      for (const [method, op] of Object.entries(methods)) {
        if (method === 'get') continue;
        if (JSON.stringify(op.requestBody ?? {}).includes('"status"')) {
          coTruongStatus.push(`${method.toUpperCase()} ${duongDan}`);
        }
      }
    }
    expect(coTruongStatus).toEqual([]);
  });
});

describe('F-C1 — kịch bản xấu', () => {
  it('trùng mã trạm → 409 (mã trạm là ChargePoint identity của OCPP)', async () => {
    await h.app.inject({
      method: 'POST',
      url: '/stations',
      headers: { authorization: vanHanh },
      payload: TRAM_MOI,
    });

    const res = await h.app.inject({
      method: 'POST',
      url: '/stations',
      headers: { authorization: vanHanh },
      payload: { ...TRAM_MOI, name: 'Trạm khác cùng mã' },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('ma_tram_da_ton_tai');
  });

  it('hai trụ trùng số trong cùng một lần tạo → 400', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/stations',
      headers: { authorization: vanHanh },
      payload: {
        ...TRAM_MOI,
        code: 'G3-ST-TRUNG-TRU',
        connectors: [
          { ocpp_connector_id: 1, max_power_kw: 120 },
          { ocpp_connector_id: 1, max_power_kw: 150 },
        ],
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('tru_trung_so');
  });

  it('thêm trụ trùng số vào trạm đã có → 409', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: `/stations/${w.stationId}/connectors`,
      headers: { authorization: vanHanh },
      payload: { ocpp_connector_id: 1, max_power_kw: 150 },
    });

    expect(res.statusCode).toBe(409);
  });

  it('đổi vị trí mà chỉ gửi lat → 400, không ghi toạ độ nửa vời', async () => {
    const res = await h.app.inject({
      method: 'PATCH',
      url: `/stations/${w.stationId}`,
      headers: { authorization: vanHanh },
      payload: { lat: 21.0 },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('thieu_toa_do');
  });

  it('PATCH trạm không tồn tại → 404', async () => {
    const res = await h.app.inject({
      method: 'PATCH',
      url: '/stations/00000000-0000-0000-0000-000000000000',
      headers: { authorization: vanHanh },
      payload: { name: 'Không có thật' },
    });

    expect(res.statusCode).toBe(404);
  });

  it('tài xế / QL đội / Bảo hành KHÔNG sửa được danh mục trạm', async () => {
    for (const role of ['driver', 'fleet_manager', 'warranty_admin'] as const) {
      const token = await loginAs(h.app, w.users[role].phone);
      const res = await h.app.inject({
        method: 'PATCH',
        url: `/stations/${w.stationId}`,
        headers: { authorization: token },
        payload: { status: 'inactive' },
      });

      expect(res.statusCode, `${role} không được sửa trạm`).toBe(403);
    }
  });
});

describe('F-C2 — bản đồ trạm cho app', () => {
  beforeEach(async () => {
    // Thêm 1 trạm xa (Hà Nội) để kiểm tra lọc bán kính — thế giới test chỉ có 1 trạm TP.HCM
    await h.db.query(
      `INSERT INTO charging_stations (code, name, location, area, total_power_kw)
       VALUES ('G3-ST-TEST-HN', 'Trạm test Hà Nội (GIẢ)',
               ST_SetSRID(ST_MakePoint(105.85, 21.02), 4326)::geography, 'Hà Nội — Test', 240)`,
    );
  });

  it('trả trạm kèm toạ độ và tổng hợp trạng thái trụ', async () => {
    const token = await loginAs(h.app, w.users.driver.phone);

    const res = await h.app.inject({
      method: 'GET',
      url: '/stations/map',
      headers: { authorization: token },
    });

    expect(res.statusCode, res.body).toBe(200);
    const items = res.json().items as { code: string; lat: number; connectors_total: number }[];
    expect(items.length).toBeGreaterThanOrEqual(2);
    const tram = items.find((i) => i.code === 'G3-TEST-ST-01')!;
    expect(tram.lat).toBeCloseTo(10.8, 3);
    expect(tram.connectors_total).toBe(1);
  });

  it('sắp xếp theo khoảng cách và lọc trong bán kính khi có toạ độ', async () => {
    const token = await loginAs(h.app, w.users.driver.phone);

    const res = await h.app.inject({
      method: 'GET',
      url: '/stations/map?lat=10.8&lng=106.7&ban_kinh_km=50',
      headers: { authorization: token },
    });

    expect(res.statusCode).toBe(200);
    const items = res.json().items as { code: string; khoang_cach_km: number }[];
    // Trạm Hà Nội cách hơn 1.100 km → phải bị loại khỏi bán kính 50 km
    expect(items.map((i) => i.code)).toEqual(['G3-TEST-ST-01']);
    expect(items[0]!.khoang_cach_km).toBeLessThan(1);
  });

  it('trạm đang bảo trì KHÔNG hiện trên bản đồ điều hướng mặc định', async () => {
    await h.app.inject({
      method: 'PATCH',
      url: `/stations/${w.stationId}`,
      headers: { authorization: vanHanh },
      payload: { status: 'maintenance' },
    });
    const token = await loginAs(h.app, w.users.driver.phone);

    const macDinh = await h.app.inject({
      method: 'GET',
      url: '/stations/map',
      headers: { authorization: token },
    });
    const loc = await h.app.inject({
      method: 'GET',
      url: '/stations/map?status=maintenance',
      headers: { authorization: token },
    });

    expect((macDinh.json().items as { code: string }[]).map((i) => i.code)).not.toContain(
      'G3-TEST-ST-01',
    );
    expect((loc.json().items as { code: string }[]).map((i) => i.code)).toEqual(['G3-TEST-ST-01']);
  });

  it('kịch bản xấu: chỉ truyền lat mà thiếu lng → 400', async () => {
    const token = await loginAs(h.app, w.users.driver.phone);

    const res = await h.app.inject({
      method: 'GET',
      url: '/stations/map?lat=10.8',
      headers: { authorization: token },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('thieu_toa_do');
  });

  it('/stations/map KHÔNG bị route /stations/:id nuốt mất', async () => {
    // Cùng tiền tố, khác kiểu: nếu router ưu tiên tham số thì "map" bị hiểu là một uuid
    // và endpoint bản đồ chết lặng lẽ với lỗi validate.
    const token = await loginAs(h.app, w.users.driver.phone);

    const res = await h.app.inject({
      method: 'GET',
      url: '/stations/map',
      headers: { authorization: token },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty('items');
  });

  it('Bảo hành Mobility không có quyền xem trạm (sheet 9 để "—")', async () => {
    const token = await loginAs(h.app, w.users.warranty_admin.phone);

    const res = await h.app.inject({
      method: 'GET',
      url: '/stations/map',
      headers: { authorization: token },
    });

    expect(res.statusCode).toBe(403);
  });
});
