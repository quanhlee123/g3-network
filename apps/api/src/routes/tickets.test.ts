// F-I2 — Nút SOS, ngữ cảnh tự đính kèm, và ĐỒNG HỒ SLA.
//
// Ca quan trọng nhất ở đây là vòng đời quyền: ticket SOS mở ra quyền xem vị trí cho CSKH,
// và ĐÓNG ticket phải đóng quyền đó lại (sheet 9). Đó là ràng buộc bảo vệ riêng tư tài xế
// theo Nghị định 13/2023, nên nó được test bằng chính luồng SOS chứ không chỉ bằng ticket
// dựng tay như ở rbac.test.ts.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MockNotifier } from '@g3/contracts';
import { quetSlaTicket, SLA_SOS_PHUT } from '../modules/tickets/sos';
import { createHarness, loginAs, type Harness } from '../test/app-harness';
import { insertTelemetry, seedWorld, type TestWorld } from '../test/world';

describe('POST /sos — nút cứu hộ (F-I2)', () => {
  let h: Harness;
  let w: TestWorld;
  let notifier: MockNotifier;

  beforeAll(async () => {
    notifier = new MockNotifier();
    h = await createHarness({}, { notifier });
  });

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    w = await seedWorld(h.db);
    notifier.xoa();
  });

  const bamSos = async (token: string, vin = 'G3-TEST-A1', them: object = {}) =>
    h.app.inject({
      method: 'POST',
      url: '/sos',
      headers: { authorization: token },
      payload: { vin, ...them },
    });

  it('tài xế bấm SOS: ticket ưu tiên CAO, hạn 5 phút, CSKH được báo ngay', async () => {
    const token = await loginAs(h.app, w.users.driver.phone);

    const res = await bamSos(token);

    expect(res.statusCode).toBe(201);
    const body = res.json();
    const ticket = await h.db.query<{
      priority: string;
      status: string;
      channel: string;
      sla_due_at: Date;
      created_at: Date;
    }>(
      `SELECT priority::text, status::text, channel::text, sla_due_at, created_at
       FROM tickets WHERE id = $1`,
      [body.ticket_id],
    );
    expect(ticket.rows[0]).toMatchObject({ priority: 'cao', status: 'open', channel: 'sos' });
    const hanPhut =
      (ticket.rows[0]!.sla_due_at.getTime() - ticket.rows[0]!.created_at.getTime()) / 60_000;
    expect(Math.round(hanPhut)).toBe(SLA_SOS_PHUT);
    expect(notifier.theoLoai('sos')).toHaveLength(1);
    expect(notifier.theoLoai('sos')[0]!.severity).toBe(3);
  });

  it('ngữ cảnh xe TỰ ĐÍNH KÈM từ DB: mã lỗi, SOC, cảnh báo đang mở', async () => {
    await h.db.query(
      `INSERT INTO telematics_readings
         (time, vehicle_id, schema_version, soc_pct, battery_temp_c, fault_codes, position)
       VALUES (now(), $1, 2, 7.5, 61, '["P0A80","P0A94"]'::jsonb,
               ST_SetSRID(ST_MakePoint(106.7, 10.8), 4326)::geography)`,
      [w.vehicleA1],
    );
    await h.db.query(
      `INSERT INTO alerts (type, vehicle_id, severity, dedup_key)
       VALUES ('battery_critical', $1, 3, 'F-A2:test:nguy_cap')`,
      [w.vehicleA1],
    );
    const token = await loginAs(h.app, w.users.driver.phone);

    const res = await bamSos(token);

    const body = res.json();
    // Tài xế KHÔNG gửi mã lỗi lên — hệ thống tự lấy từ bản ghi telemetry mới nhất
    expect(body.fault_codes).toEqual(['P0A80', 'P0A94']);
    expect(body.soc_pct).toBeCloseTo(7.5, 1);
    expect(body.so_canh_bao_dang_mo).toBe(1);
    // Nội dung báo cho CSKH phải nêu được mã lỗi để họ chuẩn bị trước khi gọi
    expect(notifier.theoLoai('sos')[0]!.body).toContain('P0A80');
  });

  it('toạ độ app gửi được ưu tiên, nhưng vị trí từ telemetry vẫn giữ trong hồ sơ', async () => {
    await insertTelemetry(h.db, w.vehicleA1, {
      startMs: Date.now() - 60_000,
      endMs: Date.now(),
      steps: 2,
      socStart: 30,
      socEnd: 28,
      lat: 10.8,
      lng: 106.7,
    });
    const token = await loginAs(h.app, w.users.driver.phone);

    const res = await bamSos(token, 'G3-TEST-A1', { lat: 21.03, lng: 105.85 });

    const ctx = await h.db.query<{ vehicle_context: { lat_bao_cao: number; lat: number } }>(
      `SELECT vehicle_context FROM tickets WHERE id = $1`,
      [res.json().ticket_id],
    );
    expect(ctx.rows[0]!.vehicle_context.lat_bao_cao).toBeCloseTo(21.03, 2);
    expect(ctx.rows[0]!.vehicle_context.lat).toBeCloseTo(10.8, 2);
  });

  it('CA BẮT BUỘC (sheet 9) — ticket SOS mở quyền xem vị trí cho CSKH, ĐÓNG ticket thì đóng quyền', async () => {
    await insertTelemetry(h.db, w.vehicleA1, {
      startMs: Date.now() - 60_000,
      endMs: Date.now(),
      steps: 2,
      socStart: 20,
      socEnd: 18,
    });
    const tokenTaiXe = await loginAs(h.app, w.users.driver.phone);
    const tokenCskh = await loginAs(h.app, w.users.cskh.phone);
    const urlViTri = `/vehicles/${w.vehicleA1}/location?reason=${encodeURIComponent('hỗ trợ SOS')}`;

    // 1. Chưa có SOS: CSKH KHÔNG xem được vị trí
    const truoc = await h.app.inject({
      method: 'GET',
      url: urlViTri,
      headers: { authorization: tokenCskh },
    });
    expect(truoc.statusCode).toBe(403);

    // 2. Tài xế bấm SOS → CSKH xem được, kèm ticket_id
    const sos = await bamSos(tokenTaiXe);
    const ticketId = sos.json().ticket_id as string;
    const trong = await h.app.inject({
      method: 'GET',
      url: `${urlViTri}&ticket_id=${ticketId}`,
      headers: { authorization: tokenCskh },
    });
    expect(trong.statusCode).toBe(200);

    // 3. Ticket đóng → quyền đóng theo, dù vẫn truyền đúng ticket_id đó
    await h.db.query(`UPDATE tickets SET status = 'closed' WHERE id = $1`, [ticketId]);
    const sau = await h.app.inject({
      method: 'GET',
      url: `${urlViTri}&ticket_id=${ticketId}`,
      headers: { authorization: tokenCskh },
    });
    expect(sau.statusCode).toBe(403);
    expect(sau.json().error.code).toBe('can_ticket_dang_mo');
  });

  it('kịch bản xấu — bấm SOS cho xe ĐỘI KHÁC: 404, không tạo ticket', async () => {
    const token = await loginAs(h.app, w.users.driver.phone);

    const res = await bamSos(token, 'G3-TEST-B1');

    expect(res.statusCode).toBe(404);
    const dem = await h.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM tickets`);
    expect(dem.rows[0]!.n).toBe(0);
  });

  it('kịch bản xấu — xe chưa có telemetry nào: VẪN tạo được SOS (không chặn cứu hộ)', async () => {
    const token = await loginAs(h.app, w.users.fleet_manager.phone);

    const res = await bamSos(token, 'G3-TEST-A2');

    expect(res.statusCode).toBe(201);
    expect(res.json().fault_codes).toEqual([]);
    expect(res.json().soc_pct).toBeNull();
  });

  it('CSKH KHÔNG có quyền tạo SOS (sheet 9: CSKH xử lý, không phải người bấm)', async () => {
    const token = await loginAs(h.app, w.users.cskh.phone);

    const res = await bamSos(token);

    expect(res.statusCode).toBe(403);
  });
});

describe('Đồng hồ SLA (F-I2)', () => {
  let h: Harness;
  let w: TestWorld;
  let notifier: MockNotifier;

  beforeAll(async () => {
    notifier = new MockNotifier();
    h = await createHarness({}, { notifier });
  });

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    w = await seedWorld(h.db);
    notifier.xoa();
  });

  const taoTicketQuaHan = async (phutTruoc: number): Promise<string> => {
    const res = await h.db.query<{ id: string }>(
      `INSERT INTO tickets (channel, status, priority, title, vehicle_id, sla_due_at, created_at)
       VALUES ('sos', 'open', 'cao', 'SOS quá hạn (GIẢ)', $1,
               now() - ($2::int * interval '1 minute'),
               now() - ($2::int * interval '1 minute') - interval '5 minutes')
       RETURNING id`,
      [w.vehicleA1, phutTruoc],
    );
    return res.rows[0]!.id;
  };

  it('ticket quá hạn mà chưa ai nhận → cảnh báo leo thang mức nguy cấp', async () => {
    const ticketId = await taoTicketQuaHan(3);

    const tomTat = await quetSlaTicket(h.db, { notifier });

    expect(tomTat.qua_han).toBe(1);
    const alert = await h.db.query<{ severity: number; payload: { ticket_id: string } }>(
      `SELECT severity, payload FROM alerts WHERE type = 'sla_breach'`,
    );
    expect(alert.rows[0]!.severity).toBe(3);
    expect(alert.rows[0]!.payload.ticket_id).toBe(ticketId);
    expect(notifier.theoLoai('sla_breach')).toHaveLength(1);
  });

  it('chạy job nhiều vòng: mỗi ticket chỉ leo thang MỘT lần', async () => {
    await taoTicketQuaHan(3);

    await quetSlaTicket(h.db, { notifier });
    const lan2 = await quetSlaTicket(h.db, { notifier });

    expect(lan2.qua_han).toBe(0);
    const dem = await h.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM alerts WHERE type = 'sla_breach'`,
    );
    expect(dem.rows[0]!.n).toBe(1);
  });

  it('CSKH nhận ticket trước hạn → KHÔNG leo thang', async () => {
    const res = await h.db.query<{ id: string }>(
      `INSERT INTO tickets (channel, status, priority, title, vehicle_id, sla_due_at)
       VALUES ('sos', 'open', 'cao', 'SOS (GIẢ)', $1, now() + interval '5 minutes')
       RETURNING id`,
      [w.vehicleA1],
    );
    const token = await loginAs(h.app, w.users.cskh.phone);

    const nhan = await h.app.inject({
      method: 'POST',
      url: `/tickets/${res.rows[0]!.id}/nhan`,
      headers: { authorization: token },
    });
    expect(nhan.statusCode).toBe(200);
    expect(nhan.json().tre_han).toBe(false);
    expect(nhan.json().status).toBe('in_progress');

    // Đẩy hạn về quá khứ rồi quét: đã có người nhận nên vẫn không leo thang
    await h.db.query(`UPDATE tickets SET sla_due_at = now() - interval '1 minute' WHERE id = $1`, [
      res.rows[0]!.id,
    ]);
    const tomTat = await quetSlaTicket(h.db, { notifier });

    expect(tomTat.qua_han).toBe(0);
  });

  it('nhận ticket lần hai KHÔNG dời mốc nhận đầu tiên (hồ sơ SLA giữ nguyên)', async () => {
    const ticketId = await taoTicketQuaHan(2);
    const token = await loginAs(h.app, w.users.cskh.phone);

    const lan1 = await h.app.inject({
      method: 'POST',
      url: `/tickets/${ticketId}/nhan`,
      headers: { authorization: token },
    });
    const lan2 = await h.app.inject({
      method: 'POST',
      url: `/tickets/${ticketId}/nhan`,
      headers: { authorization: token },
    });

    expect(lan1.json().tre_han).toBe(true); // nhận sau hạn
    expect(lan2.json().acknowledged_at).toBe(lan1.json().acknowledged_at);
  });

  it('tài xế KHÔNG có quyền nhận ticket (sheet 9: xử lý là việc của CSKH)', async () => {
    const ticketId = await taoTicketQuaHan(1);
    const token = await loginAs(h.app, w.users.driver.phone);

    const res = await h.app.inject({
      method: 'POST',
      url: `/tickets/${ticketId}/nhan`,
      headers: { authorization: token },
    });

    expect(res.statusCode).toBe(403);
  });

  it('GET /tickets: tài xế chỉ thấy ticket xe mình, CSKH thấy tất cả', async () => {
    await taoTicketQuaHan(1);
    await h.db.query(
      `INSERT INTO tickets (channel, status, title, vehicle_id)
       VALUES ('hotline', 'open', 'Ticket đội B (GIẢ)', $1)`,
      [w.vehicleB1],
    );

    const tokenTaiXe = await loginAs(h.app, w.users.driver.phone);
    const cuaTaiXe = await h.app.inject({
      method: 'GET',
      url: '/tickets',
      headers: { authorization: tokenTaiXe },
    });
    const tokenCskh = await loginAs(h.app, w.users.cskh.phone);
    const cuaCskh = await h.app.inject({
      method: 'GET',
      url: '/tickets',
      headers: { authorization: tokenCskh },
    });

    expect(cuaTaiXe.json().total).toBe(1);
    expect(cuaCskh.json().total).toBe(2);
  });
});
