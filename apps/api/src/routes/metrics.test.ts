// NF-14 — Test /metrics của API: đọc SỐ THẬT từ DB, công khai cho Prometheus,
// và DB hỏng thì vẫn trả metric kèm cờ báo số liệu không đáng tin.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../test/app-harness';
import { seedWorld, type TestWorld } from '../test/world';
import { docSoLieu } from './metrics';

let h: Harness;
let w: TestWorld;

beforeAll(async () => {
  h = await createHarness();
  w = await seedWorld(h.db);
});
afterAll(async () => {
  await h.close();
});

async function metrics(): Promise<string> {
  const res = await h.app.inject({ method: 'GET', url: '/metrics' });
  expect(res.statusCode).toBe(200);
  return res.body;
}

describe('GET /metrics (NF-14)', () => {
  it('công khai — Prometheus scrape được khi KHÔNG có token', async () => {
    const res = await h.app.inject({ method: 'GET', url: '/metrics' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
  });

  it('đếm đúng cảnh báo ĐANG MỞ theo loại và mức, bỏ qua cảnh báo đã đóng', async () => {
    await h.db.query(
      `INSERT INTO alerts (type, vehicle_id, severity, status)
       VALUES ('battery_low', $1, 2, 'open'),
              ('battery_critical', $1, 3, 'open'),
              ('battery_low', $1, 2, 'resolved')`,
      [w.vehicleA1],
    );

    const text = await metrics();
    expect(text).toContain('g3_alerts_open{type="battery_low",severity="2"} 1');
    expect(text).toContain('g3_alerts_open{type="battery_critical",severity="3"} 1');
  });

  it('cảnh báo đóng hết thì nhãn BIẾN MẤT, không đứng yên ở số cũ', async () => {
    expect(await metrics()).toContain('g3_alerts_open{type="battery_critical",severity="3"} 1');

    await h.db.query(`UPDATE alerts SET status = 'resolved' WHERE severity = 3`);

    // Không reset() thì Grafana sẽ mãi hiện "1 cảnh báo nguy cấp" sau khi đã xử lý xong.
    expect(await metrics()).not.toContain('g3_alerts_open{type="battery_critical",severity="3"}');
  });

  it('lệch đối soát lớn nhất 24h lên metric — đúng ngưỡng NF-10 để đặt alert', async () => {
    const sessionId = await taoPhienVaDoiSoat(2.5);

    const text = await metrics();
    expect(text).toContain('g3_reconciliation_lech_max_pct 2.5');
    expect(text).toContain('g3_reconciliation_results{status="lech"} 1');
    expect(sessionId).toBeTruthy();
  });

  it('kịch bản xấu — DB hỏng: vẫn trả 200 kèm cờ scrape_error=1 (không mất target)', async () => {
    const hong = await createHarness();
    await hong.db.end(); // rút dây database ngay dưới chân app

    const res = await hong.app.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('g3_api_metrics_scrape_error 1');

    await hong.app.close();
  });

  it('docSoLieu gom mọi số trong 1 lượt — không phụ thuộc thứ tự truy vấn', async () => {
    const soLieu = await docSoLieu(h.db);

    expect(soLieu).toHaveProperty('canhBaoMo');
    expect(soLieu).toHaveProperty('doiSoat');
    expect(soLieu.cachLy24h).toBeGreaterThanOrEqual(0);
    expect(soLieu.phienSac24h).toBeGreaterThanOrEqual(0);
  });
});

/** Tạo 1 phiên sạc + 1 dòng đối soát lệch `lechPct` % để metric có số thật mà đọc. */
async function taoPhienVaDoiSoat(lechPct: number): Promise<string> {
  const phien = await h.db.query<{ id: string }>(
    `INSERT INTO charging_sessions
       (vehicle_id, station_id, connector_id, started_at, ended_at, energy_kwh)
     VALUES ($1, $2, $3, now() - interval '1 hour', now(), 50)
     RETURNING id`,
    [w.vehicleA1, w.stationId, w.connectorId],
  );
  const sessionId = phien.rows[0]!.id;
  await h.db.query(
    `INSERT INTO reconciliation_results
       (session_id, vehicle_id, station_id, kwh_tru, kwh_xe, lech_xe_pct, lech_max_pct,
        nguong_pct, status)
     VALUES ($1, $2, $3, 50, 51.25, $4, $4, 1.0, 'lech')`,
    [sessionId, w.vehicleA1, w.stationId, lechPct],
  );
  return sessionId;
}
