// F-A4 — Phát hiện bất thường pin (AN TOÀN CHÁY NỔ — Must).
// Luồng trọng yếu theo quy tắc 7: có test cho kịch bản chính + kịch bản xấu trước khi merge.
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MockNotifier } from '@g3/contracts';
import { testDatabaseUrl } from '@g3/db';
import {
  AnomalyEvaluator,
  chupSnapshot,
  danhGiaBatThuong,
  docLuatBatThuong,
  type BanGhiPin,
  type LoaiBatThuong,
  type LuatBatThuong,
} from './anomaly';

const LUAT_NHIET: LuatBatThuong = {
  loai: 'nhiet_do_cao',
  nguong_so: 55,
  bien_tre_so: 5,
  cua_so_giay: null,
  ma_loi: null,
  severity: 3,
};
const LUAT_SUT_AP: LuatBatThuong = {
  loai: 'sut_ap_dot_ngot',
  nguong_so: 30,
  bien_tre_so: 10,
  cua_so_giay: 60,
  ma_loi: null,
  severity: 3,
};
const LUAT_MA_LOI: LuatBatThuong = {
  loai: 'ma_loi_bms',
  nguong_so: null,
  bien_tre_so: 0,
  cua_so_giay: null,
  ma_loi: ['P0A80', 'P0AFA'],
  severity: 3,
};

const banGhi = (o: Partial<BanGhiPin> = {}): BanGhiPin => ({
  battery_temp_c: 32,
  battery_voltage_v: 380,
  fault_codes: [],
  ...o,
});

describe('danhGiaBatThuong — hàm thuần, không cần DB', () => {
  const khong = new Set<LoaiBatThuong>();
  const T0 = Date.parse('2026-07-01T08:00:00.000Z');

  it('nhiệt độ 60°C vượt ngưỡng 55°C → phát hiện, mức nguy cấp', () => {
    const kq = danhGiaBatThuong(banGhi({ battery_temp_c: 60 }), null, T0, [LUAT_NHIET], khong);
    expect(kq.can_ban).toHaveLength(1);
    expect(kq.can_ban[0]!.severity).toBe(3);
    expect(kq.can_ban[0]!.ly_do).toContain('60°C');
    expect(kq.can_ban[0]!.chi_tiet.nguong_c).toBe(55);
  });

  it('nhiệt độ đúng bằng ngưỡng đã tính là vượt (>=, không phải >)', () => {
    const kq = danhGiaBatThuong(banGhi({ battery_temp_c: 55 }), null, T0, [LUAT_NHIET], khong);
    expect(kq.can_ban).toHaveLength(1);
  });

  it('đang có cảnh báo mở thì KHÔNG bắn lại — bắt buộc vì severity 3 bỏ qua rate-limit', () => {
    const dangMo = new Set<LoaiBatThuong>(['nhiet_do_cao']);
    const kq = danhGiaBatThuong(banGhi({ battery_temp_c: 61 }), null, T0, [LUAT_NHIET], dangMo);
    expect(kq.can_ban).toEqual([]);
    expect(kq.can_go).toEqual([]);
  });

  it('nhiệt độ tụt xuống nhưng chưa qua biên trễ: KHÔNG đóng cảnh báo (chống rung)', () => {
    const dangMo = new Set<LoaiBatThuong>(['nhiet_do_cao']);
    // 52°C < 55 nhưng > 55 - 5 = 50 → vùng đệm
    expect(
      danhGiaBatThuong(banGhi({ battery_temp_c: 52 }), null, T0, [LUAT_NHIET], dangMo).can_go,
    ).toEqual([]);
    // 50°C = 55 - 5 → hết hẳn, đóng được
    expect(
      danhGiaBatThuong(banGhi({ battery_temp_c: 50 }), null, T0, [LUAT_NHIET], dangMo).can_go,
    ).toEqual(['nhiet_do_cao']);
  });

  it('kịch bản xấu — mất cảm biến nhiệt (null): không bắn và cũng KHÔNG đóng cảnh báo đang mở', () => {
    const dangMo = new Set<LoaiBatThuong>(['nhiet_do_cao']);
    const kq = danhGiaBatThuong(banGhi({ battery_temp_c: null }), null, T0, [LUAT_NHIET], dangMo);
    expect(kq.can_ban).toEqual([]);
    expect(kq.can_go).toEqual([]); // mất cảm biến lúc pin đang nóng KHÔNG phải là "đã hết nguy hiểm"
  });

  it('sụt áp 40V trong 30s → phát hiện', () => {
    const truoc = { battery_voltage_v: 380, tsMs: T0 - 30_000 };
    const kq = danhGiaBatThuong(
      banGhi({ battery_voltage_v: 340 }),
      truoc,
      T0,
      [LUAT_SUT_AP],
      khong,
    );
    expect(kq.can_ban).toHaveLength(1);
    expect(kq.can_ban[0]!.chi_tiet.sut_v).toBe(40);
  });

  it('cùng mức sụt nhưng cách nhau 10 phút thì KHÔNG phải "đột ngột"', () => {
    const truoc = { battery_voltage_v: 380, tsMs: T0 - 600_000 };
    const kq = danhGiaBatThuong(
      banGhi({ battery_voltage_v: 340 }),
      truoc,
      T0,
      [LUAT_SUT_AP],
      khong,
    );
    expect(kq.can_ban).toEqual([]);
  });

  it('kịch bản xấu — bản ghi bù về đến ngược thứ tự thời gian: bỏ qua, không báo nhầm', () => {
    const truoc = { battery_voltage_v: 380, tsMs: T0 + 30_000 }; // "trước" lại mới hơn
    const kq = danhGiaBatThuong(
      banGhi({ battery_voltage_v: 340 }),
      truoc,
      T0,
      [LUAT_SUT_AP],
      khong,
    );
    expect(kq.can_ban).toEqual([]);
  });

  it('mã lỗi BMS nghiêm trọng → phát hiện; mã lạ không nằm trong danh sách thì bỏ qua', () => {
    const co = danhGiaBatThuong(banGhi({ fault_codes: ['P0A80'] }), null, T0, [LUAT_MA_LOI], khong);
    expect(co.can_ban).toHaveLength(1);
    expect(co.can_ban[0]!.chi_tiet.ma_loi).toEqual(['P0A80']);

    const khongCo = danhGiaBatThuong(
      banGhi({ fault_codes: ['B1234'] }),
      null,
      T0,
      [LUAT_MA_LOI],
      khong,
    );
    expect(khongCo.can_ban).toEqual([]);
  });

  it('ba luật chạy độc lập: nóng + mã lỗi cùng lúc ra 2 phát hiện', () => {
    const kq = danhGiaBatThuong(
      banGhi({ battery_temp_c: 60, fault_codes: ['P0A80'] }),
      null,
      T0,
      [LUAT_NHIET, LUAT_MA_LOI],
      khong,
    );
    expect(kq.can_ban.map((p) => p.loai).sort()).toEqual(['ma_loi_bms', 'nhiet_do_cao']);
  });
});

