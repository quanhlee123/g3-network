// F-G4 · Test bắt buộc Prompt 03: trigger append-only (NF-11) trên charging_sessions
// và violations — UPDATE/DELETE phải bị DB chặn, INSERT vẫn hoạt động.
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDatabaseUrl } from './env';
import { ensureFixture, type Fixture } from './test/fixtures';

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

describe('charging_sessions là APPEND-ONLY (NF-11)', () => {
  let sessionId: string;

  it('INSERT phiên sạc hợp lệ thành công', async () => {
    const res = await client.query<{ id: string }>(
      `INSERT INTO charging_sessions
         (vehicle_id, station_id, connector_id, ocpp_transaction_id, started_at, ended_at,
          energy_kwh, soc_start_pct, soc_end_pct, cost_vnd)
       VALUES ($1, $2, $3, 'tx-test-0001', now() - interval '1 hour', now(),
               45.500, 21, 88, 150000)
       RETURNING id`,
      [fixture.vehicleId, fixture.stationId, fixture.connectorId],
    );
    sessionId = res.rows[0]!.id;
    expect(sessionId).toBeTruthy();
  });

  it('UPDATE bị trigger chặn', async () => {
    await expect(
      client.query('UPDATE charging_sessions SET cost_vnd = 0 WHERE id = $1', [sessionId]),
    ).rejects.toThrow(/APPEND-ONLY/);
  });

  it('DELETE bị trigger chặn', async () => {
    await expect(
      client.query('DELETE FROM charging_sessions WHERE id = $1', [sessionId]),
    ).rejects.toThrow(/APPEND-ONLY/);
    // Bản ghi vẫn còn nguyên
    const check = await client.query('SELECT 1 FROM charging_sessions WHERE id = $1', [sessionId]);
    expect(check.rowCount).toBe(1);
  });
});

describe('violations là APPEND-ONLY (NF-11)', () => {
  let violationId: string;

  it('INSERT vi phạm kèm evidence jsonb thành công', async () => {
    const res = await client.query<{ id: string }>(
      `INSERT INTO violations (vehicle_id, type, evidence, risk_level)
       VALUES ($1, 'soc_above_max', $2, 'medium')
       RETURNING id`,
      [
        fixture.vehicleId,
        JSON.stringify({ session_snapshot: { soc_end_pct: 96 }, policy: { soc_max_pct: 90 } }),
      ],
    );
    violationId = res.rows[0]!.id;
    expect(violationId).toBeTruthy();
  });

  it('UPDATE bị trigger chặn', async () => {
    await expect(
      client.query("UPDATE violations SET risk_level = 'low' WHERE id = $1", [violationId]),
    ).rejects.toThrow(/APPEND-ONLY/);
  });

  it('DELETE bị trigger chặn', async () => {
    await expect(
      client.query('DELETE FROM violations WHERE id = $1', [violationId]),
    ).rejects.toThrow(/APPEND-ONLY/);
  });
});
