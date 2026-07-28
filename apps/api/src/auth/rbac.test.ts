// F-F1 — Phân quyền theo docs/prd/09-rbac.md (sheet 9) + audit log vị trí xe (quy tắc 5).
//
// Test BẮT BUỘC của Prompt 06: vai trò Vận hành G3 Energy gọi API vị trí xe phải BỊ TỪ CHỐI
// (sheet 9, dòng "Xem trạng thái & vị trí xe", cột Vận hành G3 Energy = "—").
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, loginAs, type Harness } from '../test/app-harness';
import { insertTelemetry, seedWorld, type TestWorld } from '../test/world';

let h: Harness;
let w: TestWorld;
const LY_DO = 'Kiem tra vi tri xe phuc vu test tu dong';

beforeAll(async () => {
  h = await createHarness();
  w = await seedWorld(h.db);
  const now = Date.now();
  await insertTelemetry(h.db, w.vehicleA1, {
    startMs: now - 600_000,
    endMs: now,
    steps: 5,
    socStart: 80,
    socEnd: 60,
    lat: 10.85,
    lng: 106.75,
  });
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.db.query('TRUNCATE audit_logs RESTART IDENTITY');
});

const url = (vehicleId: string, extra = '') =>
  `/vehicles/${vehicleId}/location?reason=${encodeURIComponent(LY_DO)}${extra}`;

