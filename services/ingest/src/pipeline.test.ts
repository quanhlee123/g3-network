// F-G1 — Test pipeline ingest vào DB g3_test: luồng chính + các kịch bản xấu bắt buộc
// (CLAUDE.md Definition of Done: mất sóng/bản ghi trễ, dữ liệu trùng/gửi bù).
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MockTelematicsSource, statusTopic, telemetryTopic } from '@g3/contracts';
import { testDatabaseUrl } from '@g3/db';
import { IngestMetrics } from './metrics';
import { IngestPipeline } from './pipeline';

const VIN = 'G3-INGEST-VIN-0001';
const DEVICE_TS = '2026-07-28T03:00:00.000Z';
// Giờ "hiện tại" cố định = ts thiết bị + 5s → lag kỳ vọng 5s
const NOW_MS = Date.parse(DEVICE_TS) + 5_000;

function validPayload(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schema_version: 1,
    vin: VIN,
    model: 'EVT-262',
    ts: DEVICE_TS,
    soc_pct: 55.5,
    battery_voltage_v: 640.2,
    battery_temp_c: 31.5,
    speed_kmh: 42,
    odometer_km: 1234.5,
    lat: 10.85,
    lng: 106.75,
    fault_codes: ['P0A80'],
    ...overrides,
  });
}

