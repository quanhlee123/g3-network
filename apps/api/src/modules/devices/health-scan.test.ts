// F-J1 + F-J3 — Quét thiết bị im lặng và PHÂN BIỆT tháo thiết bị với mất sóng.
// Hai ca bắt buộc của Prompt 7.4: kịch bản sim (e) power-loss → tamper;
// kịch bản (c) offline → KHÔNG phải tamper.
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MockNotifier } from '@g3/contracts';
import { testDatabaseUrl } from '@g3/db';
import {
  NGUONG_SUC_KHOE_MAC_DINH,
  phanLoaiImLang,
  quetSucKhoeThietBi,
  type BangChungCuoi,
} from './health-scan';

const NG = NGUONG_SUC_KHOE_MAC_DINH;

const bangChung = (o: Partial<BangChungCuoi> = {}): BangChungCuoi => ({
  power_status: 'normal',
  supply_voltage_v: 13.8,
  signal_dbm: -70,
  khoang_cach_cuoi_giay: 10,
  ...o,
});

describe('phanLoaiImLang — hàm thuần, trái tim của F-J3', () => {
  it('LWT của broker → nghi tháo thiết bị (bằng chứng mạnh nhất, ADR-003)', () => {
    const kq = phanLoaiImLang(bangChung({ power_status: 'lost' }), NG);
    expect(kq.la_tamper).toBe(true);
    expect(kq.loai).toBe('nghi_thao_thiet_bi');
    expect(kq.ly_do).toContain('LWT');
  });

  it('KỊCH BẢN (e) — nguồn bình thường + sóng khoẻ rồi im bặt → NGHI THÁO THIẾT BỊ', () => {
    const kq = phanLoaiImLang(bangChung({ supply_voltage_v: 13.8, signal_dbm: -68 }), NG);
    expect(kq.la_tamper).toBe(true);
    expect(kq.loai).toBe('nghi_thao_thiet_bi');
  });

  it('KỊCH BẢN (c) — sóng yếu dần rồi mất → MẤT SÓNG, KHÔNG phải tamper', () => {
    const kq = phanLoaiImLang(bangChung({ signal_dbm: -110 }), NG);
    expect(kq.la_tamper).toBe(false);
    expect(kq.loai).toBe('mat_song');
  });

  it('điện áp nguồn đã tụt sâu → hết nguồn tự nhiên, KHÔNG phải tamper', () => {
    const kq = phanLoaiImLang(bangChung({ supply_voltage_v: 9.4 }), NG);
    expect(kq.la_tamper).toBe(false);
    expect(kq.loai).toBe('het_nguon');
  });

  it('nguồn yếu ĐƯỢC XÉT TRƯỚC sóng yếu: cả hai cùng yếu thì kết luận hết nguồn', () => {
    const kq = phanLoaiImLang(bangChung({ supply_voltage_v: 9, signal_dbm: -120 }), NG);
    expect(kq.loai).toBe('het_nguon');
  });

  it('kịch bản xấu — thiết bị firmware cũ (schema v1, không có 2 trường): KHÔNG đoán tamper', () => {
    const kq = phanLoaiImLang(bangChung({ supply_voltage_v: null, signal_dbm: null }), NG);
    expect(kq.la_tamper).toBe(false);
    expect(kq.loai).toBe('khong_ro');
    expect(kq.ly_do).toContain('schema v1');
  });

  it('kịch bản xấu — chỉ có sóng, không biết điện áp nguồn: không đủ căn cứ gọi tamper', () => {
    const kq = phanLoaiImLang(bangChung({ supply_voltage_v: null, signal_dbm: -70 }), NG);
    expect(kq.la_tamper).toBe(false);
    expect(kq.loai).toBe('khong_ro');
  });
});

