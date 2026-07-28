// F-G2 — Test CSMS vào DB g3_test qua mock transport (không cần WebSocket thật).
// Gồm 2 bài BẮT BUỘC của Prompt 05:
//   1) Phiên sạc đứt kết nối giữa chừng vẫn ra ĐÚNG 1 bản ghi charging_sessions, kWh đúng.
//   2) Trạng thái Faulted phản ánh lên DB ≤30s (tự bấm giờ).
// Lưu ý: charging_sessions là APPEND-ONLY (NF-11) — test không dọn bảng này mà soi theo
// ocpp_transaction_id riêng của từng test.
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  OcppRpc,
  createMockTransportPair,
  type StartTransactionConf,
  type StopTransactionConf,
} from '@g3/contracts';
import { testDatabaseUrl } from '@g3/db';
import { ChargePointSim } from '@g3/ocpp-sim';
import { CsmsStationSession, mapOcppStatus } from './session';

const STATION_CODE = 'G3-OCPP-ST-001';
const VIN = 'G3-OCPP-VIN-0001';

describe('CsmsStationSession (DB g3_test)', () => {
  let db: pg.Client;
  let stationId: string;

  beforeAll(async () => {
    db = new pg.Client({ connectionString: testDatabaseUrl() });
    await db.connect();
    const customer = await db.query<{ id: string }>(
      `INSERT INTO customers (name, contract_no) VALUES ('KH OCPP Test (GIẢ)', 'HD-OCPP-001')
       ON CONFLICT (contract_no) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    );
    await db.query(
      `INSERT INTO vehicles (vin, model, customer_id) VALUES ($1, 'EVT-400', $2)
       ON CONFLICT (vin) DO NOTHING`,
      [VIN, customer.rows[0]!.id],
    );
    const station = await db.query<{ id: string }>(
      `INSERT INTO charging_stations (code, name, location)
       VALUES ($1, 'Trạm OCPP test (GIẢ)', ST_SetSRID(ST_MakePoint(106.7, 10.8), 4326)::geography)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [STATION_CODE],
    );
    stationId = station.rows[0]!.id;
    for (const c of [1, 2]) {
      await db.query(
        `INSERT INTO connectors (station_id, ocpp_connector_id, max_power_kw)
         VALUES ($1, $2, 120) ON CONFLICT (station_id, ocpp_connector_id) DO NOTHING`,
        [stationId, c],
      );
    }
  });

  afterAll(async () => {
    await db.end();
  });

  beforeEach(async () => {
    await db.query(`UPDATE connectors SET status = 'Available' WHERE station_id = $1`, [stationId]);
  });

  /** Dựng 1 "trạm giả" nói chuyện với CsmsStationSession qua cặp transport RAM. */
  function connectStation() {
    const pair = createMockTransportPair();
    const session = new CsmsStationSession(pair.csms, db, STATION_CODE, stationId, {
      log: () => {},
    });
    const stationRpc = new OcppRpc(pair.station);
    return { pair, session, stationRpc };
  }

  async function startTx(
    stationRpc: OcppRpc,
    meterStart: number,
    startedAt = new Date().toISOString(),
  ): Promise<number> {
    const conf = await stationRpc.call<StartTransactionConf>('StartTransaction', {
      connectorId: 1,
      idTag: VIN,
      meterStart,
      timestamp: startedAt,
    });
    expect(conf.idTagInfo.status).toBe('Accepted');
    return conf.transactionId;
  }

  it('resolveStationId: mã trạm seed có thật, mã lạ trả null', async () => {
    expect(await CsmsStationSession.resolveStationId(db, STATION_CODE)).toBe(stationId);
    expect(await CsmsStationSession.resolveStationId(db, 'G3-ST-KHONG-CO')).toBeNull();
  });

  it('NGHIỆM THU NF-02: StatusNotification Faulted phản ánh vào DB ≤30s (tự bấm giờ)', async () => {
    const { stationRpc } = connectStation();
    const t0 = Date.now();
    await stationRpc.call('StatusNotification', {
      connectorId: 1,
      status: 'Faulted',
      errorCode: 'GroundFailure',
      timestamp: new Date().toISOString(),
    });
    const row = await db.query(
      `SELECT status, updated_at FROM connectors WHERE station_id = $1 AND ocpp_connector_id = 1`,
      [stationId],
    );
    const elapsedS = (Date.now() - t0) / 1000;
    expect(row.rows[0]!.status).toBe('Faulted');
    expect(elapsedS).toBeLessThanOrEqual(30); // NF-02 — thực tế cỡ mili-giây
  });

  it('phiên sạc bình thường → đúng 1 dòng charging_sessions, kWh & SOC đầu/cuối khớp', async () => {
    const { stationRpc } = connectStation();
    await stationRpc.call('BootNotification', {
      chargePointVendor: 'G3-SIM',
      chargePointModel: 'TEST',
    });
    const startedAt = '2026-07-28T02:00:00.000Z';
    const txId = await startTx(stationRpc, 100_000, startedAt);

    // 2 lần MeterValues: SoC 40 → 55, công tơ chạy, công suất 120 kW
    for (const [wh, soc] of [
      [110_000, 40],
      [120_000, 55],
    ] as const) {
      await stationRpc.call('MeterValues', {
        connectorId: 1,
        transactionId: txId,
        meterValue: [
          {
            timestamp: new Date().toISOString(),
            sampledValue: [
              { value: String(wh), measurand: 'Energy.Active.Import.Register', unit: 'Wh' },
              { value: String(soc), measurand: 'SoC', unit: 'Percent' },
              { value: '120', measurand: 'Power.Active.Import', unit: 'kW' },
            ],
          },
        ],
      });
    }
    await stationRpc.call('StopTransaction', {
      transactionId: txId,
      meterStop: 130_000,
      timestamp: '2026-07-28T02:15:00.000Z', // 15 phút
      reason: 'Local',
      transactionData: [
        {
          timestamp: '2026-07-28T02:15:00.000Z',
          sampledValue: [{ value: '70', measurand: 'SoC', unit: 'Percent' }],
        },
      ],
    });

    const rows = await db.query(`SELECT * FROM charging_sessions WHERE ocpp_transaction_id = $1`, [
      String(txId),
    ]);
    expect(rows.rowCount).toBe(1);
    const s = rows.rows[0]!;
    expect(Number(s.energy_kwh)).toBeCloseTo(30, 3); // (130000-100000)/1000
    expect(Number(s.soc_start_pct)).toBe(40); // SoC đầu = MeterValues đầu tiên
    expect(Number(s.soc_end_pct)).toBe(70); // SoC cuối = transactionData lúc Stop
    expect(Number(s.max_power_kw)).toBe(120);
    expect(Number(s.avg_power_kw)).toBeCloseTo(120, 1); // 30 kWh / 0.25h
    expect(new Date(s.started_at as string).toISOString()).toBe(startedAt);

    const tx = await db.query(`SELECT status FROM ocpp_transactions WHERE transaction_id = $1`, [
      txId,
    ]);
    expect(tx.rows[0]!.status).toBe('closed');
  });

  it('BÀI BẮT BUỘC: đứt kết nối giữa phiên → StopTransaction bù (kể cả gửi 2 lần) vẫn ra ĐÚNG 1 dòng, kWh đúng', async () => {
    // Phiên mở trên kết nối 1 (bắt đầu 30 phút trước cho thời lượng thực tế)
    const first = connectStation();
    const txId = await startTx(
      first.stationRpc,
      500_000,
      new Date(Date.now() - 30 * 60_000).toISOString(),
    );
    await first.stationRpc.call('MeterValues', {
      connectorId: 1,
      transactionId: txId,
      meterValue: [
        {
          timestamp: new Date().toISOString(),
          sampledValue: [{ value: '45', measurand: 'SoC', unit: 'Percent' }],
        },
      ],
    });

    // Đứt kết nối đột ngột giữa phiên
    first.pair.station.close();
    await new Promise((r) => setTimeout(r, 10));
    const afterDrop = await db.query(
      `SELECT status FROM connectors WHERE station_id = $1 AND ocpp_connector_id = 1`,
      [stationId],
    );
    expect(afterDrop.rows[0]!.status).toBe('Unavailable'); // mất kết nối → không tin trạng thái súng

    // Phiên OCPP trong DB vẫn MỞ — chờ trụ nối lại
    const openTx = await db.query(
      `SELECT status FROM ocpp_transactions WHERE transaction_id = $1`,
      [txId],
    );
    expect(openTx.rows[0]!.status).toBe('open');

    // Trụ nối lại (kết nối 2) và gửi StopTransaction bù với số công tơ đo trong lúc offline
    const second = connectStation();
    const stopReq = {
      transactionId: txId,
      meterStop: 542_000, // sạc thêm 42 kWh trong lúc mất kết nối
      timestamp: new Date().toISOString(),
      reason: 'PowerLoss',
      transactionData: [
        {
          timestamp: new Date().toISOString(),
          sampledValue: [{ value: '78', measurand: 'SoC', unit: 'Percent' }],
        },
      ],
    };
    const conf1 = await second.stationRpc.call<StopTransactionConf>('StopTransaction', stopReq);
    expect(conf1.idTagInfo?.status).toBe('Accepted');
    // Trụ không chắc CSMS đã nhận → RETRY gửi lại lần 2 (hành vi thật khi mạng chập chờn)
    await second.stationRpc.call<StopTransactionConf>('StopTransaction', stopReq);

    const rows = await db.query(
      `SELECT energy_kwh, soc_start_pct, soc_end_pct FROM charging_sessions
       WHERE ocpp_transaction_id = $1`,
      [String(txId)],
    );
    expect(rows.rowCount).toBe(1); // ĐÚNG 1 bản ghi dù Stop đến 2 lần
    expect(Number(rows.rows[0]!.energy_kwh)).toBeCloseTo(42, 3); // kWh đúng theo công tơ
    expect(Number(rows.rows[0]!.soc_start_pct)).toBe(45);
    expect(Number(rows.rows[0]!.soc_end_pct)).toBe(78);
  });

  it('idTag lạ (không phải VIN trong hệ) → Invalid, không mở phiên', async () => {
    const { stationRpc } = connectStation();
    const conf = await stationRpc.call<StartTransactionConf>('StartTransaction', {
      connectorId: 1,
      idTag: 'THE-LA-999',
      meterStart: 0,
      timestamp: new Date().toISOString(),
    });
    expect(conf.idTagInfo.status).toBe('Invalid');
    const tx = await db.query(
      `SELECT count(*)::int AS n FROM ocpp_transactions WHERE id_tag = 'THE-LA-999'`,
    );
    expect(tx.rows[0]!.n).toBe(0);
  });

  it('tích hợp với ChargePointSim thật (mock transport): RemoteStart → sim mở phiên, RemoteStop → dừng', async () => {
    // Factory mỗi lần connect tạo cặp transport mới + CsmsStationSession mới (như ws-server làm)
    let session: CsmsStationSession | null = null;
    const sim = new ChargePointSim(
      async () => {
        const pair = createMockTransportPair();
        session = new CsmsStationSession(pair.csms, db, STATION_CODE, stationId, { log: () => {} });
        return pair.station;
      },
      {
        stationCode: STATION_CODE,
        idTag: VIN,
        connectorId: 2,
        sessionTicks: 4,
        meterStartWh: 900_000,
        sleep: () => Promise.resolve(), // test chạy tức thì
        log: () => {},
      },
    );
    await sim.connect();
    expect(session).not.toBeNull();

    const status = await session!.remoteStart(2, VIN);
    expect(status).toBe('Accepted');
    // phiên chạy nền với sleep tức thì — chờ microtask xả hết
    await new Promise((r) => setTimeout(r, 50));

    const rows = await db.query(
      `SELECT energy_kwh FROM charging_sessions cs
       JOIN connectors c ON c.id = cs.connector_id
       WHERE cs.station_id = $1 AND c.ocpp_connector_id = 2`,
      [stationId],
    );
    expect(rows.rowCount).toBe(1); // RemoteStart đã tạo đúng 1 phiên hoàn chỉnh
    expect(Number(rows.rows[0]!.energy_kwh)).toBeGreaterThan(0);
  });

  it('mapOcppStatus quy trạng thái trung gian về 4 giá trị DB', () => {
    expect(mapOcppStatus('Faulted')).toBe('Faulted');
    expect(mapOcppStatus('Charging')).toBe('Charging');
    expect(mapOcppStatus('SuspendedEV')).toBe('Charging');
    expect(mapOcppStatus('Preparing')).toBe('Available');
    expect(mapOcppStatus('Unavailable')).toBe('Unavailable');
  });
});