describe('IngestPipeline (DB g3_test)', () => {
  let db: pg.Client;
  let deviceId: string;

  beforeAll(async () => {
    db = new pg.Client({ connectionString: testDatabaseUrl() });
    await db.connect();
    const customer = await db.query<{ id: string }>(
      `INSERT INTO customers (name, contract_no) VALUES ('KH Ingest Test (GIẢ)', 'HD-INGEST-001')
       ON CONFLICT (contract_no) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    );
    const vehicle = await db.query<{ id: string }>(
      `INSERT INTO vehicles (vin, model, customer_id) VALUES ($1, 'EVT-262', $2)
       ON CONFLICT (vin) DO UPDATE SET model = EXCLUDED.model RETURNING id`,
      [VIN, customer.rows[0]!.id],
    );
    const device = await db.query<{ id: string }>(
      `INSERT INTO devices (device_serial, vehicle_id) VALUES ('G3-INGEST-DEV-0001', $1)
       ON CONFLICT (device_serial) DO UPDATE SET vehicle_id = EXCLUDED.vehicle_id RETURNING id`,
      [vehicle.rows[0]!.id],
    );
    deviceId = device.rows[0]!.id;
  });

  afterAll(async () => {
    await db.end();
  });

  beforeEach(async () => {
    await db.query('DELETE FROM telematics_readings');
    await db.query('DELETE FROM telemetry_quarantine');
    await db.query('DELETE FROM alerts');
    await db.query(
      `UPDATE devices SET last_seen_at = NULL, power_status = 'normal' WHERE id = $1`,
      [deviceId],
    );
  });

  function build() {
    const metrics = new IngestMetrics(() => NOW_MS);
    const pipeline = new IngestPipeline(db, metrics, () => NOW_MS);
    const source = new MockTelematicsSource(() => NOW_MS);
    source.subscribe((msg) => pipeline.handle(msg));
    return { metrics, source };
  }

  it('bản ghi hợp lệ → đúng 1 dòng telematics_readings, time = giờ THIẾT BỊ, lag đo đúng', async () => {
    const { metrics, source } = build();
    await source.connect();
    await source.emit(telemetryTopic(VIN), validPayload());

    const rows = await db.query(
      `SELECT time, schema_version, soc_pct, odometer_km, fault_codes,
              ST_Y(position::geometry) AS lat, ST_X(position::geometry) AS lng
       FROM telematics_readings`,
    );
    expect(rows.rowCount).toBe(1);
    const row = rows.rows[0]!;
    expect(new Date(row.time as string).toISOString()).toBe(DEVICE_TS);
    expect(row.schema_version).toBe(1);
    expect(Number(row.soc_pct)).toBe(55.5);
    expect(row.fault_codes).toEqual(['P0A80']);
    expect(Number(row.lat)).toBeCloseTo(10.85, 5);
    expect(Number(row.lng)).toBeCloseTo(106.75, 5);
    // NF-01: lag = giờ ghi − ts thiết bị = 5s (≪ 30s)
    expect(metrics.lagWindow.p95()).toBeCloseTo(5, 1);

    // F-J1: thiết bị vừa liên lạc → last_seen_at = giờ nhận
    const dev = await db.query(`SELECT last_seen_at FROM devices WHERE id = $1`, [deviceId]);
    expect(new Date(dev.rows[0]!.last_seen_at as string).getTime()).toBe(NOW_MS);
  });

  it('kịch bản xấu: dữ liệu trùng/gửi bù 2 lần → vẫn đúng 1 dòng (ON CONFLICT)', async () => {
    const { source } = build();
    await source.connect();
    await source.emit(telemetryTopic(VIN), validPayload());
    await source.emit(telemetryTopic(VIN), validPayload()); // thiết bị gửi bù sau mất sóng

    const rows = await db.query('SELECT count(*)::int AS n FROM telematics_readings');
    expect(rows.rows[0]!.n).toBe(1);
    const quarantine = await db.query('SELECT count(*)::int AS n FROM telemetry_quarantine');
    expect(quarantine.rows[0]!.n).toBe(0); // gửi bù KHÔNG phải lỗi — không vào quarantine
  });

  it('kịch bản xấu: mất sóng, bản ghi đến trễ ts cũ → vẫn ghi đúng time thiết bị (NF-09)', async () => {
    const { metrics, source } = build();
    await source.connect();
    const tsCu = '2026-07-28T01:00:00.000Z'; // đến trễ 2 giờ so với NOW_MS
    await source.emit(telemetryTopic(VIN), validPayload({ ts: tsCu }));

    const rows = await db.query('SELECT time FROM telematics_readings');
    expect(rows.rowCount).toBe(1);
    expect(new Date(rows.rows[0]!.time as string).toISOString()).toBe(tsCu);
    // metric lag phản ánh trung thực độ trễ lớn (7205s) — không che giấu
    expect(metrics.lagWindow.p95()).toBeGreaterThan(7_000);
  });

  it('sai schema → vào quarantine kèm lý do + alert data_quality, KHÔNG drop lặng lẽ', async () => {
    const { source } = build();
    await source.connect();
    await source.emit(telemetryTopic(VIN), validPayload({ soc_pct: 250 })); // SOC vô lý
    await source.emit(telemetryTopic(VIN), '{khong-phai-json'); // payload hỏng

    const q = await db.query(
      'SELECT reason, raw_payload, schema_version FROM telemetry_quarantine ORDER BY created_at',
    );
    expect(q.rowCount).toBe(2);
    expect(q.rows[0]!.reason).toContain('soc_pct');
    expect(q.rows[0]!.schema_version).toBe(1);
    expect(q.rows[1]!.reason).toBe('json_khong_hop_le');
    expect(q.rows[1]!.raw_payload).toBe('{khong-phai-json'); // giữ nguyên payload thô

    // Chống spam: 2 bản tin hỏng cùng giờ → chỉ 1 alert
    const alerts = await db.query(
      `SELECT count(*)::int AS n FROM alerts WHERE type = 'data_quality'`,
    );
    expect(alerts.rows[0]!.n).toBe(1);

    const readings = await db.query('SELECT count(*)::int AS n FROM telematics_readings');
    expect(readings.rows[0]!.n).toBe(0);
  });

  it('schema_version tương lai (chưa hỗ trợ) → quarantine, không ghi bừa vào readings', async () => {
    const { source } = build();
    await source.connect();
    await source.emit(telemetryTopic(VIN), validPayload({ schema_version: 2 }));

    const q = await db.query('SELECT reason, schema_version FROM telemetry_quarantine');
    expect(q.rowCount).toBe(1);
    expect(q.rows[0]!.reason).toContain('schema_version_khong_ho_tro');
    expect(q.rows[0]!.schema_version).toBe(2);
  });

  it('VIN không tồn tại → quarantine (thiết bị lạ bơm dữ liệu — NF-06)', async () => {
    const { source } = build();
    await source.connect();
    await source.emit(telemetryTopic('G3-VIN-LA-9999'), validPayload({ vin: 'G3-VIN-LA-9999' }));

    const q = await db.query('SELECT reason FROM telemetry_quarantine');
    expect(q.rowCount).toBe(1);
    expect(q.rows[0]!.reason).toContain('vin_khong_ton_tai');
  });

  it('status LWT → power_status=lost (F-J3), online lại → normal + last_seen (F-J1)', async () => {
    const { source } = build();
    await source.connect();
    await source.emit(
      statusTopic(VIN),
      JSON.stringify({ vin: VIN, status: 'offline', reason: 'lwt', ts: DEVICE_TS }),
    );
    let dev = await db.query(`SELECT power_status, last_seen_at FROM devices WHERE id = $1`, [
      deviceId,
    ]);
    expect(dev.rows[0]!.power_status).toBe('lost');
    expect(dev.rows[0]!.last_seen_at).toBeNull(); // LWT do broker phát hộ — thiết bị KHÔNG liên lạc

    await source.emit(
      statusTopic(VIN),
      JSON.stringify({ vin: VIN, status: 'online', reason: 'boot', ts: DEVICE_TS }),
    );
    dev = await db.query(`SELECT power_status, last_seen_at FROM devices WHERE id = $1`, [
      deviceId,
    ]);
    expect(dev.rows[0]!.power_status).toBe('normal');
    expect(new Date(dev.rows[0]!.last_seen_at as string).getTime()).toBe(NOW_MS);
  });
});
