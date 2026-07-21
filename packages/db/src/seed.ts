// F-G4 · Seed dữ liệu GIẢ 100% (quy tắc 12 — không VIN/SĐT thật): npm run db:seed.
// Idempotent: chạy lại không tạo bản ghi trùng (upsert theo khóa tự nhiên).
// Nội dung theo Prompt 03: 20 xe (EVT-262/400/825), 3 trạm × 4 trụ,
// 5 tài khoản các vai trò sheet 9, 2 chính sách sạc mẫu (SOC 20–90%, ToU).
import pg from 'pg';
import { databaseUrl } from './env';

const MODELS = [
  // dung lượng pin GIẢ theo dòng xe (kWh)
  { model: 'EVT-262', count: 8, capacityKwh: 105 },
  { model: 'EVT-400', count: 7, capacityKwh: 210 },
  { model: 'EVT-825', count: 5, capacityKwh: 420 },
] as const;

const STATIONS = [
  // tọa độ GIẢ quanh TP.HCM (lon, lat)
  {
    code: 'G3-ST-001',
    name: 'Trạm sạc G3 Thủ Đức (GIẢ)',
    area: 'TP.HCM — Thủ Đức',
    lon: 106.75,
    lat: 10.85,
  },
  {
    code: 'G3-ST-002',
    name: 'Trạm sạc G3 Bình Chánh (GIẢ)',
    area: 'TP.HCM — Bình Chánh',
    lon: 106.6,
    lat: 10.72,
  },
  {
    code: 'G3-ST-003',
    name: 'Trạm sạc G3 Bến Lức (GIẢ)',
    area: 'Long An — Bến Lức',
    lon: 106.48,
    lat: 10.63,
  },
] as const;

