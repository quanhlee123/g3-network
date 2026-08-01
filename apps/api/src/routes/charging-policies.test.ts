// F-B1 — Chính sách sạc có version.
//
// Câu hỏi mà cả file này tồn tại để trả lời: sau khi chính sách đã đổi vài lần, một phiên
// sạc trong quá khứ còn được đối chiếu đúng bằng ngưỡng ĐANG HIỆU LỰC LÚC ĐÓ hay không.
// Trả lời sai câu này thì hồ sơ bảo hành mất giá trị pháp lý (NF-11).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { chinhSachHieuLuc } from '../modules/policies/policy';
import { createHarness, loginAs, type Harness } from '../test/app-harness';
import { seedWorld, type TestWorld } from '../test/world';

let h: Harness;
let w: TestWorld;
let baoHanh: string;
let admin: string;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  w = await seedWorld(h.db);
  baoHanh = await loginAs(h.app, w.users.warranty_admin.phone);
  admin = await loginAs(h.app, w.users.admin.phone);
});

/** Ban hành version 1 cho đội A: chỉ được sạc ban đêm, SOC 20–90%. */
async function banHanhV1(): Promise<Record<string, unknown>> {
  const res = await h.app.inject({
    method: 'POST',
    url: '/charging-policies',
    headers: { authorization: baoHanh },
    payload: {
      code: 'BH-DOI-A',
      name: 'Bảo hành đội A — bản đầu',
      scope_type: 'fleet',
      customer_id: w.customerAId,
      soc_min_pct: 20,
      soc_max_pct: 90,
      allowed_hours: [{ from: '22:00', to: '06:00' }],
      max_power_kw: 120,
      effective_from: '2026-01-01T00:00:00Z',
      change_note: 'Ban hành theo hợp đồng bảo hành 500.000km',
    },
  });
  expect(res.statusCode, res.body).toBe(201);
  return res.json() as Record<string, unknown>;
}

describe('F-B1 — ban hành & đọc chính sách', () => {
  it('Bảo hành Mobility ban hành được version 1', async () => {
    const cs = await banHanhV1();

    expect(cs.version).toBe(1);
    expect(cs.supersedes_id).toBeNull();
    expect(cs.created_by).toBe(w.users.warranty_admin.id);
    expect(cs.allowed_hours).toEqual([{ from: '22:00', to: '06:00' }]);
  });

  it('danh sách chỉ trả version MỚI NHẤT của mỗi mã', async () => {
    await banHanhV1();
    await taoVersion2();

    const res = await h.app.inject({
      method: 'GET',
      url: '/charging-policies',
      headers: { authorization: baoHanh },
    });

    expect(res.statusCode).toBe(200);
    const items = res.json().items as { code: string; version: number }[];
    expect(items.filter((i) => i.code === 'BH-DOI-A')).toHaveLength(1);
    expect(items.find((i) => i.code === 'BH-DOI-A')?.version).toBe(2);
  });
});

