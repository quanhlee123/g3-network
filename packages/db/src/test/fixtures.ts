// F-G4 · Fixture tối thiểu cho test DB (dữ liệu GIẢ 100%).
import type pg from 'pg';

export interface Fixture {
  vehicleId: string;
  stationId: string;
  connectorId: string;
}

/** Tạo (idempotent) 1 khách hàng + 1 xe + 1 trạm + 1 trụ để test tham chiếu FK. */
export async function ensureFixture(client: pg.Client): Promise<Fixture> {
  const customer = await client.query<{ id: string }>(
    `INSERT INTO customers (name, contract_no) VALUES ('KH Test (GIẢ)', 'HD-TEST-001')
     ON CONFLICT (contract_no) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
  );
  const vehicle = await client.query<{ id: string }>(
    `INSERT INTO vehicles (vin, model, customer_id) VALUES ('G3-TEST-VIN-0001', 'EVT-262', $1)
     ON CONFLICT (vin) DO UPDATE SET model = EXCLUDED.model RETURNING id`,
    [customer.rows[0]!.id],
  );
  const station = await client.query<{ id: string }>(
    `INSERT INTO charging_stations (code, name, location)
     VALUES ('G3-TEST-ST-001', 'Trạm test (GIẢ)', ST_SetSRID(ST_MakePoint(106.7, 10.8), 4326)::geography)
     ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
  );
  const connector = await client.query<{ id: string }>(
    `INSERT INTO connectors (station_id, ocpp_connector_id, max_power_kw)
     VALUES ($1, 1, 120)
     ON CONFLICT (station_id, ocpp_connector_id) DO UPDATE SET max_power_kw = EXCLUDED.max_power_kw
     RETURNING id`,
    [station.rows[0]!.id],
  );
  return {
    vehicleId: vehicle.rows[0]!.id,
    stationId: station.rows[0]!.id,
    connectorId: connector.rows[0]!.id,
  };
}
