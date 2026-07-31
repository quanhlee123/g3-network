// F-A2 — Cảnh báo pin phân cấp: đúng ngưỡng + chống spam (quy tắc 7 — luồng trọng yếu).
// D-03 ĐÃ CHỐT: không có khái niệm "chuyến", chống spam theo vòng đời cảnh báo (ADR-006).
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MockNotifier } from '@g3/contracts';
import { testDatabaseUrl } from '@g3/db';
import {
  BatteryAlertEvaluator,
  DAC_TA_MUC,
  docNguongPin,
  quyetDinhCanhBao,
  type MucPin,
  type NguongPin,
} from './battery-alerts';

/** Bộ ngưỡng mặc định của PRD, dựng bằng tay cho các test hàm thuần. */
const nguongMacDinh: NguongPin[] = [
  { muc: 'som', pct: 30, bien_tre_pct: 5, ...DAC_TA_MUC.som },
  { muc: 'chinh', pct: 20, bien_tre_pct: 5, ...DAC_TA_MUC.chinh },
  { muc: 'nguy_cap', pct: 10, bien_tre_pct: 5, ...DAC_TA_MUC.nguy_cap },
];

describe('quyetDinhCanhBao — hàm thuần, không cần DB', () => {
  const khong = new Set<MucPin>();

  it('đúng 3 mức của F-A2: sớm 30 / chính 20 / nguy cấp 10', () => {
    expect(nguongMacDinh.map((n) => n.severity)).toEqual([1, 2, 3]);
    expect(DAC_TA_MUC.nguy_cap.type).toBe('battery_critical');
    expect(DAC_TA_MUC.chinh.type).toBe('battery_low');
  });

  it('SOC 31% chưa chạm ngưỡng nào', () => {
    expect(quyetDinhCanhBao(31, nguongMacDinh, khong).can_ban).toEqual([]);
  });

  it('SOC đúng bằng 30% đã tính là chạm ngưỡng (<=, không phải <)', () => {
    expect(quyetDinhCanhBao(30, nguongMacDinh, khong).can_ban.map((n) => n.muc)).toEqual(['som']);
  });

  it('tụt thẳng xuống 8%: bắn cả 3 mức, không bỏ sót mức nào', () => {
    expect(quyetDinhCanhBao(8, nguongMacDinh, khong).can_ban.map((n) => n.muc)).toEqual([
      'som',
      'chinh',
      'nguy_cap',
    ]);
  });

  it('mức đang mở thì KHÔNG bắn lại (chống spam)', () => {
    const dangMo = new Set<MucPin>(['som', 'chinh']);
    expect(quyetDinhCanhBao(19, nguongMacDinh, dangMo).can_ban).toEqual([]);
  });

  it('SOC rung quanh ngưỡng vẫn im lặng nhờ biên trễ', () => {
    const dangMo = new Set<MucPin>(['som', 'chinh']);
    for (const soc of [20.1, 21, 24.9, 19.9]) {
      const kq = quyetDinhCanhBao(soc, nguongMacDinh, dangMo);
      expect(kq.can_ban, `SOC ${soc}`).toEqual([]);
      expect(kq.can_go, `SOC ${soc}`).toEqual([]);
    }
  });

  it('SOC hồi lên trên ngưỡng + biên trễ thì gỡ cảnh báo, mức đó nạp đạn lại', () => {
    const dangMo = new Set<MucPin>(['som', 'chinh']);
    const kq = quyetDinhCanhBao(25, nguongMacDinh, dangMo);
    expect(kq.can_go.map((n) => n.muc)).toEqual(['chinh']);
    expect(kq.can_ban).toEqual([]);
  });

  it('biên trễ đọc theo TỪNG mức, không phải hằng số chung', () => {
    const nguong: NguongPin[] = [{ muc: 'chinh', pct: 20, bien_tre_pct: 15, ...DAC_TA_MUC.chinh }];
    const dangMo = new Set<MucPin>(['chinh']);
    // 25% đủ gỡ với biên trễ 5 nhưng KHÔNG đủ với biên trễ 15 của chính dòng cấu hình này
    expect(quyetDinhCanhBao(25, nguong, dangMo).can_go).toEqual([]);
    expect(quyetDinhCanhBao(35, nguong, dangMo).can_go.map((n) => n.muc)).toEqual(['chinh']);
  });
});