describe('AnomalyEvaluator + luật trong DB (F-A4)', () => {
  let db: pg.Client;
  let customerId: string;
  let vehicleId: string;
  let notifier: MockNotifier;

  const T0 = '2026-07-01T08:00:00.000Z';
  const gio = (giay: number) => new Date(Date.parse(T0) + giay * 1000).toISOString();

  beforeAll(async () => {
    db = new pg.Client({ connectionString: testDatabaseUrl() });
    await db.connect();
    const customer = await db.query<{ id: string }>(
      `INSERT INTO customers (name, contract_no) VALUES ('KH F-A4 (GIẢ)', 'HD-FA4-001')
       ON CONFLICT (contract_no) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    );
    customerId = customer.rows[0]!.id;
    const vehicle = await db.query<{ id: string }>(
      `INSERT INTO vehicles (vin, model, customer_id) VALUES ('G3-FA4-VIN-0001', 'EVT-262', $1)
       ON CONFLICT (vin) DO UPDATE SET model = EXCLUDED.model RETURNING id`,
      [customerId],
    );
    vehicleId = vehicle.rows[0]!.id;
  });

  afterAll(async () => {
    await db.end();
  });

  beforeEach(async () => {
    await db.query(`DELETE FROM alerts WHERE vehicle_id = $1`, [vehicleId]);
    await db.query(`DELETE FROM telematics_readings WHERE vehicle_id = $1`, [vehicleId]);
    await db.query(
      `DELETE FROM anomaly_rules WHERE customer_id IS NOT NULL OR vehicle_id IS NOT NULL`,
    );
    notifier = new MockNotifier();
  });

  /** Bơm chuỗi bản ghi telemetry để snapshot có dữ liệu thật để chụp. */
  const bomTelemetry = async (
    tuGiay: number,
    denGiay: number,
    buoc: number,
    nhietDau: number,
    nhietCuoi: number,
  ): Promise<void> => {
    const soBuoc = Math.floor((denGiay - tuGiay) / buoc);
    for (let i = 0; i <= soBuoc; i += 1) {
      const t = tuGiay + i * buoc;
      const nhiet = nhietDau + ((nhietCuoi - nhietDau) * i) / Math.max(1, soBuoc);
      await db.query(
        `INSERT INTO telematics_readings
           (time, vehicle_id, schema_version, soc_pct, battery_voltage_v, battery_temp_c, speed_kmh, fault_codes)
         VALUES ($1, $2, 1, 70, 380, $3, 45, $4)
         ON CONFLICT DO NOTHING`,
        [gio(t), vehicleId, nhiet.toFixed(1), JSON.stringify(nhiet >= 55 ? ['P0A80'] : [])],
      );
    }
  };

  it('docLuatBatThuong: mặc định toàn hệ có đủ 3 luật', async () => {
    const luats = await docLuatBatThuong(db, vehicleId);
    expect(luats.map((l) => l.loai).sort()).toEqual([
      'ma_loi_bms',
      'nhiet_do_cao',
      'sut_ap_dot_ngot',
    ]);
    expect(luats.find((l) => l.loai === 'nhiet_do_cao')?.nguong_so).toBe(55);
    expect(luats.every((l) => l.severity === 3)).toBe(true);
  });

  it('luật riêng của XE đè lên mặc định', async () => {
    await db.query(
      `INSERT INTO anomaly_rules (kind, vehicle_id, nguong_so) VALUES ('nhiet_do_cao', $1, 45)`,
      [vehicleId],
    );
    const luats = await docLuatBatThuong(db, vehicleId);
    expect(luats.find((l) => l.loai === 'nhiet_do_cao')?.nguong_so).toBe(45);
  });

  it('luật bị tắt (enabled = false) thì không áp dụng nữa', async () => {
    await db.query(
      `INSERT INTO anomaly_rules (kind, vehicle_id, nguong_so, enabled)
       VALUES ('nhiet_do_cao', $1, 45, false)`,
      [vehicleId],
    );
    const luats = await docLuatBatThuong(db, vehicleId);
    // Dòng riêng bị tắt → rơi về dòng mặc định toàn hệ, KHÔNG phải mất luật
    expect(luats.find((l) => l.loai === 'nhiet_do_cao')?.nguong_so).toBe(55);
  });

  it('KỊCH BẢN (d) — nhiệt độ leo tới 60°C: alert CRITICAL + snapshot 5 phút đầy đủ', async () => {
    // 5 phút dữ liệu trước sự kiện, nhiệt leo 32 → 60°C, mỗi 10 giây
    await bomTelemetry(0, 300, 10, 32, 60);
    const ev = new AnomalyEvaluator(db, () => {}, notifier);

    const daBan = await ev.danhGia(
      vehicleId,
      { battery_temp_c: 60, battery_voltage_v: 380, fault_codes: ['P0A80'] },
      gio(300),
    );

    expect(daBan).toBeGreaterThanOrEqual(1);
    const res = await db.query<{
      severity: number;
      type: string;
      payload: {
        loai: string;
        snapshot_5_phut: { time: string; battery_temp_c: number }[];
        snapshot_so_dong: number;
      };
    }>(
      `SELECT severity, type, payload FROM alerts
       WHERE vehicle_id = $1 AND payload->>'loai' = 'nhiet_do_cao'`,
      [vehicleId],
    );

    expect(res.rows).toHaveLength(1);
    const alert = res.rows[0]!;
    expect(alert.type).toBe('battery_anomaly');
    expect(alert.severity).toBe(3); // CRITICAL
    // Snapshot phải có dữ liệu thật, đủ 5 phút, và cho thấy nhiệt độ LEO DẦN
    expect(alert.payload.snapshot_so_dong).toBeGreaterThan(25);
    const snap = alert.payload.snapshot_5_phut;
    expect(snap[0]!.battery_temp_c).toBeLessThan(40);
    expect(snap.at(-1)!.battery_temp_c).toBeGreaterThan(55);
    // Cửa sổ đúng 5 phút, không lấy lố
    const rong = Date.parse(snap.at(-1)!.time) - Date.parse(snap[0]!.time);
    expect(rong).toBeLessThanOrEqual(5 * 60 * 1000);
    // Người phải được báo, mức nguy cấp
    expect(notifier.theoLoai('battery_anomaly').some((e) => e.severity === 3)).toBe(true);
  });

  // Chống trùng có HAI lớp: tập `dangMo` trong RAM và `WHERE NOT EXISTS` ở câu INSERT.
  // Kiểm chứng bằng cách gỡ lớp RAM cho thấy ca này VẪN xanh nhờ lớp DB — đúng ý đồ phòng
  // thủ hai lớp (2 tiến trình ingest cùng chạy thì chỉ lớp DB mới cứu được).
  // Lớp RAM được ghim riêng bằng ca hàm thuần "đang có cảnh báo mở thì KHÔNG bắn lại".
  it('nhiệt độ giữ ở 60°C suốt 30 bản ghi → vẫn ĐÚNG 1 cảnh báo (chống spam severity 3)', async () => {
    const ev = new AnomalyEvaluator(db, () => {}, notifier);
    for (let i = 0; i < 30; i += 1) {
      await ev.danhGia(
        vehicleId,
        { battery_temp_c: 60, battery_voltage_v: 380, fault_codes: [] },
        gio(i * 10),
      );
    }

    const res = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM alerts
       WHERE vehicle_id = $1 AND payload->>'loai' = 'nhiet_do_cao'`,
      [vehicleId],
    );
    expect(res.rows[0]!.n).toBe(1);
    expect(notifier.events.filter((e) => e.data?.loai === 'nhiet_do_cao')).toHaveLength(1);
  });

  it('pin nguội hẳn rồi nóng lại: cảnh báo cũ đóng, đợt sau bắn lại', async () => {
    const ev = new AnomalyEvaluator(db, () => {}, notifier);
    await ev.danhGia(
      vehicleId,
      { battery_temp_c: 60, battery_voltage_v: 380, fault_codes: [] },
      gio(0),
    );
    await ev.danhGia(
      vehicleId,
      { battery_temp_c: 35, battery_voltage_v: 380, fault_codes: [] },
      gio(60),
    );
    await ev.danhGia(
      vehicleId,
      { battery_temp_c: 60, battery_voltage_v: 380, fault_codes: [] },
      gio(120),
    );

    const res = await db.query<{ status: string }>(
      `SELECT status FROM alerts WHERE vehicle_id = $1 AND payload->>'loai' = 'nhiet_do_cao'
       ORDER BY triggered_at`,
      [vehicleId],
    );
    expect(res.rows.map((r) => r.status)).toEqual(['resolved', 'open']);
  });

  it('kịch bản xấu — ingest khởi động lại giữa lúc pin đang nóng: KHÔNG bắn trùng', async () => {
    const truoc = new AnomalyEvaluator(db, () => {}, notifier);
    await truoc.danhGia(
      vehicleId,
      { battery_temp_c: 60, battery_voltage_v: 380, fault_codes: [] },
      gio(0),
    );

    const sau = new AnomalyEvaluator(db, () => {}, notifier);
    await sau.danhGia(
      vehicleId,
      { battery_temp_c: 61, battery_voltage_v: 380, fault_codes: [] },
      gio(10),
    );

    const res = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM alerts WHERE vehicle_id = $1`,
      [vehicleId],
    );
    expect(res.rows[0]!.n).toBe(1);
  });

  it('kịch bản xấu — chưa có bản ghi nào trong 5 phút: vẫn cảnh báo, snapshot rỗng', async () => {
    const ev = new AnomalyEvaluator(db, () => {}, notifier);
    await ev.danhGia(
      vehicleId,
      { battery_temp_c: 60, battery_voltage_v: 380, fault_codes: [] },
      gio(0),
    );

    const res = await db.query<{ payload: { snapshot_so_dong: number } }>(
      `SELECT payload FROM alerts WHERE vehicle_id = $1`,
      [vehicleId],
    );
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]!.payload.snapshot_so_dong).toBe(0);
  });

  it('chupSnapshot chỉ lấy dữ liệu CỦA XE ĐÓ và trong đúng cửa sổ', async () => {
    await bomTelemetry(0, 600, 60, 30, 40); // 10 phút dữ liệu
    const snap = await chupSnapshot(db, vehicleId, gio(600), 5);

    expect(snap.length).toBeGreaterThan(0);
    for (const dong of snap) {
      const t = Date.parse(dong.time);
      expect(t).toBeGreaterThan(Date.parse(gio(600)) - 5 * 60 * 1000);
      expect(t).toBeLessThanOrEqual(Date.parse(gio(600)));
    }
  });
});
