// F-G4 · Seed dữ liệu GIẢ 100% (quy tắc 12 — không VIN/SĐT thật): npm run db:seed.
// Idempotent: chạy lại không tạo bản ghi trùng (upsert theo khóa tự nhiên).
// Nội dung: 20 xe (EVT-262/400/825), 6 trạm × 4 trụ (Prompt 03 là 3 trạm; D-10 chốt
// 2026-07-29 bổ sung 3 trạm hành lang miền Bắc), 7 tài khoản đủ 7 vai trò sheet 9,
// 2 chính sách sạc mẫu (SOC 20–90%, ToU).
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { databaseUrl } from './env';

const MODELS = [
  // dung lượng pin GIẢ theo dòng xe (kWh)
  { model: 'EVT-262', count: 8, capacityKwh: 105 },
  { model: 'EVT-400', count: 7, capacityKwh: 210 },
  { model: 'EVT-825', count: 5, capacityKwh: 420 },
] as const;

// D-10 (ĐÃ CHỐT 2026-07-29): mạng trạm phủ CẢ HAI hành lang mà vehicle-sim chạy
// (`--route nam` = TP.HCM–Tân An, `--route bac` = Hà Nội–Lạng Sơn). Trước đây trạm chỉ ở
// miền Nam trong khi simulator chỉ chạy miền Bắc, nên "trạm gần nhất" của cảnh báo pin F-A2
// ra hơn 1.000 km. Toạ độ đặt SÁT waypoint của tuyến tương ứng trong
// simulators/vehicle-sim/src/route.ts — có test khoá lại (tools/demo-gate0/src/dia-ly.test.ts).
export const SEED_STATIONS = [
  // --- Hành lang miền Nam: TP.HCM → Tân An (tọa độ GIẢ, lon/lat) ---
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
  // --- Hành lang miền Bắc: Hà Nội → Lạng Sơn dọc QL1A ---
  {
    code: 'G3-ST-004',
    name: 'Trạm sạc G3 Gia Lâm (GIẢ)',
    area: 'Hà Nội — Gia Lâm',
    lon: 105.9199,
    lat: 21.0421,
  },
  {
    code: 'G3-ST-005',
    name: 'Trạm sạc G3 Bắc Giang (GIẢ)',
    area: 'Bắc Giang — TP Bắc Giang',
    lon: 106.1946,
    lat: 21.2731,
  },
  {
    code: 'G3-ST-006',
    name: 'Trạm sạc G3 Lạng Sơn (GIẢ)',
    area: 'Lạng Sơn — TP Lạng Sơn',
    lon: 106.7615,
    lat: 21.8537,
  },
] as const;

