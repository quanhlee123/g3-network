// F-B3 · F-B5 — API hồ sơ vi phạm: phạm vi theo vai trò + endpoint bằng chứng.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, loginAs, type Harness } from '../test/app-harness';
import { seedWorld, taoPhienSac, type TestWorld } from '../test/world';

let h: Harness;
let w: TestWorld;
let admin: string;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  w = await seedWorld(h.db);
  admin = await loginAs(h.app, w.users.admin.phone);

  // Chính sách cho CẢ HAI đội, rồi mỗi đội 1 phiên sạc sai khung giờ.
  for (const [ma, customerId] of [
    ['BH-A', w.customerAId],
    ['BH-B', w.customerBId],
  ] as const) {
    await h.db.query(
      `INSERT INTO charging_policies
         (code, version, name, scope_type, customer_id, allowed_hours, effective_from)
       VALUES ($1, 1, $2, 'fleet', $3, $4::jsonb, '2026-01-01T00:00:00Z')`,
      [ma, `Chính sách ${ma} (GIẢ)`, customerId, JSON.stringify([{ from: '22:00', to: '06:00' }])],
    );
  }
  for (const [i, vehicleId] of [w.vehicleA1, w.vehicleB1].entries()) {
    await taoPhienSac(h.db, w, {
      vehicleId,
      startMs: Date.parse('2026-06-12T07:00:00Z'),
      endMs: Date.parse('2026-06-12T08:00:00Z'),
      energyKwh: 60,
      ocppTxId: `TX-VP-${i}`,
    });
  }

  const chay = await h.app.inject({
    method: 'POST',
    url: '/violations/run',
    headers: { authorization: admin },
    payload: {},
  });
  expect(chay.statusCode, chay.body).toBe(200);
  expect(chay.json().vi_pham_moi).toBe(2);
});

describe('GET /violations — phạm vi theo vai trò (sheet 9)', () => {
  it('admin thấy vi phạm của cả hai đội', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: '/violations',
      headers: { authorization: admin },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBe(2);
    expect(res.json().theo_loai.outside_hours).toBe(2);
  });

  it('QL đội A CHỈ thấy vi phạm đội mình, không thấy đội B', async () => {
    const token = await loginAs(h.app, w.users.fleet_manager.phone);

    const res = await h.app.inject({
      method: 'GET',
      url: '/violations',
      headers: { authorization: token },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBe(1);
    expect((res.json().items as { vin: string }[])[0]!.vin).toBe('G3-TEST-A1');
  });

  it('tài xế chỉ thấy vi phạm của xe được gán cho mình', async () => {
    const token = await loginAs(h.app, w.users.driver.phone);

    const res = await h.app.inject({
      method: 'GET',
      url: '/violations',
      headers: { authorization: token },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBe(1);
    expect((res.json().items as { vin: string }[])[0]!.vin).toBe('G3-TEST-A1');
  });

  it('Vận hành G3 Energy KHÔNG có quyền xem hồ sơ bảo hành', async () => {
    const token = await loginAs(h.app, w.users.energy_ops.phone);

    const res = await h.app.inject({
      method: 'GET',
      url: '/violations',
      headers: { authorization: token },
    });

    expect(res.statusCode).toBe(403);
  });

  it('danh sách kèm sẵn hành vi & khuyến nghị để hiện thẳng lên app (F-B5)', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: '/violations',
      headers: { authorization: admin },
    });

    const item = (res.json().items as { mo_ta: string; khuyen_nghi: string }[])[0]!;
    expect(item.mo_ta).toContain('ngoài khung giờ');
    expect(item.khuyen_nghi).toContain('22:00–06:00');
  });
});

describe('GET /violations/:id — bằng chứng đầy đủ', () => {
  it('trả nguyên cột evidence cho vai trò có quyền', async () => {
    const ds = await h.app.inject({
      method: 'GET',
      url: `/violations?vehicle_id=${w.vehicleA1}`,
      headers: { authorization: admin },
    });
    const id = (ds.json().items as { id: string }[])[0]!.id;

    const res = await h.app.inject({
      method: 'GET',
      url: `/violations/${id}`,
      headers: { authorization: admin },
    });

    expect(res.statusCode).toBe(200);
    const e = res.json().evidence as Record<string, Record<string, unknown>>;
    expect(e.phien_sac!.vin).toBe('G3-TEST-A1');
    expect(e.chinh_sach!.code).toBe('BH-A');
    expect(e.cach_tinh!.mui_gio_khung_gio).toBe('Asia/Ho_Chi_Minh');
  });

  it('kịch bản xấu: xem vi phạm của đội khác trả 404, KHÔNG phải 403', async () => {
    // 403 sẽ xác nhận "có tồn tại vi phạm với id này" — rò rỉ thông tin về đội khác.
    const ds = await h.app.inject({
      method: 'GET',
      url: `/violations?vehicle_id=${w.vehicleB1}`,
      headers: { authorization: admin },
    });
    const idDoiB = (ds.json().items as { id: string }[])[0]!.id;
    const token = await loginAs(h.app, w.users.fleet_manager.phone);

    const res = await h.app.inject({
      method: 'GET',
      url: `/violations/${idDoiB}`,
      headers: { authorization: token },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('khong_tim_thay_vi_pham');
  });
});

describe('POST /violations/run — chạy tay', () => {
  it('Bảo hành Mobility chạy được job', async () => {
    const token = await loginAs(h.app, w.users.warranty_admin.phone);

    const res = await h.app.inject({
      method: 'POST',
      url: '/violations/run',
      headers: { authorization: token },
      payload: { lam_lai_tat_ca: true },
    });

    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().da_xet).toBe(2);
    expect(res.json().vi_pham_moi, 'chạy lại không đẻ thêm vi phạm').toBe(0);
    expect(res.json().loi).toBe(0);
  });

  it('QL đội KHÔNG chạy được job toàn hệ', async () => {
    const token = await loginAs(h.app, w.users.fleet_manager.phone);

    const res = await h.app.inject({
      method: 'POST',
      url: '/violations/run',
      headers: { authorization: token },
      payload: {},
    });

    expect(res.statusCode).toBe(403);
  });
});