describe('quetSucKhoeThietBi (DB)', () => {
  let db: pg.Client;
  let customerId: string;
  let notifier: MockNotifier;

  const NGUONG_TEST = { imLangGio: 1, dienApNguonThapV: 11, songYeuDbm: -95 };

  beforeAll(async () => {
    db = new pg.Client({ connectionString: testDatabaseUrl() });
    await db.connect();
    const c = await db.query<{ id: string }>(
      `INSERT INTO customers (name, contract_no) VALUES ('KH F-J3 (GIẢ)', 'HD-FJ3-001')
       ON CONFLICT (contract_no) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    );
    customerId = c.rows[0]!.id;
  });

  afterAll(async () => {
    await db.end();
  });

  beforeEach(async () => {
    await db.query(`DELETE FROM alerts WHERE type IN ('device_offline', 'device_tamper')`);
    await db.query(`DELETE FROM telematics_readings WHERE vehicle_id IN
                    (SELECT id FROM vehicles WHERE vin LIKE 'G3-FJ3-%')`);
    await db.query(`DELETE FROM devices WHERE device_serial LIKE 'G3-FJ3-%'`);
    await db.query(`DELETE FROM vehicles WHERE vin LIKE 'G3-FJ3-%'`);
    notifier = new MockNotifier();
  });

  /** Dựng 1 xe + thiết bị im lặng từ `imLangGio` giờ trước, kèm 2 bản ghi telemetry cuối. */
  const dungXeImLang = async (opts: {
    vin: string;
    imLangGio: number;
    powerStatus?: 'normal' | 'lost';
    supplyV?: number | null;
    signalDbm?: number | null;
    schemaVersion?: number;
  }): Promise<{ vehicleId: string; deviceId: string }> => {
    const v = await db.query<{ id: string }>(
      `INSERT INTO vehicles (vin, model, customer_id) VALUES ($1, 'EVT-262', $2) RETURNING id`,
      [opts.vin, customerId],
    );
    const vehicleId = v.rows[0]!.id;
    const d = await db.query<{ id: string }>(
      `INSERT INTO devices (device_serial, vehicle_id, firmware_version, last_seen_at, power_status)
       VALUES ($1, $2, '1.2.0-sim', now() - ($3::numeric * interval '1 hour'), $4::device_power_status)
       RETURNING id`,
      [`G3-FJ3-DEV-${opts.vin.slice(-4)}`, vehicleId, opts.imLangGio, opts.powerStatus ?? 'normal'],
    );
    // Hai bản ghi cuối, cách nhau 10 giây, ngay trước mốc im lặng
    for (const lui of [20, 10]) {
      await db.query(
        `INSERT INTO telematics_readings
           (time, vehicle_id, device_id, schema_version, soc_pct, battery_voltage_v,
            speed_kmh, odometer_km, supply_voltage_v, signal_dbm)
         VALUES (now() - ($1::numeric * interval '1 hour') - ($2::int * interval '1 second'),
                 $3, $4, $5, 65, 380, 40, 1000, $6, $7)`,
        [
          opts.imLangGio,
          lui,
          vehicleId,
          d.rows[0]!.id,
          opts.schemaVersion ?? 2,
          opts.supplyV === undefined ? 13.8 : opts.supplyV,
          opts.signalDbm === undefined ? -70 : opts.signalDbm,
        ],
      );
    }
    return { vehicleId, deviceId: d.rows[0]!.id };
  };

  const layAlert = async (deviceId: string) => {
    const res = await db.query<{ type: string; severity: number; payload: { loai: string } }>(
      `SELECT type::text, severity, payload FROM alerts WHERE device_id = $1`,
      [deviceId],
    );
    return res.rows[0];
  };

  it('CA BẮT BUỘC (e) — mất nguồn đột ngột: alert device_tamper, mức nguy cấp', async () => {
    const { deviceId } = await dungXeImLang({
      vin: 'G3-FJ3-VIN-0001',
      imLangGio: 3,
      supplyV: 13.8,
      signalDbm: -68,
    });

    const tomTat = await quetSucKhoeThietBi(db, { nguong: NGUONG_TEST, notifier });

    expect(tomTat.tamper).toBe(1);
    const alert = await layAlert(deviceId);
    expect(alert?.type).toBe('device_tamper');
    expect(alert?.severity).toBe(3);
    expect(alert?.payload.loai).toBe('nghi_thao_thiet_bi');
    expect(notifier.theoLoai('device_tamper')).toHaveLength(1);
  });

  it('CA BẮT BUỘC (c) — mất sóng: alert device_offline, KHÔNG phải tamper', async () => {
    const { deviceId } = await dungXeImLang({
      vin: 'G3-FJ3-VIN-0002',
      imLangGio: 3,
      supplyV: 13.6,
      signalDbm: -108,
    });

    const tomTat = await quetSucKhoeThietBi(db, { nguong: NGUONG_TEST, notifier });

    expect(tomTat.tamper).toBe(0);
    expect(tomTat.offline).toBe(1);
    const alert = await layAlert(deviceId);
    expect(alert?.type).toBe('device_offline');
    expect(alert?.payload.loai).toBe('mat_song');
    expect(notifier.theoLoai('device_tamper')).toHaveLength(0);
  });

  it('LWT đã ghi power_status=lost → tamper kể cả khi bản tin cuối trông bình thường', async () => {
    const { deviceId } = await dungXeImLang({
      vin: 'G3-FJ3-VIN-0003',
      imLangGio: 2,
      powerStatus: 'lost',
      signalDbm: -110, // sóng yếu, nhưng LWT mạnh hơn
    });

    await quetSucKhoeThietBi(db, { nguong: NGUONG_TEST, notifier });

    expect((await layAlert(deviceId))?.type).toBe('device_tamper');
  });

  it('thiết bị còn liên lạc trong ngưỡng: KHÔNG cảnh báo gì', async () => {
    const { deviceId } = await dungXeImLang({ vin: 'G3-FJ3-VIN-0004', imLangGio: 0.1 });

    const tomTat = await quetSucKhoeThietBi(db, { nguong: NGUONG_TEST, notifier });

    expect(tomTat.da_xet).toBe(0);
    expect(await layAlert(deviceId)).toBeUndefined();
  });

  it('chạy job hai lần trong cùng đợt im lặng: vẫn ĐÚNG 1 cảnh báo', async () => {
    const { deviceId } = await dungXeImLang({ vin: 'G3-FJ3-VIN-0005', imLangGio: 3 });

    await quetSucKhoeThietBi(db, { nguong: NGUONG_TEST, notifier });
    await quetSucKhoeThietBi(db, { nguong: NGUONG_TEST, notifier });

    const res = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM alerts WHERE device_id = $1`,
      [deviceId],
    );
    expect(res.rows[0]!.n).toBe(1);
  });

  it('thiết bị liên lạc lại rồi im lần nữa = ĐỢT MỚI, được cảnh báo lại', async () => {
    const { deviceId } = await dungXeImLang({ vin: 'G3-FJ3-VIN-0006', imLangGio: 3 });
    await quetSucKhoeThietBi(db, { nguong: NGUONG_TEST, notifier });

    // Thiết bị "liên lạc lại" rồi lại im — mốc last_seen_at đổi nên dedup_key cũng đổi
    await db.query(`UPDATE devices SET last_seen_at = now() - interval '2 hours' WHERE id = $1`, [
      deviceId,
    ]);
    await quetSucKhoeThietBi(db, { nguong: NGUONG_TEST, notifier });

    const res = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM alerts WHERE device_id = $1`,
      [deviceId],
    );
    expect(res.rows[0]!.n).toBe(2);
  });

  it('kịch bản xấu — thiết bị chưa từng gửi bản ghi nào: không nổ, không đoán tamper', async () => {
    const v = await db.query<{ id: string }>(
      `INSERT INTO vehicles (vin, model, customer_id) VALUES ('G3-FJ3-VIN-0007', 'EVT-262', $1)
       RETURNING id`,
      [customerId],
    );
    const d = await db.query<{ id: string }>(
      `INSERT INTO devices (device_serial, vehicle_id, last_seen_at)
       VALUES ('G3-FJ3-DEV-0007', $1, now() - interval '5 hours') RETURNING id`,
      [v.rows[0]!.id],
    );

    await expect(quetSucKhoeThietBi(db, { nguong: NGUONG_TEST, notifier })).resolves.toBeDefined();
    expect((await layAlert(d.rows[0]!.id))?.type).toBe('device_offline');
  });

  it('kịch bản xấu — thiết bị ĐÃ THU HỒI (revoked): bỏ qua, không cảnh báo', async () => {
    const { deviceId } = await dungXeImLang({ vin: 'G3-FJ3-VIN-0008', imLangGio: 5 });
    await db.query(`UPDATE devices SET revoked_at = now() WHERE id = $1`, [deviceId]);

    const tomTat = await quetSucKhoeThietBi(db, { nguong: NGUONG_TEST, notifier });

    expect(tomTat.da_xet).toBe(0);
  });

  it('kịch bản xấu — khung thông báo hỏng: cảnh báo VẪN vào DB', async () => {
    notifier.loi = true;
    const { deviceId } = await dungXeImLang({ vin: 'G3-FJ3-VIN-0009', imLangGio: 4 });

    await quetSucKhoeThietBi(db, { nguong: NGUONG_TEST, notifier });

    expect(await layAlert(deviceId)).toBeDefined();
  });
});