describe('F-B1 — sửa chính sách thì version cũ VẪN ĐỌC ĐƯỢC', () => {
  it('sau khi tạo version 2, version 1 còn nguyên nội dung cũ', async () => {
    const v1 = await banHanhV1();
    await taoVersion2();

    const res = await h.app.inject({
      method: 'GET',
      url: '/charging-policies/BH-DOI-A/versions',
      headers: { authorization: baoHanh },
    });

    expect(res.statusCode).toBe(200);
    const items = res.json().items as Record<string, unknown>[];
    expect(items).toHaveLength(2);

    const [cu, moi] = items;
    // Nguyên vẹn TỪNG NGƯỠNG, không chỉ "vẫn còn dòng đó"
    expect(cu!.id).toBe(v1.id);
    expect(cu!.version).toBe(1);
    expect(cu!.soc_max_pct).toBe(90);
    expect(cu!.max_power_kw).toBe(120);
    expect(cu!.allowed_hours).toEqual([{ from: '22:00', to: '06:00' }]);

    expect(moi!.version).toBe(2);
    expect(moi!.soc_max_pct).toBe(80);
    expect(moi!.supersedes_id).toBe(v1.id);
    expect(moi!.change_note).toBe('Siết SOC max theo khuyến cáo nhà sản xuất pin');
  });

  it('version mới chỉ gửi 1 ngưỡng thì các ngưỡng còn lại GIỮ NGUYÊN, không lặng lẽ mất', async () => {
    // Ca hỏng thầm lặng nguy hiểm nhất của F-B1: soạn "siết SOC max xuống 80" mà vô tình
    // gỡ luôn khung giờ ToU và trần công suất → nới lỏng bảo hành không ai chủ ý.
    await banHanhV1();
    const v2 = await taoVersion2();

    expect(v2.allowed_hours).toEqual([{ from: '22:00', to: '06:00' }]);
    expect(v2.max_power_kw).toBe(120);
    expect(v2.soc_min_pct).toBe(20);
    expect(v2.soc_max_pct).toBe(80); // riêng cái được gửi thì đổi
  });

  it('gửi null là chủ ý BỎ giới hạn', async () => {
    await banHanhV1();

    const res = await h.app.inject({
      method: 'POST',
      url: '/charging-policies/BH-DOI-A/versions',
      headers: { authorization: baoHanh },
      payload: {
        allowed_hours: null,
        effective_from: '2026-06-01T00:00:00Z',
        change_note: 'Bỏ ràng buộc khung giờ theo phụ lục hợp đồng',
      },
    });

    expect(res.statusCode, res.body).toBe(201);
    expect(res.json().allowed_hours).toBeNull();
    expect(res.json().max_power_kw).toBe(120); // cái không gửi vẫn giữ
  });

  it('ngưỡng kế thừa mâu thuẫn với ngưỡng mới bị chặn (400)', async () => {
    await banHanhV1(); // soc_min 20

    const res = await h.app.inject({
      method: 'POST',
      url: '/charging-policies/BH-DOI-A/versions',
      headers: { authorization: baoHanh },
      payload: { soc_max_pct: 15, effective_from: '2026-06-01T00:00:00Z' },
    });

    expect(res.statusCode, res.body).toBe(400);
    expect(res.json().error.message).toContain('SOC max');
  });
});

describe('F-B1 — phiên sạc quá khứ dùng version hiệu lực TẠI THỜI ĐIỂM SẠC', () => {
  it('cùng một xe, hai mốc thời gian khác nhau ra hai version khác nhau', async () => {
    await banHanhV1(); // hiệu lực từ 2026-01-01
    await taoVersion2(); // hiệu lực từ 2026-06-01, SOC max 80

    // Phiên sạc THÁNG 3 — trước khi chính sách đổi
    const luc = await chinhSachHieuLuc(h.db, w.vehicleA1, new Date('2026-03-15T10:00:00Z'));
    // Phiên sạc THÁNG 7 — sau khi chính sách đổi
    const nay = await chinhSachHieuLuc(h.db, w.vehicleA1, new Date('2026-07-15T10:00:00Z'));

    expect(luc?.version).toBe(1);
    expect(luc?.soc_max_pct).toBe(90);
    expect(nay?.version).toBe(2);
    expect(nay?.soc_max_pct).toBe(80);
  });

  it('API /vehicles/:id/charging-policy?at= trả đúng version của mốc được hỏi', async () => {
    await banHanhV1();
    await taoVersion2();

    const cu = await h.app.inject({
      method: 'GET',
      url: `/vehicles/${w.vehicleA1}/charging-policy?at=2026-03-15T10:00:00Z`,
      headers: { authorization: baoHanh },
    });
    const moi = await h.app.inject({
      method: 'GET',
      url: `/vehicles/${w.vehicleA1}/charging-policy?at=2026-07-15T10:00:00Z`,
      headers: { authorization: baoHanh },
    });

    expect((cu.json().chinh_sach as { version: number }).version).toBe(1);
    expect((moi.json().chinh_sach as { version: number }).version).toBe(2);
  });

  it('trước ngày hiệu lực của version 1 thì KHÔNG có chính sách nào — không tụt về bừa', async () => {
    await banHanhV1();

    const truoc = await chinhSachHieuLuc(h.db, w.vehicleA1, new Date('2025-12-31T00:00:00Z'));

    expect(truoc).toBeNull();
  });

  it('phạm vi hẹp thắng phạm vi rộng: chính sách riêng cho xe đè chính sách của đội', async () => {
    await banHanhV1(); // fleet
    const rieng = await h.app.inject({
      method: 'POST',
      url: '/charging-policies',
      headers: { authorization: baoHanh },
      payload: {
        code: 'BH-XE-A1',
        name: 'Ngoại lệ ký riêng cho xe A1',
        scope_type: 'vehicle',
        vehicle_id: w.vehicleA1,
        soc_max_pct: 100,
        effective_from: '2026-02-01T00:00:00Z',
      },
    });
    expect(rieng.statusCode, rieng.body).toBe(201);

    const ap = await chinhSachHieuLuc(h.db, w.vehicleA1, new Date('2026-03-15T10:00:00Z'));
    // Xe A2 cùng đội nhưng không có ngoại lệ → vẫn theo chính sách đội
    const apA2 = await chinhSachHieuLuc(h.db, w.vehicleA2, new Date('2026-03-15T10:00:00Z'));

    expect(ap?.code).toBe('BH-XE-A1');
    expect(apA2?.code).toBe('BH-DOI-A');
  });

  it('ngừng hẳn chính sách: phiên SAU đó không còn chính sách, phiên TRƯỚC đó vẫn có', async () => {
    await banHanhV1();
    const ngung = await h.app.inject({
      method: 'POST',
      url: '/charging-policies/BH-DOI-A/ngung',
      headers: { authorization: baoHanh },
      payload: { effective_to: '2026-05-01T00:00:00Z' },
    });
    expect(ngung.statusCode, ngung.body).toBe(200);

    const truoc = await chinhSachHieuLuc(h.db, w.vehicleA1, new Date('2026-04-01T00:00:00Z'));
    const sau = await chinhSachHieuLuc(h.db, w.vehicleA1, new Date('2026-06-01T00:00:00Z'));

    expect(truoc?.version).toBe(1);
    expect(sau).toBeNull();
  });
});