describe('docNguongPin — ngưỡng cấu hình theo đội/xe (F-A2)', () => {
  let db: pg.Client;
  let customerId: string;
  let vehicleId: string;
  let vehicleKhac: string;

  beforeAll(async () => {
    db = new pg.Client({ connectionString: testDatabaseUrl() });
    await db.connect();
    const customer = await db.query<{ id: string }>(
      `INSERT INTO customers (name, contract_no) VALUES ('KH ngưỡng (GIẢ)', 'HD-FA2-NG')
       ON CONFLICT (contract_no) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    );
    customerId = customer.rows[0]!.id;
    const v1 = await db.query<{ id: string }>(
      `INSERT INTO vehicles (vin, model, customer_id) VALUES ('G3-FA2-NG-001', 'EVT-262', $1)
       ON CONFLICT (vin) DO UPDATE SET model = EXCLUDED.model RETURNING id`,
      [customerId],
    );
    vehicleId = v1.rows[0]!.id;
    const v2 = await db.query<{ id: string }>(
      `INSERT INTO vehicles (vin, model, customer_id) VALUES ('G3-FA2-NG-002', 'EVT-400', $1)
       ON CONFLICT (vin) DO UPDATE SET model = EXCLUDED.model RETURNING id`,
      [customerId],
    );
    vehicleKhac = v2.rows[0]!.id;
  });

  afterAll(async () => {
    await db.end();
  });

  beforeEach(async () => {
    // Chỉ xoá dòng riêng, giữ 3 dòng mặc định toàn hệ của migration 0018
    await db.query(
      `DELETE FROM battery_alert_thresholds WHERE customer_id IS NOT NULL OR vehicle_id IS NOT NULL`,
    );
  });

  it('chưa cấu hình riêng: dùng mặc định 30/20/10 của PRD', async () => {
    const nguongs = await docNguongPin(db, vehicleId);
    expect(nguongs.map((n) => n.pct)).toEqual([30, 20, 10]);
    expect(nguongs.map((n) => n.muc)).toEqual(['som', 'chinh', 'nguy_cap']);
  });

  it('ngưỡng của ĐỘI đè lên mặc định, áp cho mọi xe trong đội', async () => {
    await db.query(
      `INSERT INTO battery_alert_thresholds (customer_id, muc, nguong_pct) VALUES ($1, 'chinh', 25)`,
      [customerId],
    );

    for (const xe of [vehicleId, vehicleKhac]) {
      const nguongs = await docNguongPin(db, xe);
      expect(nguongs.find((n) => n.muc === 'chinh')?.pct, `xe ${xe}`).toBe(25);
      // hai mức còn lại vẫn là mặc định
      expect(nguongs.find((n) => n.muc === 'som')?.pct).toBe(30);
    }
  });

  it('ngưỡng của XE đè lên cả ngưỡng đội (ưu tiên xe > đội > mặc định)', async () => {
    await db.query(
      `INSERT INTO battery_alert_thresholds (customer_id, muc, nguong_pct) VALUES ($1, 'chinh', 25)`,
      [customerId],
    );
    await db.query(
      `INSERT INTO battery_alert_thresholds (vehicle_id, muc, nguong_pct, bien_tre_pct)
       VALUES ($1, 'chinh', 40, 8)`,
      [vehicleId],
    );

    const cuaXe = await docNguongPin(db, vehicleId);
    const cuaXeKhac = await docNguongPin(db, vehicleKhac);

    expect(cuaXe.find((n) => n.muc === 'chinh')?.pct).toBe(40);
    expect(cuaXe.find((n) => n.muc === 'chinh')?.bien_tre_pct).toBe(8);
    // Xe khác cùng đội KHÔNG bị ảnh hưởng bởi cấu hình riêng của xe này
    expect(cuaXeKhac.find((n) => n.muc === 'chinh')?.pct).toBe(25);
  });

  it('ngưỡng riêng của ĐỘI KHÁC không lọt sang đội này', async () => {
    const khac = await db.query<{ id: string }>(
      `INSERT INTO customers (name, contract_no) VALUES ('KH khác (GIẢ)', 'HD-FA2-NG2')
       ON CONFLICT (contract_no) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    );
    await db.query(
      `INSERT INTO battery_alert_thresholds (customer_id, muc, nguong_pct) VALUES ($1, 'som', 50)`,
      [khac.rows[0]!.id],
    );

    const nguongs = await docNguongPin(db, vehicleId);
    expect(nguongs.find((n) => n.muc === 'som')?.pct).toBe(30);
  });

  it('DB chặn dòng vừa gắn xe vừa gắn đội (ràng buộc phạm vi)', async () => {
    await expect(
      db.query(
        `INSERT INTO battery_alert_thresholds (customer_id, vehicle_id, muc, nguong_pct)
         VALUES ($1, $2, 'som', 33)`,
        [customerId, vehicleId],
      ),
    ).rejects.toThrow(/pham_vi_check/);
  });

  it('DB chặn hai dòng mặc định toàn hệ cho cùng một mức', async () => {
    await expect(
      db.query(
        `INSERT INTO battery_alert_thresholds (customer_id, vehicle_id, muc, nguong_pct)
         VALUES (NULL, NULL, 'som', 35)`,
      ),
    ).rejects.toThrow(/duplicate key|unique/i);
  });
});

