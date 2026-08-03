// F-H1 — Thanh toán phiên sạc (SANDBOX). Ba kịch bản BẮT BUỘC của prompt 08.4 nằm ở
// describe "ba tình huống thật của cổng thanh toán".
//
// Cả file này chạy trên cổng GIẢ nội bộ (MockPaymentGateway) — không gọi mạng, không tài
// khoản VNPay, không tiền thật (quy tắc 12). Đường code đi qua giống hệt bản VNPay: cùng
// interface, cùng bước kiểm chữ ký, cùng chốt chặn chống trùng ở DB.
import { MockCsmsCommander, MockPaymentGateway } from '@g3/contracts';
import pg from 'pg';
import { testDatabaseUrl } from '@g3/db';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { loadConfig } from '../config';
import { loginAs, TEST_JWT_SECRET, TEST_OTP_CODE } from '../test/app-harness';
import { seedWorld, taoPhienSac, type TestWorld } from '../test/world';

let app: FastifyInstance;
let db: pg.Client;
let w: TestWorld;
let cong: MockPaymentGateway;
let csms: MockCsmsCommander;
let taiXe: string;

/** Đơn giá GIẢ dùng trong test — khớp mặc định CHARGING_PRICE_VND_PER_KWH. */
const GIA = 3500;

beforeAll(async () => {
  db = new pg.Client({ connectionString: testDatabaseUrl() });
  await db.connect();
  cong = new MockPaymentGateway();
  csms = new MockCsmsCommander();
  app = await buildApp({
    logger: false,
    config: loadConfig({ JWT_SECRET: TEST_JWT_SECRET }),
    db,
    cong,
    csms,
    otpCodeFactory: () => TEST_OTP_CODE,
  });
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await db.end();
});

beforeEach(async () => {
  w = await seedWorld(db);
  cong.daTao.clear();
  csms.xoa();
  csms.loi = false;
  csms.ketQua = 'Accepted';
  taiXe = await loginAs(app, w.users.driver.phone);
});

/** Phiên sạc đã đóng, 40 kWh → 140.000 VNĐ. */
async function phienDaDong(kwh = 40): Promise<string> {
  return taoPhienSac(db, w, {
    startMs: Date.parse('2026-06-12T02:00:00Z'),
    endMs: Date.parse('2026-06-12T03:00:00Z'),
    energyKwh: kwh,
    ocppTxId: 'TX-THANH-TOAN-1',
  });
}

async function taoGiaoDich(sessionId: string): Promise<Record<string, unknown>> {
  const res = await app.inject({
    method: 'POST',
    url: `/payments/session/${sessionId}`,
    headers: { authorization: taiXe },
  });
  expect(res.statusCode, res.body).toBe(200);
  return res.json() as Record<string, unknown>;
}

function guiWebhook(duLieu: Record<string, string>): Promise<{ statusCode: number; body: string }> {
  return app.inject({ method: 'POST', url: '/payments/webhook/mock', payload: duLieu });
}

describe('F-H1 — luồng quét QR → sạc → trả tiền', () => {
  it('bước 1: quét QR gửi RemoteStart tới trụ, CHƯA tính tiền', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/payments/qr/start',
      headers: { authorization: taiXe },
      payload: {
        station_code: 'G3-TEST-ST-01',
        connector_id: 1,
        vehicle_id: w.vehicleA1,
      },
    });

    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().trang_thai).toBe('da_gui_lenh');
    expect(csms.lenh).toHaveLength(1);
    expect(csms.lenh[0]).toMatchObject({
      loai: 'start',
      stationCode: 'G3-TEST-ST-01',
      connectorId: 1,
      idTag: 'G3-TEST-A1', // Phase 1: idTag = VIN (ADR-005)
    });
    // Chưa sạc thì chưa có giao dịch nào
    const gd = await db.query(`SELECT count(*)::int AS n FROM payment_transactions`);
    expect(gd.rows[0]!.n).toBe(0);
  });

  it('bước 2: phiên đóng → tạo lệnh thu tiền theo kWh công tơ trụ', async () => {
    const sid = await phienDaDong(40);

    const gd = await taoGiaoDich(sid);

    expect(gd.amount_vnd).toBe(40 * GIA);
    expect(gd.energy_kwh).toBe(40);
    expect(gd.status).toBe('pending');
    expect(String(gd.pay_url)).toContain('http');
    expect(gd.session_id).toBe(sid);
  });

  it('bước 3: webhook thành công → giao dịch succeeded, có mốc trả tiền', async () => {
    const sid = await phienDaDong(40);
    const gd = await taoGiaoDich(sid);

    const res = await guiWebhook(cong.taoWebhook(gd.reference as string));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ket_qua).toBe('ok');
    const sau = await db.query(
      `SELECT status::text AS status, paid_at, gateway_ref FROM payment_transactions WHERE id = $1`,
      [gd.id],
    );
    expect(sau.rows[0]!.status).toBe('succeeded');
    expect(sau.rows[0]!.paid_at).not.toBeNull();
    expect(String(sau.rows[0]!.gateway_ref)).toContain('MOCK-');
  });

  it('gọi lại bước 2 cho cùng phiên KHÔNG tạo giao dịch thứ hai', async () => {
    // App mất mạng rồi mở lại là chuyện thường — không được sinh hai lệnh thu tiền.
    const sid = await phienDaDong(40);

    const lan1 = await taoGiaoDich(sid);
    const lan2 = await taoGiaoDich(sid);

    expect(lan2.id).toBe(lan1.id);
    const dem = await db.query(`SELECT count(*)::int AS n FROM payment_transactions`);
    expect(dem.rows[0]!.n).toBe(1);
  });
});

