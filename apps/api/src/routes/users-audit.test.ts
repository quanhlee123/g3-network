// F-F1 — Test quản trị tài khoản (mời/khóa/gán vai trò) và đọc nhật ký truy cập vị trí.
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

describe('GET /users — danh sách tài khoản (F-F1)', () => {
  it('admin thấy tất cả, gồm cả tài khoản nội bộ không gắn đội', async () => {
    const auth = await loginAs(h.app, w.users.admin.phone);
    const res = await h.app.inject({
      method: 'GET',
      url: '/users',
      headers: { authorization: auth },
    });

    expect(res.statusCode).toBe(200);
    // seedWorld tạo đúng 7 tài khoản, mỗi vai trò một cái.
    expect(res.json().total).toBe(7);
  });

  it('quản lý đội CHỈ thấy tài khoản đội mình (sheet 9 "V*")', async () => {
    const auth = await loginAs(h.app, w.users.fleet_manager.phone);
    const res = await h.app.inject({
      method: 'GET',
      url: '/users',
      headers: { authorization: auth },
    });

    expect(res.statusCode).toBe(200);
    // Chỉ driver + fleet_manager thuộc đội A; 5 vai trò nội bộ G3 không được lộ ra.
    expect(res.json().total).toBe(2);
    const vaiTro = (res.json().items as { role: string }[]).map((u) => u.role).sort();
    expect(vaiTro).toEqual(['driver', 'fleet_manager']);
  });

  it('KỊCH BẢN XẤU — quản lý đội KHÔNG mời được tài khoản (chỉ có "V*", không có "✓")', async () => {
    const auth = await loginAs(h.app, w.users.fleet_manager.phone);
    const res = await h.app.inject({
      method: 'POST',
      url: '/users',
      headers: { authorization: auth },
      payload: {
        email: 'ke-gian@test.local',
        full_name: 'Tự cấp quyền (GIẢ)',
        role: 'admin',
        phone: '0911999999',
      },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('khong_du_quyen');
  });

  it('KỊCH BẢN XẤU — CSKH không xem được danh sách tài khoản (sheet 9 "—")', async () => {
    const auth = await loginAs(h.app, w.users.cskh.phone);
    const res = await h.app.inject({
      method: 'GET',
      url: '/users',
      headers: { authorization: auth },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('POST /users — mời tài khoản (F-F1)', () => {
  it('mời xong là đăng nhập được ngay bằng OTP', async () => {
    const auth = await loginAs(h.app, w.users.admin.phone);
    const taoRes = await h.app.inject({
      method: 'POST',
      url: '/users',
      headers: { authorization: auth },
      payload: {
        email: 'ql-moi@test.local',
        full_name: 'Quản lý mới (GIẢ)',
        role: 'fleet_manager',
        phone: '0911000099',
        customer_id: w.customerAId,
      },
    });

    expect(taoRes.statusCode).toBe(201);
    expect(taoRes.json().is_active).toBe(true);
    expect(taoRes.json().customer_name).toBe('Đội A (GIẢ)');

    // Vòng đời thật: người vừa được mời tự đăng nhập.
    const tokenMoi = await loginAs(h.app, '0911000099');
    const me = await h.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: tokenMoi },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().role).toBe('fleet_manager');
  });

  it('KỊCH BẢN XẤU — vai trò thuộc đội mà không gắn đội thì bị chặn ngay lúc tạo', async () => {
    // Nếu để lọt, tài khoản đăng nhập được nhưng guard trả 403 ở MỌI endpoint
    // (scope=fleet + customer_id NULL) — người dùng không hiểu vì sao.
    const auth = await loginAs(h.app, w.users.admin.phone);
    const res = await h.app.inject({
      method: 'POST',
      url: '/users',
      headers: { authorization: auth },
      payload: {
        email: 'ql-treo@test.local',
        full_name: 'Quản lý treo (GIẢ)',
        role: 'fleet_manager',
        phone: '0911000098',
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('thieu_doi_xe');
  });

  it('KỊCH BẢN XẤU — SĐT trùng trả 409 tiếng Việt, không phải 500', async () => {
    const auth = await loginAs(h.app, w.users.admin.phone);
    const res = await h.app.inject({
      method: 'POST',
      url: '/users',
      headers: { authorization: auth },
      payload: {
        email: 'khac@test.local',
        full_name: 'Trùng số (GIẢ)',
        role: 'cskh',
        phone: w.users.driver.phone, // đã có tài khoản
      },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('sdt_da_ton_tai');
  });

  it('KỊCH BẢN XẤU — vai trò nội bộ mà gắn đội xe cũng bị chặn', async () => {
    const auth = await loginAs(h.app, w.users.admin.phone);
    const res = await h.app.inject({
      method: 'POST',
      url: '/users',
      headers: { authorization: auth },
      payload: {
        email: 'cskh-gan-doi@test.local',
        full_name: 'CSKH gắn đội (GIẢ)',
        role: 'cskh',
        phone: '0911000097',
        customer_id: w.customerAId,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('vai_tro_khong_thuoc_doi');
  });
});

describe('PATCH /users/:id — khóa & gán vai trò (F-F1)', () => {
  it('KHÓA tài khoản có hiệu lực NGAY với token đang dùng', async () => {
    // Tài xế đăng nhập trước, cầm token hợp lệ.
    const tokenTaiXe = await loginAs(h.app, w.users.driver.phone);
    const truoc = await h.app.inject({
      method: 'GET',
      url: '/vehicles',
      headers: { authorization: tokenTaiXe },
    });
    expect(truoc.statusCode).toBe(200);

    // Admin khóa tài khoản đó.
    const authAdmin = await loginAs(h.app, w.users.admin.phone);
    const khoa = await h.app.inject({
      method: 'PATCH',
      url: `/users/${w.users.driver.id}`,
      headers: { authorization: authAdmin },
      payload: { is_active: false },
    });
    expect(khoa.statusCode).toBe(200);
    expect(khoa.json().is_active).toBe(false);

    // Token CŨ phải chết ngay, không chờ hết hạn — guard đọc lại is_active mỗi request.
    const sau = await h.app.inject({
      method: 'GET',
      url: '/vehicles',
      headers: { authorization: tokenTaiXe },
    });
    expect(sau.statusCode).toBe(401);
    expect(sau.json().error.code).toBe('tai_khoan_khong_hoat_dong');
  });

  it('đổi vai trò có hiệu lực ngay: quyền mới áp dụng cho token đang cầm', async () => {
    const tokenSale = await loginAs(h.app, w.users.sale.phone);
    // Sale không có quyền xem sức khỏe thiết bị.
    const truoc = await h.app.inject({
      method: 'GET',
      url: '/devices/health',
      headers: { authorization: tokenSale },
    });
    expect(truoc.statusCode).toBe(403);

    const authAdmin = await loginAs(h.app, w.users.admin.phone);
    await h.app.inject({
      method: 'PATCH',
      url: `/users/${w.users.sale.id}`,
      headers: { authorization: authAdmin },
      payload: { role: 'cskh' },
    });

    // Cùng token cũ, giờ là CSKH → có device_health.read.
    const sau = await h.app.inject({
      method: 'GET',
      url: '/devices/health',
      headers: { authorization: tokenSale },
    });
    expect(sau.statusCode).toBe(200);
  });

  it('KỊCH BẢN XẤU — admin KHÔNG tự khóa được chính mình', async () => {
    // Đây là cách khóa cứng cả hệ thống: Phase 1 không có "quên mật khẩu", vai trò nằm
    // trong DB, admin cuối cùng tự khóa là hết đường vào.
    const auth = await loginAs(h.app, w.users.admin.phone);
    const res = await h.app.inject({
      method: 'PATCH',
      url: `/users/${w.users.admin.id}`,
      headers: { authorization: auth },
      payload: { is_active: false },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('khong_tu_khoa_minh');

    // Và tài khoản vẫn dùng được bình thường.
    const van = await h.app.inject({
      method: 'GET',
      url: '/users',
      headers: { authorization: auth },
    });
    expect(van.statusCode).toBe(200);
  });

  it('KỊCH BẢN XẤU — admin KHÔNG tự hạ quyền chính mình', async () => {
    const auth = await loginAs(h.app, w.users.admin.phone);
    const res = await h.app.inject({
      method: 'PATCH',
      url: `/users/${w.users.admin.id}`,
      headers: { authorization: auth },
      payload: { role: 'driver' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('khong_tu_doi_vai_tro_minh');
  });
});

describe('GET /audit-logs — nhật ký truy cập vị trí (F-F1, NF-06)', () => {
  /** Sinh một lần xem vị trí 1 xe + một lần xem bản đồ đội. */
  async function sinhNhatKy(): Promise<void> {
    const now = Date.now();
    await insertTelemetry(h.db, w.vehicleA1, {
      startMs: now - 60_000,
      endMs: now - 1_000,
      steps: 2,
      socStart: 80,
      socEnd: 79,
    });
    await insertTelemetry(h.db, w.vehicleA2, {
      startMs: now - 60_000,
      endMs: now - 1_000,
      steps: 2,
      socStart: 70,
      socEnd: 69,
      lat: 10.9,
      lng: 106.8,
    });

    const auth = await loginAs(h.app, w.users.fleet_manager.phone);
    await h.app.inject({
      method: 'GET',
      url: `/vehicles/${w.vehicleA1}/location?reason=kiem tra xe cham giao`,
      headers: { authorization: auth },
    });
    await h.app.inject({
      method: 'GET',
      url: '/vehicles/map?reason=mo man hinh tong quan',
      headers: { authorization: auth },
    });
  }

  it('trả đủ AI · LÚC NÀO · XE NÀO · LÝ DO cho từng dòng', async () => {
    await sinhNhatKy();
    const auth = await loginAs(h.app, w.users.admin.phone);
    const res = await h.app.inject({
      method: 'GET',
      url: '/audit-logs',
      headers: { authorization: auth },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBe(2);

    const items = res.json().items as {
      action: string;
      user_name: string;
      user_role: string;
      vin: string | null;
      reason: string;
      so_xe: number | null;
    }[];
    for (const it of items) {
      expect(it.user_name).toBe('Người dùng fleet_manager (GIẢ)');
      expect(it.user_role).toBe('fleet_manager');
      expect(it.reason.length).toBeGreaterThan(0);
    }

    // Dòng xem 1 xe có VIN; dòng xem bản đồ không có VIN nhưng có so_xe (R-13).
    const motXe = items.find((i) => i.vin !== null);
    expect(motXe!.reason).toBe('kiem tra xe cham giao');
    const banDo = items.find((i) => i.vin === null);
    expect(banDo!.reason).toBe('mo man hinh tong quan');
    expect(banDo!.so_xe).toBe(2);
  });

  it('lọc "ai đã xem xe này" bắt được CẢ lượt xem qua bản đồ đội', async () => {
    await sinhNhatKy();
    const auth = await loginAs(h.app, w.users.admin.phone);
    const res = await h.app.inject({
      method: 'GET',
      url: `/audit-logs?vehicle_id=${w.vehicleA1}`,
      headers: { authorization: auth },
    });

    // Nếu chỉ so cột vehicle_id thì chỉ ra 1 dòng, và câu trả lời cho chủ thể dữ liệu
    // ("ai đã xem vị trí xe tôi") sẽ THIẾU lượt xem bản đồ — đúng thứ Nghị định 13/2023
    // cho họ quyền hỏi.
    expect(res.json().total).toBe(2);
  });

  it('lượt BỊ TỪ CHỐI cũng nằm trong nhật ký', async () => {
    // Vận hành G3 Energy không có quyền xem vị trí (sheet 9 "—").
    const authOps = await loginAs(h.app, w.users.energy_ops.phone);
    await h.app.inject({
      method: 'GET',
      url: `/vehicles/${w.vehicleA1}/location?reason=thu xem trom`,
      headers: { authorization: authOps },
    });

    const auth = await loginAs(h.app, w.users.admin.phone);
    const res = await h.app.inject({
      method: 'GET',
      url: '/audit-logs?action=vehicle_location.denied',
      headers: { authorization: auth },
    });

    expect(res.json().total).toBe(1);
    expect(res.json().items[0].user_role).toBe('energy_ops');
  });

  it('KỊCH BẢN XẤU — CSKH và quản lý đội KHÔNG đọc được nhật ký (sheet 9 "—")', async () => {
    for (const vaiTro of ['cskh', 'fleet_manager'] as const) {
      const auth = await loginAs(h.app, w.users[vaiTro].phone);
      const res = await h.app.inject({
        method: 'GET',
        url: '/audit-logs',
        headers: { authorization: auth },
      });
      expect(res.statusCode, `${vaiTro} phải bị chặn`).toBe(403);
    }
  });

  it('KỊCH BẢN XẤU — nhật ký rỗng trả 0 chứ không lỗi', async () => {
    const auth = await loginAs(h.app, w.users.admin.phone);
    const res = await h.app.inject({
      method: 'GET',
      url: '/audit-logs',
      headers: { authorization: auth },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBe(0);
    expect(res.json().items).toEqual([]);
  });
});