describe('BatteryAlertEvaluator — trạng thái nằm trong DB, chịu được restart', () => {
  let db: pg.Client;
  let vehicleId: string;
  let stationId: string;
  let notifier: MockNotifier;

  beforeAll(async () => {
    db = new pg.Client({ connectionString: testDatabaseUrl() });
    await db.connect();
    const customer = await db.query<{ id: string }>(
      `INSERT INTO customers (name, contract_no) VALUES ('KH F-A2 (GIẢ)', 'HD-FA2-001')
       ON CONFLICT (contract_no) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    );
    const vehicle = await db.query<{ id: string }>(
      `INSERT INTO vehicles (vin, model, customer_id) VALUES ('G3-FA2-VIN-0001', 'EVT-262', $1)
       ON CONFLICT (vin) DO UPDATE SET model = EXCLUDED.model RETURNING id`,
      [customer.rows[0]!.id],
    );
    vehicleId = vehicle.rows[0]!.id;
    const station = await db.query<{ id: string }>(
      `INSERT INTO charging_stations (code, name, location, status)
       VALUES ('G3-FA2-ST-01', 'Trạm F-A2 (GIẢ)',
               ST_SetSRID(ST_MakePoint(106.70, 10.80), 4326)::geography, 'active')
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    );
    stationId = station.rows[0]!.id;
    await db.query(
      `INSERT INTO connectors (station_id, ocpp_connector_id, max_power_kw, status)
       VALUES ($1, 1, 120, 'Available')
       ON CONFLICT (station_id, ocpp_connector_id) DO UPDATE SET status = 'Available'`,
      [stationId],
    );
  });

  afterAll(async () => {
    await db.end();
  });

  beforeEach(async () => {
    await db.query(`DELETE FROM alerts WHERE vehicle_id = $1`, [vehicleId]);
    await db.query(`DELETE FROM battery_alert_thresholds WHERE vehicle_id = $1`, [vehicleId]);
    notifier = new MockNotifier();
  });

  const taoBo = () => new BatteryAlertEvaluator(db, () => {}, notifier);

  const demCanhBao = async (): Promise<number> => {
    const res = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM alerts
       WHERE vehicle_id = $1 AND type IN ('battery_low', 'battery_critical')`,
      [vehicleId],
    );
    return res.rows[0]!.n;
  };

  const viTri = { lat: 10.81, lng: 106.71 };
  const gio = (phut: number) => new Date(Date.UTC(2026, 6, 1, 8, phut)).toISOString();

  it('xe tụt pin dần: mỗi mức chỉ bắn ĐÚNG 1 lần dù có 60 bản ghi', async () => {
    const ev = taoBo();
    let phut = 0;
    for (let soc = 40; soc >= 8; soc -= 0.5) {
      await ev.danhGia(vehicleId, soc, viTri, gio(phut++));
    }

    expect(await demCanhBao()).toBe(3);
    const alerts = await db.query<{ severity: number; type: string }>(
      `SELECT severity, type FROM alerts WHERE vehicle_id = $1 ORDER BY severity`,
      [vehicleId],
    );
    expect(alerts.rows.map((r) => r.severity)).toEqual([1, 2, 3]);
    expect(alerts.rows.at(-1)!.type).toBe('battery_critical');
  });

  it('đúng 3 thông báo, ĐÚNG THỨ TỰ sớm → chính → nguy cấp (F-F3)', async () => {
    const ev = taoBo();
    for (let soc = 40; soc >= 8; soc -= 0.5) await ev.danhGia(vehicleId, soc, viTri, gio(0));

    expect(notifier.events.map((e) => e.severity)).toEqual([1, 2, 3]);
    expect(notifier.events.map((e) => e.alert_type)).toEqual([
      'battery_low',
      'battery_low',
      'battery_critical',
    ]);
    // Mỗi thông báo gắn đúng alert vừa ghi (để app deep-link tới cảnh báo)
    for (const e of notifier.events) expect(e.alert_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('xe dao động 20.1% ↔ 19.9% nhiều lần: VẪN chỉ 1 cảnh báo mức chính', async () => {
    const ev = taoBo();
    await ev.danhGia(vehicleId, 21, viTri, gio(0)); // mở mức sớm
    let phut = 1;
    for (let i = 0; i < 10; i += 1) {
      await ev.danhGia(vehicleId, 19.9, viTri, gio(phut++));
      await ev.danhGia(vehicleId, 20.1, viTri, gio(phut++));
    }

    const res = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM alerts WHERE vehicle_id = $1 AND severity = 2`,
      [vehicleId],
    );
    expect(res.rows[0]!.n).toBe(1);
    expect(notifier.events.filter((e) => e.severity === 2)).toHaveLength(1);
  });

  it('ngưỡng riêng của xe có hiệu lực thật khi chạy (không chỉ khi đọc cấu hình)', async () => {
    await db.query(
      `INSERT INTO battery_alert_thresholds (vehicle_id, muc, nguong_pct) VALUES ($1, 'som', 50)`,
      [vehicleId],
    );
    const ev = taoBo();

    // SOC 45%: dưới ngưỡng riêng 50% nhưng TRÊN mặc định 30% → phải bắn nhờ cấu hình riêng
    await ev.danhGia(vehicleId, 45, viTri, gio(0));

    const res = await db.query<{ payload: { nguong_pct: number } }>(
      `SELECT payload FROM alerts WHERE vehicle_id = $1 AND severity = 1`,
      [vehicleId],
    );
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]!.payload.nguong_pct).toBe(50);
  });

  it('cảnh báo kèm gợi ý trạm gần nhất còn trống (F-A2)', async () => {
    const ev = taoBo();
    await ev.danhGia(vehicleId, 29, viTri, gio(0));

    const res = await db.query<{ payload: { tram_goi_y: { code: string; tru_trong: number } } }>(
      `SELECT payload FROM alerts WHERE vehicle_id = $1`,
      [vehicleId],
    );
    expect(res.rows[0]!.payload.tram_goi_y.code).toBe('G3-FA2-ST-01');
    expect(res.rows[0]!.payload.tram_goi_y.tru_trong).toBeGreaterThan(0);
    // Nội dung thông báo cho người phải nêu được trạm + khoảng cách (NF-12)
    expect(notifier.events[0]?.body).toContain('G3-FA2-ST-01');
    expect(notifier.events[0]?.body).toContain('km');
  });

  it('kịch bản xấu — trạm đều bận: vẫn bắn cảnh báo, chỉ là không có gợi ý trạm', async () => {
    await db.query(`UPDATE connectors SET status = 'Charging' WHERE station_id = $1`, [stationId]);
    const ev = taoBo();
    await ev.danhGia(vehicleId, 9, viTri, gio(0));
    await db.query(`UPDATE connectors SET status = 'Available' WHERE station_id = $1`, [stationId]);

    const res = await db.query<{ payload: { tram_goi_y: unknown } }>(
      `SELECT payload FROM alerts WHERE vehicle_id = $1 AND severity = 3`,
      [vehicleId],
    );
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]!.payload.tram_goi_y).toBeNull();
  });

  it('sạc xong rồi lại tụt pin: mức bắn lại (2 cảnh báo, cái đầu đã resolved)', async () => {
    const ev = taoBo();
    await ev.danhGia(vehicleId, 19, viTri, gio(0));
    await ev.danhGia(vehicleId, 90, viTri, gio(60));
    await ev.danhGia(vehicleId, 19, viTri, gio(120));

    const res = await db.query<{ status: string; severity: number }>(
      `SELECT status, severity FROM alerts WHERE vehicle_id = $1 ORDER BY triggered_at, severity`,
      [vehicleId],
    );
    expect(res.rows).toHaveLength(4);
    expect(res.rows.filter((r) => r.status === 'resolved')).toHaveLength(2);
    expect(res.rows.filter((r) => r.status === 'open')).toHaveLength(2);
  });

  it('kịch bản xấu — ingest khởi động lại: nạp trạng thái từ DB, KHÔNG bắn trùng', async () => {
    const truoc = taoBo();
    await truoc.danhGia(vehicleId, 19, viTri, gio(0));
    expect(await demCanhBao()).toBe(2);

    const sau = taoBo();
    await sau.danhGia(vehicleId, 18, viTri, gio(5));
    await sau.danhGia(vehicleId, 17, viTri, gio(10));

    expect(await demCanhBao()).toBe(2);
  });

  it('kịch bản xấu — bản ghi thiếu SOC (null) không sinh cảnh báo, không nổ', async () => {
    const ev = taoBo();
    await expect(ev.danhGia(vehicleId, null, viTri, gio(0))).resolves.toBe(0);
    expect(await demCanhBao()).toBe(0);
  });

  it('kịch bản xấu — xe chưa có toạ độ: vẫn cảnh báo, bỏ phần gợi ý trạm', async () => {
    const ev = taoBo();
    await ev.danhGia(vehicleId, 25, null, gio(0));

    const res = await db.query<{ payload: { tram_goi_y: unknown } }>(
      `SELECT payload FROM alerts WHERE vehicle_id = $1`,
      [vehicleId],
    );
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]!.payload.tram_goi_y).toBeNull();
  });

  it('kịch bản xấu — khung thông báo hỏng: cảnh báo VẪN vào DB (an toàn không phụ thuộc kênh)', async () => {
    notifier.loi = true;
    const ev = taoBo();

    await expect(ev.danhGia(vehicleId, 9, viTri, gio(0))).resolves.toBeGreaterThan(0);
    expect(await demCanhBao()).toBe(3);
  });
});