describe('F-H1 — ba tình huống thật của cổng thanh toán (test BẮT BUỘC)', () => {
  it('① WEBHOOK ĐẾN HAI LẦN → chỉ MỘT giao dịch thành công', async () => {
    // Cổng retry khi không nhận được phản hồi lần đầu — hành vi bình thường, không phải lỗi.
    const sid = await phienDaDong(40);
    const gd = await taoGiaoDich(sid);
    const webhook = cong.taoWebhook(gd.reference as string, { webhookId: 'WH-TRUNG-LAP-001' });

    const lan1 = await guiWebhook(webhook);
    const lan2 = await guiWebhook(webhook);

    expect(lan1.statusCode).toBe(200);
    expect(JSON.parse(lan1.body).ket_qua).toBe('ok');
    // Lần hai phải báo "đã xử lý" chứ KHÔNG báo lỗi — báo lỗi thì cổng retry mãi.
    expect(lan2.statusCode).toBe(200);
    expect(JSON.parse(lan2.body).ket_qua).toBe('da_xu_ly_truoc_do');

    const dem = await db.query(
      `SELECT count(*)::int AS n FROM payment_transactions
       WHERE session_id = $1 AND status = 'succeeded'`,
      [sid],
    );
    expect(dem.rows[0]!.n, 'đúng 1 giao dịch thành công').toBe(1);
    // Và tổng tiền thu về không bị nhân đôi
    const tong = await db.query(
      `SELECT coalesce(sum(amount_vnd), 0)::float8 AS t FROM payment_transactions
       WHERE session_id = $1 AND status = 'succeeded'`,
      [sid],
    );
    expect(tong.rows[0]!.t).toBe(40 * GIA);
  });

  it('② WEBHOOK ĐẾN TRƯỚC KHI PHIÊN ĐÓNG → nhận tiền, nối phiên khi phiên về', async () => {
    // Trụ mất kết nối rồi gửi StopTransaction bù sau (NF-09), trong khi khách đã trả tiền.
    // Từ chối webhook = mất tiền của khách. Bịa phiên sạc = làm hỏng bảng append-only.
    const txRes = await db.query<{ transaction_id: number }>(
      `INSERT INTO ocpp_transactions
         (station_id, connector_id, vehicle_id, id_tag, meter_start_wh, last_meter_wh, started_at)
       VALUES ($1, $2, $3, 'G3-TEST-A1', 1000, 41000, '2026-06-12T02:00:00Z')
       RETURNING transaction_id`,
      [w.stationId, w.connectorId, w.vehicleA1],
    );
    const txId = txRes.rows[0]!.transaction_id;

    // Tài xế trả tiền ngay tại trụ, phiên CHƯA có trong charging_sessions
    const taoRes = await app.inject({
      method: 'POST',
      url: `/payments/ocpp-transaction/${txId}`,
      headers: { authorization: taiXe },
    });
    expect(taoRes.statusCode, taoRes.body).toBe(200);
    const gd = taoRes.json() as Record<string, unknown>;
    expect(gd.energy_kwh).toBe(40); // (41000 - 1000) Wh
    expect(gd.session_id, 'phiên chưa tồn tại nên chưa nối được').toBeNull();

    const webhookRes = await guiWebhook(cong.taoWebhook(gd.reference as string));
    expect(webhookRes.statusCode).toBe(200);

    const moCoi = await db.query(
      `SELECT status::text AS status, session_id FROM payment_transactions WHERE id = $1`,
      [gd.id],
    );
    expect(moCoi.rows[0]!.status, 'tiền vẫn được ghi nhận').toBe('succeeded');
    expect(moCoi.rows[0]!.session_id).toBeNull();
    // Và KHÔNG có phiên sạc nào bị bịa ra để có chỗ gắn tiền
    const phien = await db.query(`SELECT count(*)::int AS n FROM charging_sessions`);
    expect(phien.rows[0]!.n).toBe(0);

    // Bây giờ trụ nối lại mạng và gửi StopTransaction bù → phiên được ghi
    const sid = await taoPhienSac(db, w, {
      startMs: Date.parse('2026-06-12T02:00:00Z'),
      endMs: Date.parse('2026-06-12T03:00:00Z'),
      energyKwh: 40,
      ocppTxId: String(txId),
    });

    // Job nối phiên chạy → giao dịch mồ côi tìm được nhà
    const { noiCacGiaoDichMoCoi } = await import('../modules/payments/service');
    const soNoi = await noiCacGiaoDichMoCoi(db);

    expect(soNoi).toBe(1);
    const sau = await db.query(`SELECT session_id FROM payment_transactions WHERE id = $1`, [
      gd.id,
    ]);
    expect(sau.rows[0]!.session_id, 'đã nối đúng phiên vừa về').toBe(sid);
  });

  it('③ MẤT SÓNG GIỮA PHIÊN → phiên giữ nguyên, thu tiền sau', async () => {
    // Tiêu chí F-H1: "hoạt động khi sóng yếu (giữ phiên, thu sau)".
    const sid = await phienDaDong(55);

    // Chưa thu được tiền: giao dịch chưa tạo (app không có mạng lúc rút súng)
    const chuaThu = await app.inject({
      method: 'GET',
      url: '/payments/chua-thu',
      headers: { authorization: await loginAs(app, w.users.admin.phone) },
    });
    expect(chuaThu.statusCode, chuaThu.body).toBe(200);
    const items = chuaThu.json().items as { session_id: string; energy_kwh: number }[];
    expect(items.map((i) => i.session_id)).toContain(sid);
    expect(items.find((i) => i.session_id === sid)!.energy_kwh).toBe(55);

    // Phiên sạc KHÔNG bị huỷ, KHÔNG bị sửa — vẫn nguyên số kWh
    const phien = await db.query(
      `SELECT energy_kwh::float8 AS kwh, ended_at FROM charging_sessions WHERE id = $1`,
      [sid],
    );
    expect(phien.rows[0]!.kwh).toBe(55);
    expect(phien.rows[0]!.ended_at).not.toBeNull();

    // Có sóng trở lại → thu tiền bình thường, đúng số kWh đã sạc
    const gd = await taoGiaoDich(sid);
    await guiWebhook(cong.taoWebhook(gd.reference as string));

    const sau = await db.query(
      `SELECT status::text AS status, amount_vnd::float8 AS tien
       FROM payment_transactions WHERE session_id = $1`,
      [sid],
    );
    expect(sau.rows[0]!.status).toBe('succeeded');
    expect(sau.rows[0]!.tien).toBe(55 * GIA);

    // Và phiên đó biến mất khỏi danh sách "chưa thu"
    const conLai = await app.inject({
      method: 'GET',
      url: '/payments/chua-thu',
      headers: { authorization: await loginAs(app, w.users.admin.phone) },
    });
    expect(
      (conLai.json().items as { session_id: string }[]).map((i) => i.session_id),
    ).not.toContain(sid);
  });
});

