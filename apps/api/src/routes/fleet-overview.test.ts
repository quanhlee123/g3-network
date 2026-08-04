// F-E1 — Test cho hai endpoint nuôi màn hình tổng quan portal đội xe:
// GET /vehicles/map (bản đồ toàn đội) và GET /alerts (khối cảnh báo).
//
// Trọng tâm: PHẠM VI theo sheet 9 và QUY TẮC 5 (audit log truy cập vị trí).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, loginAs, type Harness } from '../test/app-harness';
import { insertTelemetry, seedWorld, type TestWorld } from '../test/world';

let h: Harness;
let w: TestWorld;

beforeAll(async () => {
  h = await createHarness();
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  w = await seedWorld(h.db);
});

/** Đếm dòng audit theo hành động — dùng để khẳng định SỐ LƯỢNG, không chỉ "có tồn tại". */
async function demAudit(action: string): Promise<number> {
  const res = await h.db.query<{ n: string }>(
    `SELECT count(*)::int AS n FROM audit_logs WHERE action = $1`,
    [action],
  );
  return Number(res.rows[0]!.n);
}

describe('GET /vehicles/map — bản đồ toàn đội (F-E1)', () => {
  /** Cho cả 3 xe một vị trí gần đây để bản đồ có gì mà vẽ. */
  async function bomViTriChoBaXe(): Promise<void> {
    const now = Date.now();
    for (const [vehicleId, lat, lng] of [
      [w.vehicleA1, 10.8, 106.7],
      [w.vehicleA2, 10.9, 106.8],
      [w.vehicleB1, 21.0, 105.8],
    ] as const) {
      await insertTelemetry(h.db, vehicleId, {
        startMs: now - 60_000,
        endMs: now - 1_000,
        steps: 2,
        socStart: 80,
        socEnd: 78,
        lat,
        lng,
      });
    }
  }

  it('quản lý đội chỉ thấy xe ĐỘI MÌNH — đúng 2 xe, không có xe đội B', async () => {
    await bomViTriChoBaXe();
    const auth = await loginAs(h.app, w.users.fleet_manager.phone);

    const res = await h.app.inject({
      method: 'GET',
      url: '/vehicles/map?reason=mo portal sang thu 2',
      headers: { authorization: auth },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Khẳng định SỐ LƯỢNG chính xác, không chỉ "có xe nào đó".
    expect(body.so_xe).toBe(2);
    const vins = (body.items as { vin: string }[]).map((i) => i.vin).sort();
    expect(vins).toEqual(['G3-TEST-A1', 'G3-TEST-A2']);
    expect(vins).not.toContain('G3-TEST-B1');
  });

  it('QUY TẮC 5 — ghi ĐÚNG MỘT dòng audit cho cả lần xem, kèm danh sách xe', async () => {
    await bomViTriChoBaXe();
    const auth = await loginAs(h.app, w.users.fleet_manager.phone);

    const res = await h.app.inject({
      method: 'GET',
      url: '/vehicles/map?reason=kiem tra doi hinh dau ngay',
      headers: { authorization: auth },
    });
    expect(res.statusCode).toBe(200);

    // Đây là lý do endpoint này tồn tại: 2 xe nhưng CHỈ 1 dòng audit.
    expect(await demAudit('vehicle_location.read')).toBe(1);

    const log = await h.db.query(
      `SELECT vehicle_id, reason, metadata FROM audit_logs WHERE action = 'vehicle_location.read'`,
    );
    const row = log.rows[0]!;
    expect(row.vehicle_id).toBeNull(); // một dòng cho nhiều xe
    expect(row.reason).toBe('kiem tra doi hinh dau ngay');
    const meta = row.metadata as { endpoint: string; so_xe: number; vehicle_ids: string[] };
    expect(meta.endpoint).toBe('map');
    // "xe nào" của quy tắc 5 vẫn trả lời được — nằm trong metadata (rbac-matrix R-13).
    expect(meta.so_xe).toBe(2);
    expect(meta.vehicle_ids.sort()).toEqual([w.vehicleA1, w.vehicleA2].sort());
  });

  it('CSKH bị TỪ CHỐI bản đồ toàn đội (R-12) và lần từ chối cũng vào audit', async () => {
    await bomViTriChoBaXe();
    const auth = await loginAs(h.app, w.users.cskh.phone);

    const res = await h.app.inject({
      method: 'GET',
      url: '/vehicles/map?reason=ho tro tai xe goi den',
      headers: { authorization: auth },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('khong_dung_duoc_ban_do_doi');
    // Không có dữ liệu vị trí nào rời khỏi hệ thống…
    expect(await demAudit('vehicle_location.read')).toBe(0);
    // …nhưng lần CỐ xem vẫn để lại dấu vết.
    expect(await demAudit('vehicle_location.denied')).toBe(1);
  });

  it('Vận hành G3 Energy không có quyền xem vị trí xe (sheet 9 dòng "—")', async () => {
    const auth = await loginAs(h.app, w.users.energy_ops.phone);
    const res = await h.app.inject({
      method: 'GET',
      url: '/vehicles/map?reason=xem thu bang van hanh',
      headers: { authorization: auth },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('khong_du_quyen');
  });

  // ---- Kịch bản xấu ----------------------------------------------------------------
  it('KỊCH BẢN XẤU — xe chưa từng gửi vị trí thì bị bỏ qua, không làm hỏng bản đồ', async () => {
    // Chỉ A1 có vị trí; A2 chưa gửi bản ghi nào (xe mới bàn giao, thiết bị chưa lên sóng).
    await insertTelemetry(h.db, w.vehicleA1, {
      startMs: Date.now() - 30_000,
      endMs: Date.now() - 1_000,
      steps: 1,
      socStart: 70,
      socEnd: 69,
    });
    const auth = await loginAs(h.app, w.users.fleet_manager.phone);

    const res = await h.app.inject({
      method: 'GET',
      url: '/vehicles/map?reason=doi co xe chua len song',
      headers: { authorization: auth },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().so_xe).toBe(1);
    expect(res.json().items[0].vin).toBe('G3-TEST-A1');
  });

  it('KỊCH BẢN XẤU — mất sóng: vị trí quá cũ bị loại khi lọc moi_trong_giay', async () => {
    const now = Date.now();
    // A1 mới cập nhật; A2 mất sóng từ 2 giờ trước.
    await insertTelemetry(h.db, w.vehicleA1, {
      startMs: now - 20_000,
      endMs: now - 1_000,
      steps: 1,
      socStart: 60,
      socEnd: 59,
    });
    await insertTelemetry(h.db, w.vehicleA2, {
      startMs: now - 7_200_000,
      endMs: now - 7_100_000,
      steps: 1,
      socStart: 50,
      socEnd: 49,
    });
    const auth = await loginAs(h.app, w.users.fleet_manager.phone);

    const tatCa = await h.app.inject({
      method: 'GET',
      url: '/vehicles/map?reason=xem toan bo ke ca xe cu',
      headers: { authorization: auth },
    });
    expect(tatCa.json().so_xe).toBe(2);

    const chiMoi = await h.app.inject({
      method: 'GET',
      url: '/vehicles/map?reason=chi xem xe dang chay&moi_trong_giay=600',
      headers: { authorization: auth },
    });
    expect(chiMoi.json().so_xe).toBe(1);
    expect(chiMoi.json().items[0].vin).toBe('G3-TEST-A1');
    // Xe mất sóng vẫn phải xem được ở chế độ đầy đủ, kèm tuổi của bản ghi để UI báo "cũ".
    const cu = (tatCa.json().items as { vin: string; cu_giay: number }[]).find(
      (i) => i.vin === 'G3-TEST-A2',
    );
    expect(cu!.cu_giay).toBeGreaterThan(600);
  });

  it('thiếu reason thì bị chặn từ tầng validate — không có truy cập vị trí "vô danh"', async () => {
    const auth = await loginAs(h.app, w.users.fleet_manager.phone);
    const res = await h.app.inject({
      method: 'GET',
      url: '/vehicles/map',
      headers: { authorization: auth },
    });
    expect(res.statusCode).toBe(400);
    expect(await demAudit('vehicle_location.read')).toBe(0);
  });
});

describe('GET /alerts — khối cảnh báo trên màn hình tổng quan (F-E1)', () => {
  /** Cảnh báo gắn thẳng vào xe. */
  async function canhBaoXe(
    vehicleId: string,
    type: string,
    severity: number,
    status = 'open',
  ): Promise<void> {
    await h.db.query(
      `INSERT INTO alerts (type, vehicle_id, severity, status, payload)
       VALUES ($1::alert_type, $2, $3, $4::alert_status, '{"nguon":"test"}'::jsonb)`,
      [type, vehicleId, severity, status],
    );
  }

  it('quản lý đội thấy cảnh báo xe đội mình, KHÔNG thấy cảnh báo đội B', async () => {
    await canhBaoXe(w.vehicleA1, 'battery_low', 2);
    await canhBaoXe(w.vehicleA2, 'charging_violation', 2);
    await canhBaoXe(w.vehicleB1, 'battery_critical', 3);

    const auth = await loginAs(h.app, w.users.fleet_manager.phone);
    const res = await h.app.inject({
      method: 'GET',
      url: '/alerts',
      headers: { authorization: auth },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(2);
    const vins = (body.items as { vin: string }[]).map((i) => i.vin).sort();
    expect(vins).toEqual(['G3-TEST-A1', 'G3-TEST-A2']);
    expect(body.theo_loai).toEqual({ battery_low: 1, charging_violation: 1 });
  });

  it('mặc định chỉ trả cảnh báo CHƯA xử lý; xem lịch sử phải hỏi tường minh', async () => {
    await canhBaoXe(w.vehicleA1, 'battery_low', 2, 'open');
    await canhBaoXe(w.vehicleA1, 'battery_low', 2, 'resolved');
    const auth = await loginAs(h.app, w.users.fleet_manager.phone);

    const macDinh = await h.app.inject({
      method: 'GET',
      url: '/alerts',
      headers: { authorization: auth },
    });
    expect(macDinh.json().total).toBe(1);

    const daXuLy = await h.app.inject({
      method: 'GET',
      url: '/alerts?status=resolved',
      headers: { authorization: auth },
    });
    expect(daXuLy.json().total).toBe(1);
    expect(daXuLy.json().items[0].status).toBe('resolved');
  });

  it('nguy cấp xếp lên đầu — dòng đầu là việc nguy hiểm nhất, không phải việc mới nhất', async () => {
    await canhBaoXe(w.vehicleA1, 'battery_critical', 3);
    // Cảnh báo mức thấp tạo SAU nên "mới" hơn, nhưng phải xếp dưới.
    await canhBaoXe(w.vehicleA2, 'maintenance', 1);

    const auth = await loginAs(h.app, w.users.fleet_manager.phone);
    const res = await h.app.inject({
      method: 'GET',
      url: '/alerts',
      headers: { authorization: auth },
    });

    const items = res.json().items as { type: string; severity: number }[];
    expect(items[0]!.type).toBe('battery_critical');
    expect(items[0]!.severity).toBe(3);
    expect(res.json().theo_muc_do).toEqual({ '1': 1, '3': 1 });
  });

  it('cảnh báo gắn vào THIẾT BỊ (không có vehicle_id) vẫn quy được về xe của đội', async () => {
    // F-J3: cảnh báo tháo thiết bị chỉ có device_id — đây là ca dễ rơi khỏi bộ lọc phạm vi.
    await h.db.query(
      `INSERT INTO alerts (type, device_id, severity, status, payload)
       VALUES ('device_tamper', $1, 3, 'open', '{"loai":"mat_nguon"}'::jsonb)`,
      [w.deviceA1],
    );

    const auth = await loginAs(h.app, w.users.fleet_manager.phone);
    const res = await h.app.inject({
      method: 'GET',
      url: '/alerts',
      headers: { authorization: auth },
    });

    expect(res.json().total).toBe(1);
    const item = res.json().items[0] as { vin: string; device_id: string; type: string };
    expect(item.type).toBe('device_tamper');
    expect(item.vin).toBe('G3-TEST-A1'); // quy về đúng xe qua devices.vehicle_id
    expect(item.device_id).toBe(w.deviceA1);
  });

  it('lọc được theo MỌI giá trị của enum alert_type trong DB', async () => {
    // Bắt được lỗi thật khi chạy portal trên dữ liệu simulator: schema lọc mới liệt kê 8
    // giá trị của migration 0008, trong khi enum đã có thêm data_quality (0011),
    // reconciliation_mismatch (0014), sos (0022), sla_breach (0023). Lọc theo 4 loại sau
    // trả 400 chứ không trả rỗng — và màn hình mặc định không lọc nên không ai thấy.
    const enumRes = await h.db.query<{ enumlabel: string }>(
      `SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'alert_type' ORDER BY e.enumsortorder`,
    );
    const moiLoai = enumRes.rows.map((r) => r.enumlabel);
    expect(moiLoai.length).toBeGreaterThan(8); // canh chừng test tự vô hiệu hoá

    const auth = await loginAs(h.app, w.users.fleet_manager.phone);
    for (const loai of moiLoai) {
      const res = await h.app.inject({
        method: 'GET',
        url: `/alerts?type=${loai}`,
        headers: { authorization: auth },
      });
      expect(res.statusCode, `lọc theo type=${loai} phải hợp lệ`).toBe(200);
    }
  });

  // ---- Kịch bản xấu ----------------------------------------------------------------
  it('KỊCH BẢN XẤU — Vận hành G3 Energy KHÔNG có quyền xem cảnh báo pin (sheet 9 "—")', async () => {
    await canhBaoXe(w.vehicleA1, 'battery_low', 2);
    const auth = await loginAs(h.app, w.users.energy_ops.phone);
    const res = await h.app.inject({
      method: 'GET',
      url: '/alerts',
      headers: { authorization: auth },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('khong_du_quyen');
  });

  it('KỊCH BẢN XẤU — tài xế chỉ thấy cảnh báo XE MÌNH, không thấy xe khác cùng đội', async () => {
    await canhBaoXe(w.vehicleA1, 'battery_low', 2); // xe được gán cho tài xế
    await canhBaoXe(w.vehicleA2, 'battery_low', 2); // cùng đội A nhưng không phải xe của tài xế

    const auth = await loginAs(h.app, w.users.driver.phone);
    const res = await h.app.inject({
      method: 'GET',
      url: '/alerts',
      headers: { authorization: auth },
    });

    expect(res.json().total).toBe(1);
    expect(res.json().items[0].vin).toBe('G3-TEST-A1');
  });

  it('KỊCH BẢN XẤU — đội chưa có cảnh báo nào: trả rỗng chứ không lỗi', async () => {
    const auth = await loginAs(h.app, w.users.fleet_manager.phone);
    const res = await h.app.inject({
      method: 'GET',
      url: '/alerts',
      headers: { authorization: auth },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBe(0);
    expect(res.json().items).toEqual([]);
    expect(res.json().theo_loai).toEqual({});
  });
});
