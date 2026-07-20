// F-G4 · Test bắt buộc Prompt 03: telematics_readings là hypertable TimescaleDB,
// insert 10.000 bản ghi và query theo khoảng thời gian; kèm 2 kịch bản xấu (DoD):
// dữ liệu trùng (gửi lại khi mất sóng) và dữ liệu đến trễ (timestamp quá khứ).
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDatabaseUrl } from './env';
import { ensureFixture, type Fixture } from './test/fixtures';

const TOTAL = 10_000;
const START = new Date('2026-06-01T00:00:00Z');
const STEP_MS = 60_000; // 1 bản ghi/phút

let client: pg.Client;
let fixture: Fixture;

beforeAll(async () => {
  client = new pg.Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  fixture = await ensureFixture(client);
});

afterAll(async () => {
  await client.end();
});

describe('telematics_readings (hypertable, NF-16)', () => {
  it('là hypertable TimescaleDB', async () => {
    const res = await client.query(
      `SELECT 1 FROM timescaledb_information.hypertables
       WHERE hypertable_name = 'telematics_readings'`,
    );
    expect(res.rowCount).toBe(1);
  });

  it(`insert ${TOTAL} bản ghi theo batch`, async () => {
    const batchSize = 1000;
    for (let offset = 0; offset < TOTAL; offset += batchSize) {
      const values: string[] = [];
      const params: unknown[] = [];
      for (let i = 0; i < batchSize; i++) {
        const idx = offset + i;
        const base = params.length;
        values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`);
        params.push(
          new Date(START.getTime() + idx * STEP_MS),
          fixture.vehicleId,
          (20 + (idx % 70)).toFixed(1), // SOC giả 20–89
          (idx % 80).toFixed(1), // tốc độ giả
          1, // schema_version (NF-16)
        );
      }
      await client.query(
        `INSERT INTO telematics_readings (time, vehicle_id, soc_pct, speed_kmh, schema_version)
         VALUES ${values.join(', ')}`,
        params,
      );
    }
    const count = await client.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM telematics_readings WHERE vehicle_id = $1',
      [fixture.vehicleId],
    );
    expect(Number(count.rows[0]!.n)).toBe(TOTAL);
  });

  it('query theo khoảng thời gian trả đúng số bản ghi', async () => {
    // Khoảng [phút 2000, phút 3000) → đúng 1000 bản ghi
    const from = new Date(START.getTime() + 2000 * STEP_MS);
    const to = new Date(START.getTime() + 3000 * STEP_MS);
    const res = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM telematics_readings
       WHERE vehicle_id = $1 AND time >= $2 AND time < $3`,
      [fixture.vehicleId, from, to],
    );
    expect(Number(res.rows[0]!.n)).toBe(1000);

    // Bản ghi mới nhất trong khoảng đọc ra đúng schema_version
    const latest = await client.query<{ schema_version: number }>(
      `SELECT schema_version FROM telematics_readings
       WHERE vehicle_id = $1 AND time >= $2 AND time < $3
       ORDER BY time DESC LIMIT 1`,
      [fixture.vehicleId, from, to],
    );
    expect(latest.rows[0]!.schema_version).toBe(1);
  });

  it('kịch bản xấu: bản ghi trùng (thiết bị gửi lại khi mất sóng) không tạo dòng đôi', async () => {
    const dupTime = new Date(START.getTime()); // trùng bản ghi đầu tiên
    const res = await client.query(
      `INSERT INTO telematics_readings (time, vehicle_id, soc_pct, schema_version)
       VALUES ($1, $2, 50, 1)
       ON CONFLICT (vehicle_id, time) DO NOTHING`,
      [dupTime, fixture.vehicleId],
    );
    expect(res.rowCount).toBe(0); // bị bỏ qua, không nhân đôi
    const count = await client.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM telematics_readings WHERE vehicle_id = $1 AND time = $2',
      [fixture.vehicleId, dupTime],
    );
    expect(Number(count.rows[0]!.n)).toBe(1);
  });

  it('kịch bản xấu: dữ liệu đến trễ (timestamp quá khứ) vẫn ghi được', async () => {
    const late = new Date(START.getTime() - 24 * 3600 * 1000); // trước cả lô dữ liệu 1 ngày
    const res = await client.query(
      `INSERT INTO telematics_readings (time, vehicle_id, soc_pct, schema_version)
       VALUES ($1, $2, 77, 1)
       ON CONFLICT (vehicle_id, time) DO NOTHING`,
      [late, fixture.vehicleId],
    );
    expect(res.rowCount).toBe(1);
  });
});