describe('F-H1 — kịch bản xấu', () => {
  it('webhook CHỮ KÝ SAI bị từ chối, không đổi trạng thái giao dịch', async () => {
    // Endpoint này công khai (cổng không đăng nhập được) nên chữ ký là xác thực DUY NHẤT.
    const sid = await phienDaDong(40);
    const gd = await taoGiaoDich(sid);
    const gia = { ...cong.taoWebhook(gd.reference as string), chu_ky: 'chu-ky-bia-dat' };

    const res = await guiWebhook(gia);

    expect(res.statusCode).toBe(200); // vẫn 200 để cổng không retry vô hạn
    expect(JSON.parse(res.body).ket_qua).toBe('tu_choi');
    expect(JSON.parse(res.body).ly_do).toBe('chu_ky_khong_hop_le');
    const sau = await db.query(
      `SELECT status::text AS status FROM payment_transactions WHERE id = $1`,
      [gd.id],
    );
    expect(sau.rows[0]!.status, 'giao dịch vẫn đang chờ').toBe('pending');
  });

  it('webhook báo SỐ TIỀN KHÁC số đã yêu cầu → từ chối', async () => {
    const sid = await phienDaDong(40);
    const gd = await taoGiaoDich(sid);
    const webhook = cong.taoWebhook(gd.reference as string, { amountVnd: 1000 });

    const res = await guiWebhook(webhook);

    expect(JSON.parse(res.body).ly_do).toBe('so_tien_khong_khop');
    const sau = await db.query(
      `SELECT status::text AS status FROM payment_transactions WHERE id = $1`,
      [gd.id],
    );
    expect(sau.rows[0]!.status).toBe('pending');
  });

  it('webhook cho mã tham chiếu KHÔNG TỒN TẠI → từ chối, không tạo bản ghi', async () => {
    const res = await guiWebhook(cong.taoWebhook('G3-KHONG-CO-THAT'));

    expect(JSON.parse(res.body).ly_do).toBe('khong_tim_thay_giao_dich');
    const dem = await db.query(`SELECT count(*)::int AS n FROM payment_transactions`);
    expect(dem.rows[0]!.n).toBe(0);
  });

  it('phiên CHƯA ĐÓNG thì không tạo được lệnh thu tiền', async () => {
    const res0 = await db.query<{ id: string }>(
      `INSERT INTO charging_sessions
         (vehicle_id, station_id, connector_id, ocpp_transaction_id, started_at, ended_at)
       VALUES ($1, $2, $3, 'TX-DANG-SAC', '2026-06-12T02:00:00Z', NULL)
       RETURNING id`,
      [w.vehicleA1, w.stationId, w.connectorId],
    );

    const res = await app.inject({
      method: 'POST',
      url: `/payments/session/${res0.rows[0]!.id}`,
      headers: { authorization: taiXe },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('phien_chua_dong');
  });

  it('CSMS không kết nối được → 503 kèm hướng dẫn, KHÔNG phải lỗi hệ thống chung chung', async () => {
    csms.loi = true;

    const res = await app.inject({
      method: 'POST',
      url: '/payments/qr/start',
      headers: { authorization: taiXe },
      payload: { station_code: 'G3-TEST-ST-01', connector_id: 1, vehicle_id: w.vehicleA1 },
    });

    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('khong_ket_noi_duoc_tru');
    expect(res.json().error.message).toContain('SOS');
  });

  it('trụ từ chối mở phiên → báo rõ cho tài xế, không im lặng', async () => {
    csms.ketQua = 'Rejected';

    const res = await app.inject({
      method: 'POST',
      url: '/payments/qr/start',
      headers: { authorization: taiXe },
      payload: { station_code: 'G3-TEST-ST-01', connector_id: 1, vehicle_id: w.vehicleA1 },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().trang_thai).toBe('tru_tu_choi');
    expect(res.json().ghi_chu).toContain('Thử trụ khác');
  });

  it('tài xế KHÔNG trả tiền được cho phiên của xe đội khác', async () => {
    const sid = await taoPhienSac(db, w, {
      vehicleId: w.vehicleB1,
      startMs: Date.parse('2026-06-12T02:00:00Z'),
      endMs: Date.parse('2026-06-12T03:00:00Z'),
      energyKwh: 40,
      ocppTxId: 'TX-DOI-B',
    });

    const res = await app.inject({
      method: 'POST',
      url: `/payments/session/${sid}`,
      headers: { authorization: taiXe },
    });

    expect(res.statusCode).toBe(404);
  });

  it('quét QR cho trụ không tồn tại → 404 rõ ràng', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/payments/qr/start',
      headers: { authorization: taiXe },
      payload: { station_code: 'G3-TEST-ST-01', connector_id: 99, vehicle_id: w.vehicleA1 },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('khong_tim_thay_tru');
  });
});

describe('F-H1 — không lưu dữ liệu thẻ (mục Ranh giới CLAUDE.md)', () => {
  it('KHÔNG endpoint thanh toán nào nhận trường liên quan tới thẻ', async () => {
    // Chốt chặn chống hồi quy: ai đó thêm "cho tiện" là test đỏ ngay, chứ không phải phát
    // hiện khi đã có dữ liệu thẻ nằm trong DB.
    const spec = app.swagger() as {
      paths: Record<string, Record<string, { requestBody?: unknown; parameters?: unknown }>>;
    };
    const cam = [
      'card_number',
      'cardnumber',
      'cvv',
      'cvc',
      'card_holder',
      'expiry',
      'pan',
      'so_the',
    ];
    const viPham: string[] = [];
    for (const [duongDan, methods] of Object.entries(spec.paths)) {
      if (!duongDan.startsWith('/payments')) continue;
      for (const [method, op] of Object.entries(methods)) {
        const chuoi = JSON.stringify(op).toLowerCase();
        for (const tu of cam) {
          if (chuoi.includes(tu)) viPham.push(`${method.toUpperCase()} ${duongDan} → ${tu}`);
        }
      }
    }
    expect(viPham).toEqual([]);
  });

  it('bảng payment_transactions không có cột nào mang dữ liệu thẻ', async () => {
    const res = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'payment_transactions'`,
    );
    const cot = res.rows.map((r) => r.column_name.toLowerCase());
    for (const tu of ['card', 'cvv', 'cvc', 'pan', 'the']) {
      expect(
        cot.filter((c) => c.includes(tu)),
        `cột chứa "${tu}"`,
      ).toEqual([]);
    }
  });
});