async function seed(client: pg.Client): Promise<void> {
  // --- 2 khách hàng / đội xe ---
  const customers: Record<string, string> = {};
  for (const c of [
    { contract: 'HD-G3-SIM-001', name: 'Cty TNHH Vận tải Sao Mai (GIẢ)' },
    { contract: 'HD-G3-SIM-002', name: 'HTX Vận tải Bình Minh (GIẢ)' },
  ]) {
    const res = await client.query<{ id: string }>(
      `INSERT INTO customers (name, contract_no, service_plan)
       VALUES ($1, $2, 'standard')
       ON CONFLICT (contract_no) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [c.name, c.contract],
    );
    customers[c.contract] = res.rows[0]!.id;
  }
  const saoMaiId = customers['HD-G3-SIM-001']!;
  const binhMinhId = customers['HD-G3-SIM-002']!;

  // --- 5 tài khoản theo vai trò sheet 9 (enum còn cskh/sale cho giai đoạn sau) ---
  const users: Record<string, string> = {};
  for (const u of [
    { email: 'admin@g3.test', name: 'Admin G3 Network (GIẢ)', role: 'admin', customerId: null },
    { email: 'taixe01@g3.test', name: 'Nguyễn Văn Giả', role: 'driver', customerId: saoMaiId },
    {
      email: 'doitruong@saomai.test',
      name: 'Trần Thị Mô Phỏng',
      role: 'fleet_manager',
      customerId: saoMaiId,
    },
    {
      email: 'vanhanh@g3energy.test',
      name: 'Lê Vận Hành (GIẢ)',
      role: 'energy_ops',
      customerId: null,
    },
    {
      email: 'baohanh@g3mobility.test',
      name: 'Phạm Bảo Hành (GIẢ)',
      role: 'warranty_admin',
      customerId: null,
    },
  ]) {
    const res = await client.query<{ id: string }>(
      `INSERT INTO users (email, full_name, role, customer_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
       RETURNING id`,
      [u.email, u.name, u.role, u.customerId],
    );
    users[u.email] = res.rows[0]!.id;
  }

  // Tài xế kèm consent Nghị định 13 (SĐT GIẢ 0900xxx không cấp phát thật)
  const driverRes = await client.query<{ id: string }>(
    `INSERT INTO drivers (user_id, phone, license_no, consent_at, consent_version)
     VALUES ($1, '0900000001', 'GPLX-SIM-0001', now(), 'v1.0')
     ON CONFLICT (user_id) DO UPDATE SET consent_version = EXCLUDED.consent_version
     RETURNING id`,
    [users['taixe01@g3.test']],
  );
  const driverId = driverRes.rows[0]!.id;

  // --- 20 xe + thiết bị + pin (12 xe Sao Mai, 8 xe Bình Minh) ---
  let seq = 0;
  for (const m of MODELS) {
    for (let i = 0; i < m.count; i++) {
      seq += 1;
      const n = String(seq).padStart(4, '0');
      const vin = `G3-SIM-VIN-${n}`; // VIN GIẢ, không theo chuẩn VIN thật
      const customerId = seq <= 12 ? saoMaiId : binhMinhId;
      const assignedDriver = seq === 1 ? driverId : null; // tài xế mẫu gán xe đầu tiên
      const vehicle = await client.query<{ id: string }>(
        `INSERT INTO vehicles (vin, model, customer_id, assigned_driver_id, handover_date, service_plan)
         VALUES ($1, $2, $3, $4, $5, 'standard')
         ON CONFLICT (vin) DO UPDATE SET model = EXCLUDED.model
         RETURNING id`,
        [vin, m.model, customerId, assignedDriver, '2026-01-15'],
      );
      const vehicleId = vehicle.rows[0]!.id;

      await client.query(
        `INSERT INTO devices (device_serial, vehicle_id, firmware_version, sim_iccid, mtls_identity, last_seen_at)
         VALUES ($1, $2, '1.0.0-sim', $3, $4, now())
         ON CONFLICT (device_serial) DO UPDATE SET vehicle_id = EXCLUDED.vehicle_id`,
        [`G3-SIM-DEV-${n}`, vehicleId, `89000000000000${n}`, `mtls-sim-${n}`],
      );
      await client.query(
        `INSERT INTO batteries (pack_id, vehicle_id, chemistry, capacity_kwh, soh_pct, cycle_count)
         VALUES ($1, $2, 'LFP', $3, 100, 0)
         ON CONFLICT (pack_id) DO UPDATE SET vehicle_id = EXCLUDED.vehicle_id`,
        [`G3-SIM-PACK-${n}`, vehicleId, m.capacityKwh],
      );
    }
  }

  // --- 3 trạm × 4 trụ (CCS2, 120 kW mỗi trụ) ---
  for (const s of STATIONS) {
    const station = await client.query<{ id: string }>(
      `INSERT INTO charging_stations (code, name, location, area, total_power_kw, operating_hours)
       VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography, $5, 480, '24/7')
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [s.code, s.name, s.lon, s.lat, s.area],
    );
    const stationId = station.rows[0]!.id;
    for (let c = 1; c <= 4; c++) {
      await client.query(
        `INSERT INTO connectors (station_id, ocpp_connector_id, max_power_kw, standard)
         VALUES ($1, $2, 120, 'CCS2')
         ON CONFLICT (station_id, ocpp_connector_id) DO NOTHING`,
        [stationId, c],
      );
    }
  }

  // --- 2 chính sách sạc mẫu (F-B1) ---
  await client.query(
    `INSERT INTO charging_policies
       (code, version, name, scope_type, customer_id, soc_min_pct, soc_max_pct, effective_from)
     VALUES ('POL-SOC-2090', 1, 'Chính sách SOC 20–90% — đội Sao Mai', 'fleet', $1, 20, 90, '2026-01-01T00:00:00Z')
     ON CONFLICT (code, version) DO NOTHING`,
    [saoMaiId],
  );
  await client.query(
    `INSERT INTO charging_policies
       (code, version, name, scope_type, vehicle_model, allowed_hours, max_power_kw, effective_from)
     VALUES ('POL-TOU-DEM', 1, 'Chính sách ToU sạc đêm 22h–6h — dòng EVT-825', 'model', 'EVT-825',
             $1, 150, '2026-01-01T00:00:00Z')
     ON CONFLICT (code, version) DO NOTHING`,
    [JSON.stringify([{ from: '22:00', to: '06:00' }])],
  );
}

async function main(): Promise<void> {
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    await seed(client);
    const counts = await client.query<{ src: string; n: string }>(
      `SELECT 'vehicles' AS src, count(*)::text AS n FROM vehicles
       UNION ALL SELECT 'connectors', count(*)::text FROM connectors
       UNION ALL SELECT 'users', count(*)::text FROM users
       UNION ALL SELECT 'charging_policies', count(*)::text FROM charging_policies`,
    );
    for (const row of counts.rows) console.log(`${row.src}: ${row.n}`);
    console.log('Seed xong (dữ liệu GIẢ 100%).');
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
