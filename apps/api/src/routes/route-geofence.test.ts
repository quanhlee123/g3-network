// F-A5 — Lộ trình (downsample + audit) và quản lý vùng geofence.
// QUY TẮC 5: lộ trình là dữ liệu vị trí → mọi lần gọi, kể cả bị từ chối, đều vào audit_logs.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, loginAs, type Harness } from '../test/app-harness';
import { insertTelemetry, seedWorld, type TestWorld } from '../test/world';

const TU = '2026-07-01T00:00:00.000Z';
const DEN = '2026-07-01T06:00:00.000Z';

describe('GET /vehicles/:id/route — lộ trình (F-A5)', () => {
  let h: Harness;
  let w: TestWorld;

  const url = (id: string, them = '') =>
    `/vehicles/${id}/route?from=${TU}&to=${DEN}&reason=${encodeURIComponent('kiểm tra hành trình')}${them}`;

  const demAudit = async (action: string): Promise<number> => {
    const res = await h.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM audit_logs WHERE action = $1`,
      [action],
    );
    return res.rows[0]!.n;
  };

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    w = await seedWorld(h.db);
  });

  it('admin xem được lộ trình, và lần xem đó có trong audit log', async () => {
    await insertTelemetry(h.db, w.vehicleA1, {
      startMs: Date.parse(TU),
      endMs: Date.parse(DEN),
      steps: 20,
      socStart: 90,
      socEnd: 40,
    });
    const token = await loginAs(h.app, w.users.admin.phone);

    const res = await h.app.inject({
      method: 'GET',
      url: url(w.vehicleA1),
      headers: { authorization: token },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().items.length).toBeGreaterThan(0);
    expect(res.json().da_downsample).toBe(false);
    expect(await demAudit('vehicle_location.read')).toBe(1);
  });

  it('đoạn dài được downsample: giữ điểm đầu/cuối, số điểm nằm trong trần', async () => {
    await insertTelemetry(h.db, w.vehicleA1, {
      startMs: Date.parse(TU),
      endMs: Date.parse(DEN),
      steps: 999, // 1000 điểm
      socStart: 100,
      socEnd: 20,
    });
    const token = await loginAs(h.app, w.users.admin.phone);

    const res = await h.app.inject({
      method: 'GET',
      url: url(w.vehicleA1, '&max_diem=100'),
      headers: { authorization: token },
    });

    const body = res.json();
    expect(body.tong_diem_goc).toBe(1000);
    expect(body.da_downsample).toBe(true);
    expect(body.items.length).toBeLessThanOrEqual(110); // xấp xỉ trần, có điểm đầu/cuối
    expect(body.items.length).toBeGreaterThan(50);
    // Điểm đầu và điểm cuối của khoảng phải còn nguyên — nếu mất thì lộ trình bị cụt hai đầu
    expect(body.items[0].time).toBe(TU);
    expect(body.items.at(-1).time).toBe(DEN);
  });

  it('CA BẮT BUỘC — vai trò KHÔNG có quyền (Vận hành Energy): bị chặn VÀ có audit', async () => {
    const token = await loginAs(h.app, w.users.energy_ops.phone);

    const res = await h.app.inject({
      method: 'GET',
      url: url(w.vehicleA1),
      headers: { authorization: token },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('khong_du_quyen');
    expect(await demAudit('vehicle_location.denied')).toBe(1);
  });

  it('tài xế xem xe KHÔNG được gán: 404 kèm audit từ chối', async () => {
    const token = await loginAs(h.app, w.users.driver.phone);

    const res = await h.app.inject({
      method: 'GET',
      url: url(w.vehicleB1),
      headers: { authorization: token },
    });

    expect(res.statusCode).toBe(404);
    expect(await demAudit('vehicle_location.denied')).toBe(1);
  });

  it('CSKH: thiếu ticket đang mở → 403 + audit; có ticket SOS mở → 200 + audit kèm ticket_id', async () => {
    await insertTelemetry(h.db, w.vehicleA1, {
      startMs: Date.parse(TU),
      endMs: Date.parse(DEN),
      steps: 5,
      socStart: 80,
      socEnd: 60,
    });
    const token = await loginAs(h.app, w.users.cskh.phone);

    const thieu = await h.app.inject({
      method: 'GET',
      url: url(w.vehicleA1),
      headers: { authorization: token },
    });
    expect(thieu.statusCode).toBe(403);
    expect(thieu.json().error.code).toBe('can_ticket_dang_mo');
    expect(await demAudit('vehicle_location.denied')).toBe(1);

    const ticket = await h.db.query<{ id: string }>(
      `INSERT INTO tickets (channel, status, title, vehicle_id)
       VALUES ('sos', 'open', 'SOS (GIẢ)', $1) RETURNING id`,
      [w.vehicleA1],
    );
    const co = await h.app.inject({
      method: 'GET',
      url: url(w.vehicleA1, `&ticket_id=${ticket.rows[0]!.id}`),
      headers: { authorization: token },
    });

    expect(co.statusCode).toBe(200);
    const logs = await h.db.query<{ ticket_id: string | null }>(
      `SELECT ticket_id FROM audit_logs WHERE action = 'vehicle_location.read'`,
    );
    expect(logs.rows[0]!.ticket_id).toBe(ticket.rows[0]!.id);
  });

  it('kịch bản xấu — thiếu reason: 400 ở tầng schema, KHÔNG chạm dữ liệu nên không ghi audit', async () => {
    const token = await loginAs(h.app, w.users.admin.phone);

    const res = await h.app.inject({
      method: 'GET',
      url: `/vehicles/${w.vehicleA1}/route?from=${TU}&to=${DEN}`,
      headers: { authorization: token },
    });

    expect(res.statusCode).toBe(400);
    expect(await demAudit('vehicle_location.read')).toBe(0);
    expect(await demAudit('vehicle_location.denied')).toBe(0);
  });

  it('kịch bản xấu — khoảng thời gian không có dữ liệu: 200 rỗng, vẫn ghi audit', async () => {
    const token = await loginAs(h.app, w.users.admin.phone);

    const res = await h.app.inject({
      method: 'GET',
      url: url(w.vehicleA1),
      headers: { authorization: token },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().items).toEqual([]);
    expect(res.json().tong_diem_goc).toBe(0);
    expect(await demAudit('vehicle_location.read')).toBe(1);
  });
});

describe('Geofence — tạo & xem vùng (F-A5)', () => {
  let h: Harness;
  let w: TestWorld;

  const OVUONG: [number, number][] = [
    [106.7, 10.75],
    [106.8, 10.75],
    [106.8, 10.85],
    [106.7, 10.85],
  ];

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await h.db.query(`DELETE FROM geofences`);
    w = await seedWorld(h.db);
  });

  it('QL đội tạo được vùng cho ĐỘI MÌNH', async () => {
    const token = await loginAs(h.app, w.users.fleet_manager.phone);

    const res = await h.app.inject({
      method: 'POST',
      url: '/geofences',
      headers: { authorization: token },
      payload: {
        code: 'VUNG-A',
        name: 'Kho Sao Mai (GIẢ)',
        dinh: OVUONG,
        customer_id: w.customerAId,
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().dinh).toHaveLength(4); // đỉnh lặp do PostGIS đóng vòng đã được bỏ
    expect(res.json().canh_bao_vao).toBe(true);
  });

  it('QL đội KHÔNG tạo được vùng cho đội khác', async () => {
    const token = await loginAs(h.app, w.users.fleet_manager.phone);

    const res = await h.app.inject({
      method: 'POST',
      url: '/geofences',
      headers: { authorization: token },
      payload: {
        code: 'VUNG-B',
        name: 'Vùng đội B (GIẢ)',
        dinh: OVUONG,
        customer_id: w.customerBId,
      },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('ngoai_pham_vi');
  });

  it('QL đội không tạo được vùng toàn hệ (chỉ Admin)', async () => {
    const token = await loginAs(h.app, w.users.fleet_manager.phone);

    const res = await h.app.inject({
      method: 'POST',
      url: '/geofences',
      headers: { authorization: token },
      payload: { code: 'VUNG-TOAN-HE', name: 'Vùng biên giới (GIẢ)', dinh: OVUONG },
    });

    expect(res.statusCode).toBe(403);
  });

  it('tài xế KHÔNG có quyền geofence (mặc định từ chối — quy tắc 6)', async () => {
    const token = await loginAs(h.app, w.users.driver.phone);

    const xem = await h.app.inject({
      method: 'GET',
      url: '/geofences',
      headers: { authorization: token },
    });
    expect(xem.statusCode).toBe(403);
  });

  it('QL đội chỉ thấy vùng của đội mình + vùng toàn hệ, không thấy vùng đội khác', async () => {
    const admin = await loginAs(h.app, w.users.admin.phone);
    for (const [code, customerId] of [
      ['VUNG-A2', w.customerAId],
      ['VUNG-B2', w.customerBId],
    ] as const) {
      await h.app.inject({
        method: 'POST',
        url: '/geofences',
        headers: { authorization: admin },
        payload: { code, name: `Vùng ${code} (GIẢ)`, dinh: OVUONG, customer_id: customerId },
      });
    }
    await h.app.inject({
      method: 'POST',
      url: '/geofences',
      headers: { authorization: admin },
      payload: { code: 'VUNG-CHUNG', name: 'Vùng toàn hệ (GIẢ)', dinh: OVUONG },
    });

    const token = await loginAs(h.app, w.users.fleet_manager.phone);
    const res = await h.app.inject({
      method: 'GET',
      url: '/geofences',
      headers: { authorization: token },
    });

    const codes = (res.json().items as { code: string }[]).map((i) => i.code).sort();
    expect(codes).toEqual(['VUNG-A2', 'VUNG-CHUNG']);
  });

  it('kịch bản xấu — trùng mã vùng: 409, không tạo bản ghi thứ hai', async () => {
    const token = await loginAs(h.app, w.users.admin.phone);
    const payload = { code: 'VUNG-TRUNG', name: 'Vùng (GIẢ)', dinh: OVUONG };

    await h.app.inject({
      method: 'POST',
      url: '/geofences',
      headers: { authorization: token },
      payload,
    });
    const lai = await h.app.inject({
      method: 'POST',
      url: '/geofences',
      headers: { authorization: token },
      payload,
    });

    expect(lai.statusCode).toBe(409);
  });

  it('kịch bản xấu — đa giác chỉ có 2 đỉnh: 400 ở tầng schema', async () => {
    const token = await loginAs(h.app, w.users.admin.phone);

    const res = await h.app.inject({
      method: 'POST',
      url: '/geofences',
      headers: { authorization: token },
      payload: {
        code: 'VUNG-LOI',
        name: 'Vùng lỗi (GIẢ)',
        dinh: [
          [106.7, 10.75],
          [106.8, 10.75],
        ],
      },
    });

    expect(res.statusCode).toBe(400);
  });
});