/** Seed vào client đã kết nối sẵn — script demo Gate 0 gọi lại hàm này. */
export async function seed(client: pg.Client): Promise<void> {
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

  // --- 7 tài khoản, đủ 7 vai trò sheet 9 (F-F1) ---
  // SĐT GIẢ dải 09000000xx — dùng để đăng nhập OTP (apps/api). Không phải số thật (quy tắc 12).
  const users: Record<string, string> = {};
  for (const u of [
    {
      email: 'admin@g3.test',
      phone: '0900000010',
      name: 'Admin G3 Network (GIẢ)',
      role: 'admin',
      customerId: null,
    },
    {
      email: 'taixe01@g3.test',
      phone: '0900000001',
      name: 'Nguyễn Văn Giả',
      role: 'driver',
      customerId: saoMaiId,
    },
    {
      email: 'doitruong@saomai.test',
      phone: '0900000002',
      name: 'Trần Thị Mô Phỏng',
      role: 'fleet_manager',
      customerId: saoMaiId,
    },
    {
      email: 'vanhanh@g3energy.test',
      phone: '0900000003',
      name: 'Lê Vận Hành (GIẢ)',
      role: 'energy_ops',
      customerId: null,
    },
    {
      email: 'baohanh@g3mobility.test',
      phone: '0900000004',
      name: 'Phạm Bảo Hành (GIẢ)',
      role: 'warranty_admin',
      customerId: null,
    },
    {
      email: 'cskh@g3holding.test',
      phone: '0900000005',
      name: 'Võ Chăm Sóc (GIẢ)',
      role: 'cskh',
      customerId: null,
    },
    {
      email: 'sale@g3holding.test',
      phone: '0900000006',
      name: 'Đỗ Kinh Doanh (GIẢ)',
      role: 'sale',
      customerId: null,
    },
  ]) {
    const res = await client.query<{ id: string }>(
      `INSERT INTO users (email, full_name, role, customer_id, phone)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name, phone = EXCLUDED.phone
       RETURNING id`,
      [u.email, u.name, u.role, u.customerId, u.phone],
    );
    users[u.email] = res.rows[0]!.id;
    // F-F3: token đẩy GIẢ cho mỗi tài khoản (quy tắc 12 — không phải token FCM thật).
    // Không có dòng này thì mọi thông báo kênh 'push' đều ghi 'failed' với lý do
    // "chưa đăng ký thiết bị", làm demo trông như hệ thống hỏng trong khi chỉ là thiếu seed.
    await client.query(
      `INSERT INTO push_tokens (user_id, token, platform)
       VALUES ($1, $2, 'android')
       ON CONFLICT (token) DO UPDATE SET revoked_at = NULL`,
      [res.rows[0]!.id, `fcm-gia-${u.email.split('@')[0]!}`],
    );
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

  // --- 1 xe VỪA GIAO, CHƯA kích hoạt (F-F2) ---
  // Cố ý KHÔNG tạo devices/batteries cho xe này: nó là đầu vào của luồng provisioning
  // (Hành trình 1 bước 1). Không có xe nào chưa gắn thiết bị thì không diễn tập được
  // việc bàn giao, và mọi VIN đem quét thử đều báo "đã có thiết bị".
  //
  // Số hiệu 0021 (ngay sau 20 xe trên) là có chủ ý: vehicle-sim sinh VIN theo dãy
  // {prefix}-0001…{prefix}-{count}, nên `npm run sim:vehicles -- --count 21` cho xe này
  // lên sóng thật để bước 4 của luồng kích hoạt có dữ liệu mà chờ. Đặt số ngoài dãy
  // (vd 9001) thì simulator không bao giờ chạm tới và không diễn tập được tới tick xanh.
  await client.query(
    `INSERT INTO vehicles (vin, model, customer_id, handover_date, service_plan)
     VALUES ('G3-SIM-VIN-0021', 'EVT-400', $1, NULL, 'standard')
     ON CONFLICT (vin) DO NOTHING`,
    [saoMaiId],
  );

  // --- 6 trạm × 4 trụ (CCS2, 120 kW mỗi trụ) — 3 miền Nam + 3 miền Bắc, xem D-10 ---
  for (const s of SEED_STATIONS) {
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
  //
  // Dùng `WHERE NOT EXISTS` chứ KHÔNG dùng `ON CONFLICT DO NOTHING`: trigger BEFORE INSERT
  // của migration 0024 (chuỗi version phải nối tiếp) chạy TRƯỚC khi PostgreSQL phát hiện
  // xung đột khoá, nên chạy lại `npm run db:seed` lần hai sẽ bị trigger từ chối với lý do
  // "version phải nối tiếp: mong đợi 2, nhận 1" — dù ý định chỉ là bỏ qua dòng đã có.
  await client.query(
    `INSERT INTO charging_policies
       (code, version, name, scope_type, customer_id, soc_min_pct, soc_max_pct, effective_from, change_note)
     SELECT 'POL-SOC-2090', 1, 'Chính sách SOC 20–90% — đội Sao Mai', 'fleet', $1, 20, 90,
            '2026-01-01T00:00:00Z', 'Ban hành theo hợp đồng bảo hành (dữ liệu GIẢ)'
     WHERE NOT EXISTS (SELECT 1 FROM charging_policies WHERE code = 'POL-SOC-2090')`,
    [saoMaiId],
  );
  await client.query(
    `INSERT INTO charging_policies
       (code, version, name, scope_type, vehicle_model, allowed_hours, max_power_kw, effective_from, change_note)
     SELECT 'POL-TOU-DEM', 1, 'Chính sách ToU sạc đêm 22h–6h — dòng EVT-825', 'model', 'EVT-825',
            $1, 150, '2026-01-01T00:00:00Z', 'Ban hành theo biểu giá ToU (dữ liệu GIẢ)'
     WHERE NOT EXISTS (SELECT 1 FROM charging_policies WHERE code = 'POL-TOU-DEM')`,
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

// Chỉ chạy khi được gọi trực tiếp (npm run db:seed) — import từ nơi khác thì không tự chạy.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