describe('sheet 9 — quyền xem VỊ TRÍ xe', () => {
  it('Vận hành G3 Energy gọi API vị trí xe → 403 (sheet 9: "—")', async () => {
    const token = await loginAs(h.app, w.users.energy_ops.phone);

    const res = await h.app.inject({
      method: 'GET',
      url: url(w.vehicleA1),
      headers: { authorization: token },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('khong_du_quyen');
  });

  it('lần bị từ chối đó VẪN để lại dấu vết trong audit_logs (quy tắc 5)', async () => {
    const token = await loginAs(h.app, w.users.energy_ops.phone);
    await h.app.inject({
      method: 'GET',
      url: url(w.vehicleA1),
      headers: { authorization: token },
    });

    const logs = await h.db.query<{ action: string; user_id: string; metadata: unknown }>(
      `SELECT action, user_id, metadata FROM audit_logs ORDER BY occurred_at DESC`,
    );
    expect(logs.rows).toHaveLength(1);
    expect(logs.rows[0]!.action).toBe('vehicle_location.denied');
    expect(logs.rows[0]!.user_id).toBe(w.users.energy_ops.id);
    expect((logs.rows[0]!.metadata as { vehicle_id_yeu_cau: string }).vehicle_id_yeu_cau).toBe(
      w.vehicleA1,
    );
  });

  it('Vận hành G3 Energy vẫn xem được TRẠM và PHIÊN SẠC (sheet 9: ✓)', async () => {
    const token = await loginAs(h.app, w.users.energy_ops.phone);

    const tram = await h.app.inject({
      method: 'GET',
      url: '/stations',
      headers: { authorization: token },
    });
    const phien = await h.app.inject({
      method: 'GET',
      url: '/charging-sessions',
      headers: { authorization: token },
    });

    expect(tram.statusCode).toBe(200);
    expect(phien.statusCode).toBe(200);
  });

  it('Vận hành G3 Energy cũng không đọc được telemetry xe (cùng dòng sheet 9)', async () => {
    const token = await loginAs(h.app, w.users.energy_ops.phone);

    const res = await h.app.inject({
      method: 'GET',
      url: `/vehicles/${w.vehicleA1}/telemetry/latest`,
      headers: { authorization: token },
    });

    expect(res.statusCode).toBe(403);
  });

  it('Tài xế xem được vị trí XE MÌNH và audit log ghi đủ ai/xe/lý do', async () => {
    const token = await loginAs(h.app, w.users.driver.phone);

    const res = await h.app.inject({
      method: 'GET',
      url: url(w.vehicleA1),
      headers: { authorization: token },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().lat).toBeCloseTo(10.85, 3);

    const logs = await h.db.query<{
      action: string;
      user_id: string;
      vehicle_id: string;
      reason: string;
    }>(`SELECT action, user_id, vehicle_id, reason FROM audit_logs`);
    expect(logs.rows).toHaveLength(1);
    expect(logs.rows[0]).toMatchObject({
      action: 'vehicle_location.read',
      user_id: w.users.driver.id,
      vehicle_id: w.vehicleA1,
      reason: LY_DO,
    });
  });

  it('Tài xế KHÔNG xem được vị trí xe không được gán → 404 + audit từ chối', async () => {
    const token = await loginAs(h.app, w.users.driver.phone);

    const res = await h.app.inject({
      method: 'GET',
      url: url(w.vehicleA2),
      headers: { authorization: token },
    });

    expect(res.statusCode).toBe(404);
    const logs = await h.db.query(`SELECT action FROM audit_logs`);
    expect(logs.rows[0]!.action).toBe('vehicle_location.denied');
  });

  it('thiếu tham số reason → 400, không có dòng audit nào (chưa xem được gì)', async () => {
    const token = await loginAs(h.app, w.users.driver.phone);

    const res = await h.app.inject({
      method: 'GET',
      url: `/vehicles/${w.vehicleA1}/location`,
      headers: { authorization: token },
    });

    expect(res.statusCode).toBe(400);
    const logs = await h.db.query(`SELECT count(*)::int AS n FROM audit_logs`);
    expect(logs.rows[0]!.n).toBe(0);
  });
});

describe('sheet 9 — CSKH chỉ xem vị trí khi có ticket đang mở', () => {
  it('không có ticket_id → 403 kèm audit từ chối', async () => {
    const token = await loginAs(h.app, w.users.cskh.phone);

    const res = await h.app.inject({
      method: 'GET',
      url: url(w.vehicleA1),
      headers: { authorization: token },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('can_ticket_dang_mo');
    const logs = await h.db.query(`SELECT action FROM audit_logs`);
    expect(logs.rows[0]!.action).toBe('vehicle_location.denied');
  });

  it('ticket đã đóng → 403 (không phải "đang mở")', async () => {
    const token = await loginAs(h.app, w.users.cskh.phone);
    const ticket = await h.db.query<{ id: string }>(
      `INSERT INTO tickets (channel, status, title, vehicle_id)
       VALUES ('hotline', 'closed', 'Ticket đã đóng (GIẢ)', $1) RETURNING id`,
      [w.vehicleA1],
    );

    const res = await h.app.inject({
      method: 'GET',
      url: url(w.vehicleA1, `&ticket_id=${ticket.rows[0]!.id}`),
      headers: { authorization: token },
    });

    expect(res.statusCode).toBe(403);
  });

  it('ticket SOS đang mở → 200 và audit log lưu kèm ticket_id', async () => {
    const token = await loginAs(h.app, w.users.cskh.phone);
    const ticket = await h.db.query<{ id: string }>(
      `INSERT INTO tickets (channel, status, title, vehicle_id)
       VALUES ('sos', 'open', 'Xe hết pin dọc đường (GIẢ)', $1) RETURNING id`,
      [w.vehicleA1],
    );
    const ticketId = ticket.rows[0]!.id;

    const res = await h.app.inject({
      method: 'GET',
      url: url(w.vehicleA1, `&ticket_id=${ticketId}`),
      headers: { authorization: token },
    });

    expect(res.statusCode).toBe(200);
    const logs = await h.db.query<{ ticket_id: string; action: string }>(
      `SELECT ticket_id, action FROM audit_logs`,
    );
    expect(logs.rows[0]).toMatchObject({ action: 'vehicle_location.read', ticket_id: ticketId });
  });

  it('ticket đang mở nhưng của XE KHÁC → 403 (không mượn ticket để soi xe khác)', async () => {
    const token = await loginAs(h.app, w.users.cskh.phone);
    const ticket = await h.db.query<{ id: string }>(
      `INSERT INTO tickets (channel, status, title, vehicle_id)
       VALUES ('sos', 'open', 'Ticket xe B (GIẢ)', $1) RETURNING id`,
      [w.vehicleB1],
    );

    const res = await h.app.inject({
      method: 'GET',
      url: url(w.vehicleA1, `&ticket_id=${ticket.rows[0]!.id}`),
      headers: { authorization: token },
    });

    expect(res.statusCode).toBe(403);
  });
});

describe('sheet 9 — phạm vi dữ liệu (V\\*)', () => {
  it('Tài xế chỉ thấy xe được gán; QL đội chỉ thấy đội mình; Admin thấy tất cả', async () => {
    const vinsCua = async (phone: string): Promise<string[]> => {
      const token = await loginAs(h.app, phone);
      const res = await h.app.inject({
        method: 'GET',
        url: '/vehicles',
        headers: { authorization: token },
      });
      expect(res.statusCode).toBe(200);
      return (res.json().items as { vin: string }[]).map((v) => v.vin);
    };

    expect(await vinsCua(w.users.driver.phone)).toEqual(['G3-TEST-A1']);
    expect(await vinsCua(w.users.fleet_manager.phone)).toEqual(['G3-TEST-A1', 'G3-TEST-A2']);
    expect(await vinsCua(w.users.admin.phone)).toEqual(['G3-TEST-A1', 'G3-TEST-A2', 'G3-TEST-B1']);
  });

  it('QL đội A đọc telemetry xe đội B → 404 (không lộ sự tồn tại của xe đội khác)', async () => {
    const token = await loginAs(h.app, w.users.fleet_manager.phone);

    const res = await h.app.inject({
      method: 'GET',
      url: `/vehicles/${w.vehicleB1}/telemetry/latest`,
      headers: { authorization: token },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('khong_tim_thay_xe');
  });

  it('Sức khỏe thiết bị: QL đội xem được, Vận hành Energy & tài xế không (sheet 9)', async () => {
    const goi = async (phone: string) => {
      const token = await loginAs(h.app, phone);
      return h.app.inject({
        method: 'GET',
        url: '/devices/health',
        headers: { authorization: token },
      });
    };

    expect((await goi(w.users.fleet_manager.phone)).statusCode).toBe(200);
    expect((await goi(w.users.energy_ops.phone)).statusCode).toBe(403);
    expect((await goi(w.users.driver.phone)).statusCode).toBe(403);
  });

  it('đối soát kWh: Vận hành Energy chạy được, QL đội chỉ XEM, tài xế không thấy gì', async () => {
    const goi = async (phone: string, method: 'GET' | 'POST') => {
      const token = await loginAs(h.app, phone);
      return h.app.inject({
        method,
        url: method === 'GET' ? '/reconciliation/results' : '/reconciliation/run',
        headers: { authorization: token },
        ...(method === 'POST' ? { payload: {} } : {}),
      });
    };

    expect((await goi(w.users.energy_ops.phone, 'GET')).statusCode).toBe(200);
    expect((await goi(w.users.energy_ops.phone, 'POST')).statusCode).toBe(200);
    // QL đội có "V\*" ở dòng "Sản lượng điện / đối soát kWh" — xem được, KHÔNG chạy được job
    expect((await goi(w.users.fleet_manager.phone, 'GET')).statusCode).toBe(200);
    expect((await goi(w.users.fleet_manager.phone, 'POST')).statusCode).toBe(403);
    expect((await goi(w.users.driver.phone, 'GET')).statusCode).toBe(403);
  });

  it('tài khoản bị khóa giữa chừng → token cũ hết tác dụng ngay', async () => {
    const token = await loginAs(h.app, w.users.sale.phone);
    const truoc = await h.app.inject({
      method: 'GET',
      url: '/vehicles',
      headers: { authorization: token },
    });
    expect(truoc.statusCode).toBe(200);

    await h.db.query(`UPDATE users SET is_active = false WHERE id = $1`, [w.users.sale.id]);
    const sau = await h.app.inject({
      method: 'GET',
      url: '/vehicles',
      headers: { authorization: token },
    });
    await h.db.query(`UPDATE users SET is_active = true WHERE id = $1`, [w.users.sale.id]);

    expect(sau.statusCode).toBe(401);
    expect(sau.json().error.code).toBe('tai_khoan_khong_hoat_dong');
  });
});
