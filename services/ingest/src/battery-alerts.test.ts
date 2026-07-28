// F-A2 — Cảnh báo pin phân cấp: đúng ngưỡng + chống spam (quy tắc 7 — luồng trọng yếu).
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { testDatabaseUrl } from '@g3/db';
import {
  BatteryAlertEvaluator,
  BIEN_TRE_PCT,
  NGUONG_PIN,
  quyetDinhCanhBao,
} from './battery-alerts';

describe('quyetDinhCanhBao — hàm thuần, không cần DB', () => {
  const khong = new Set<number>();

  it('đúng 3 mức của F-A2: 30 sớm / 20 chính / 10 nguy cấp', () => {
    expect(NGUONG_PIN.map((n) => n.pct)).toEqual([30, 20, 10]);
    expect(NGUONG_PIN.map((n) => n.severity)).toEqual([1, 2, 3]);
    expect(NGUONG_PIN.find((n) => n.pct === 10)?.type).toBe('battery_critical');
  });

  it('SOC 31% chưa chạm ngưỡng nào', () => {
    expect(quyetDinhCanhBao(31, khong).can_ban).toEqual([]);
  });

  it('SOC đúng bằng 30% đã tính là chạm ngưỡng (<=, không phải <)', () => {
    expect(quyetDinhCanhBao(30, khong).can_ban.map((n) => n.pct)).toEqual([30]);
  });

  it('tụt thẳng xuống 8%: bắn cả 3 ngưỡng, không bỏ sót mức nào', () => {
    expect(quyetDinhCanhBao(8, khong).can_ban.map((n) => n.pct)).toEqual([30, 20, 10]);
  });

  it('ngưỡng đang mở thì KHÔNG bắn lại (chống spam)', () => {
    expect(quyetDinhCanhBao(19, new Set([30, 20])).can_ban).toEqual([]);
  });

  it('SOC rung quanh ngưỡng vẫn im lặng nhờ biên trễ', () => {
    // Xe đang ở ~20%: cả ngưỡng 30 lẫn 20 đều đã bắn và đang mở.
    const dangMo = new Set([30, 20]);
    // 20.1 → 21 → 24.9 → 19.9: vẫn trong vùng đệm (20, 25), không bắn cũng không gỡ
    for (const soc of [20.1, 21, 24.9, 19.9]) {
      const kq = quyetDinhCanhBao(soc, dangMo);
      expect(kq.can_ban, `SOC ${soc}`).toEqual([]);
      expect(kq.can_go, `SOC ${soc}`).toEqual([]);
    }
  });

  it('SOC hồi lên trên ngưỡng + biên trễ thì gỡ cảnh báo, ngưỡng nạp đạn lại', () => {
    const dangMo = new Set([30, 20]);
    // 25% = 20 + biên trễ: gỡ ngưỡng 20, ngưỡng 30 vẫn mở vì 25 < 30
    const kq = quyetDinhCanhBao(20 + BIEN_TRE_PCT, dangMo);
    expect(kq.can_go.map((n) => n.pct)).toEqual([20]);
    expect(kq.can_ban).toEqual([]);
  });
});

describe('BatteryAlertEvaluator — trạng thái nằm trong DB, chịu được restart', () => {
  let db: pg.Client;
  let vehicleId: string;
  let stationId: string;

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
  });

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

  it('xe tụt pin dần: mỗi ngưỡng chỉ bắn ĐÚNG 1 lần dù có 60 bản ghi', async () => {
    const ev = new BatteryAlertEvaluator(db);
    // SOC đi từ 40% xuống 8%, mỗi bước 0.5% — cắt qua cả 3 ngưỡng
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

  it('cảnh báo kèm gợi ý trạm gần nhất còn trống (F-A2)', async () => {
    const ev = new BatteryAlertEvaluator(db);
    await ev.danhGia(vehicleId, 29, viTri, gio(0));

    const res = await db.query<{ payload: { tram_goi_y: { code: string; tru_trong: number } } }>(
      `SELECT payload FROM alerts WHERE vehicle_id = $1`,
      [vehicleId],
    );
    expect(res.rows[0]!.payload.tram_goi_y.code).toBe('G3-FA2-ST-01');
    expect(res.rows[0]!.payload.tram_goi_y.tru_trong).toBeGreaterThan(0);
  });

  it('kịch bản xấu — trạm đều bận: vẫn bắn cảnh báo, chỉ là không có gợi ý trạm', async () => {
    await db.query(`UPDATE connectors SET status = 'Charging' WHERE station_id = $1`, [stationId]);
    const ev = new BatteryAlertEvaluator(db);
    await ev.danhGia(vehicleId, 9, viTri, gio(0));
    await db.query(`UPDATE connectors SET status = 'Available' WHERE station_id = $1`, [stationId]);

    const res = await db.query<{ payload: { tram_goi_y: unknown } }>(
      `SELECT payload FROM alerts WHERE vehicle_id = $1 AND severity = 3`,
      [vehicleId],
    );
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]!.payload.tram_goi_y).toBeNull();
  });

  it('sạc xong rồi lại tụt pin: ngưỡng bắn lại (2 cảnh báo, cái đầu đã resolved)', async () => {
    const ev = new BatteryAlertEvaluator(db);
    await ev.danhGia(vehicleId, 19, viTri, gio(0)); // bắn 30 + 20
    await ev.danhGia(vehicleId, 90, viTri, gio(60)); // sạc đầy → gỡ cả hai
    await ev.danhGia(vehicleId, 19, viTri, gio(120)); // chuyến sau lại tụt → bắn lại

    const res = await db.query<{ status: string; severity: number }>(
      `SELECT status, severity FROM alerts WHERE vehicle_id = $1 ORDER BY triggered_at, severity`,
      [vehicleId],
    );
    expect(res.rows).toHaveLength(4);
    expect(res.rows.filter((r) => r.status === 'resolved')).toHaveLength(2);
    expect(res.rows.filter((r) => r.status === 'open')).toHaveLength(2);
  });

  it('kịch bản xấu — ingest khởi động lại: nạp trạng thái từ DB, KHÔNG bắn trùng', async () => {
    const truoc = new BatteryAlertEvaluator(db);
    await truoc.danhGia(vehicleId, 19, viTri, gio(0));
    expect(await demCanhBao()).toBe(2);

    // Tiến trình mới, RAM trắng — trạng thái phải đọc lại từ bảng alerts
    const sau = new BatteryAlertEvaluator(db);
    await sau.danhGia(vehicleId, 18, viTri, gio(5));
    await sau.danhGia(vehicleId, 17, viTri, gio(10));

    expect(await demCanhBao()).toBe(2);
  });

  it('kịch bản xấu — bản ghi thiếu SOC (null) không sinh cảnh báo, không nổ', async () => {
    const ev = new BatteryAlertEvaluator(db);
    await expect(ev.danhGia(vehicleId, null, viTri, gio(0))).resolves.toBe(0);
    expect(await demCanhBao()).toBe(0);
  });

  it('kịch bản xấu — xe chưa có toạ độ: vẫn cảnh báo, bỏ phần gợi ý trạm', async () => {
    const ev = new BatteryAlertEvaluator(db);
    await ev.danhGia(vehicleId, 25, null, gio(0));

    const res = await db.query<{ payload: { tram_goi_y: unknown } }>(
      `SELECT payload FROM alerts WHERE vehicle_id = $1`,
      [vehicleId],
    );
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]!.payload.tram_goi_y).toBeNull();
  });
});