describe('F-B1 — kịch bản xấu: không sửa đè được', () => {
  it('UPDATE thẳng vào DB để đổi ngưỡng bị trigger chặn', async () => {
    const v1 = await banHanhV1();

    await expect(
      h.db.query(`UPDATE charging_policies SET soc_max_pct = 100 WHERE id = $1`, [v1.id]),
    ).rejects.toThrow(/KHÔNG được sửa đè/);

    const con = await h.db.query(
      `SELECT soc_max_pct::float8 AS v FROM charging_policies WHERE id = $1`,
      [v1.id],
    );
    expect(con.rows[0]!.v).toBe(90);
  });

  it('DELETE version cũ bị trigger chặn', async () => {
    const v1 = await banHanhV1();

    await expect(
      h.db.query(`DELETE FROM charging_policies WHERE id = $1`, [v1.id]),
    ).rejects.toThrow(/KHÔNG được xoá/);
  });

  it('version mới có hiệu lực LÙI VỀ TRƯỚC version cũ bị từ chối (409)', async () => {
    await banHanhV1(); // hiệu lực 2026-01-01

    const res = await h.app.inject({
      method: 'POST',
      url: '/charging-policies/BH-DOI-A/versions',
      headers: { authorization: baoHanh },
      payload: { soc_max_pct: 80, effective_from: '2025-06-01T00:00:00Z' },
    });

    expect(res.statusCode, res.body).toBe(409);
    expect(res.json().error.code).toBe('vi_pham_quy_tac_version');
    expect(res.json().error.message).toContain('hiệu lực SAU');
  });

  it('ngừng hẳn rồi thì không thêm version mới được', async () => {
    await banHanhV1();
    await h.app.inject({
      method: 'POST',
      url: '/charging-policies/BH-DOI-A/ngung',
      headers: { authorization: baoHanh },
      payload: {},
    });

    const res = await h.app.inject({
      method: 'POST',
      url: '/charging-policies/BH-DOI-A/versions',
      headers: { authorization: baoHanh },
      payload: { soc_max_pct: 80, effective_from: '2027-01-01T00:00:00Z' },
    });

    expect(res.statusCode, res.body).toBe(409);
    expect(res.json().error.message).toContain('đã ngừng hẳn');
  });

  it('trùng mã chính sách → 409 kèm hướng dẫn tạo version', async () => {
    await banHanhV1();

    const res = await h.app.inject({
      method: 'POST',
      url: '/charging-policies',
      headers: { authorization: baoHanh },
      payload: {
        code: 'BH-DOI-A',
        name: 'Trùng mã',
        scope_type: 'fleet',
        customer_id: w.customerAId,
      },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.message).toContain('/versions');
  });

  it('khung giờ sai định dạng / SOC max ≤ min bị chặn ở 400, không xuống tới DB', async () => {
    const socNguoc = await h.app.inject({
      method: 'POST',
      url: '/charging-policies',
      headers: { authorization: baoHanh },
      payload: {
        code: 'BH-SAI-1',
        name: 'SOC ngược',
        scope_type: 'fleet',
        customer_id: w.customerAId,
        soc_min_pct: 90,
        soc_max_pct: 20,
      },
    });
    const phamViThua = await h.app.inject({
      method: 'POST',
      url: '/charging-policies',
      headers: { authorization: baoHanh },
      payload: {
        code: 'BH-SAI-2',
        name: 'Phạm vi thừa',
        scope_type: 'fleet',
        customer_id: w.customerAId,
        vehicle_id: w.vehicleA1,
      },
    });

    expect(socNguoc.statusCode).toBe(400);
    expect(socNguoc.json().error.code).toBe('nguong_khong_hop_le');
    expect(phamViThua.statusCode).toBe(400);
    expect(phamViThua.json().error.code).toBe('pham_vi_khong_hop_le');
  });
});

describe('F-B1 — phân quyền (sheet 9: chỉ Bảo hành + Admin cấu hình được)', () => {
  it('Admin cũng ban hành được', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/charging-policies',
      headers: { authorization: admin },
      payload: {
        code: 'BH-ADMIN',
        name: 'Do admin ban hành',
        scope_type: 'model',
        vehicle_model: 'EVT-262',
      },
    });

    expect(res.statusCode, res.body).toBe(201);
  });

  it('Vận hành Energy / tài xế / QL đội KHÔNG cấu hình được chính sách', async () => {
    for (const role of ['energy_ops', 'driver', 'fleet_manager'] as const) {
      const token = await loginAs(h.app, w.users[role].phone);
      const res = await h.app.inject({
        method: 'POST',
        url: '/charging-policies',
        headers: { authorization: token },
        payload: {
          code: `BH-${role}`,
          name: 'Không được phép',
          scope_type: 'model',
          vehicle_model: 'EVT-262',
        },
      });

      expect(res.statusCode, `${role} không được cấu hình chính sách`).toBe(403);
    }
  });

  it('Vận hành Energy không đọc được chính sách bảo hành (sheet 9 dòng đó là "—")', async () => {
    const token = await loginAs(h.app, w.users.energy_ops.phone);

    const res = await h.app.inject({
      method: 'GET',
      url: '/charging-policies',
      headers: { authorization: token },
    });

    expect(res.statusCode).toBe(403);
  });

  it('tài xế chỉ thấy chính sách áp cho xe MÌNH, không thấy chính sách đội khác', async () => {
    await banHanhV1(); // đội A — xe của tài xế
    const doiB = await h.app.inject({
      method: 'POST',
      url: '/charging-policies',
      headers: { authorization: baoHanh },
      payload: {
        code: 'BH-DOI-B',
        name: 'Chính sách đội B',
        scope_type: 'fleet',
        customer_id: w.customerBId,
      },
    });
    expect(doiB.statusCode, doiB.body).toBe(201);

    const token = await loginAs(h.app, w.users.driver.phone);
    const res = await h.app.inject({
      method: 'GET',
      url: '/charging-policies',
      headers: { authorization: token },
    });

    expect(res.statusCode).toBe(200);
    const ma = (res.json().items as { code: string }[]).map((i) => i.code);
    expect(ma).toContain('BH-DOI-A');
    expect(ma).not.toContain('BH-DOI-B');
  });
});

/** Version 2: siết SOC max từ 90% xuống 80%, hiệu lực từ 2026-06-01. */
async function taoVersion2(): Promise<Record<string, unknown>> {
  const res = await h.app.inject({
    method: 'POST',
    url: '/charging-policies/BH-DOI-A/versions',
    headers: { authorization: baoHanh },
    payload: {
      soc_max_pct: 80,
      effective_from: '2026-06-01T00:00:00Z',
      change_note: 'Siết SOC max theo khuyến cáo nhà sản xuất pin',
    },
  });
  expect(res.statusCode, res.body).toBe(201);
  return res.json() as Record<string, unknown>;
}
