// F-F1 · Dữ liệu GIẢ 100% cho test apps/api (quy tắc 12). Dựng một "thế giới" nhỏ đủ để
// kiểm tra phân quyền: 2 đội xe khác nhau để chứng minh đội A không thấy xe đội B.
import type pg from 'pg';

export interface TestWorld {
  customerAId: string;
  customerBId: string;
  /** Xe của đội A, ĐƯỢC GÁN cho tài xế taixe. */
  vehicleA1: string;
  /** Xe của đội A, KHÔNG gán tài xế nào. */
  vehicleA2: string;
  /** Xe của đội B — đội A tuyệt đối không được thấy. */
  vehicleB1: string;
  stationId: string;
  connectorId: string;
  deviceA1: string;
  users: Record<Role, { id: string; phone: string }>;
}

type Role =
  'driver' | 'fleet_manager' | 'energy_ops' | 'warranty_admin' | 'cskh' | 'admin' | 'sale';

const PHONES: Record<Role, string> = {
  driver: '0911000001',
  fleet_manager: '0911000002',
  energy_ops: '0911000003',
  warranty_admin: '0911000004',
  cskh: '0911000005',
  admin: '0911000006',
  sale: '0911000007',
};

/** Xóa sạch dữ liệu test cũ trong g3_test (KHÔNG bao giờ chạy trên DB g3 dùng chung). */
export async function resetWorld(db: pg.Client): Promise<void> {
  await db.query(`TRUNCATE audit_logs, auth_otp_challenges RESTART IDENTITY`);
  await db.query(`DELETE FROM payment_transactions`);
  // violations tham chiếu charging_sessions + charging_policies → xóa trước cả hai.
  // Cả hai bảng đều có trigger chặn UPDATE/DELETE (NF-11, F-B1): tắt trong lúc dọn dữ liệu
  // test rồi bật lại NGAY — không có đường nào khác để reset một bảng append-only.
  await db.query(`ALTER TABLE violations DISABLE TRIGGER violations_append_only`);
  await db.query(`DELETE FROM violations`);
  await db.query(`ALTER TABLE violations ENABLE TRIGGER violations_append_only`);
  // violation_checks (F-B3) cũng trỏ tới charging_policies → xóa trước chính sách
  await db.query(`DELETE FROM violation_checks`);
  await db.query(`ALTER TABLE charging_policies DISABLE TRIGGER charging_policies_khong_sua_de`);
  await db.query(`DELETE FROM charging_policies`);
  await db.query(`ALTER TABLE charging_policies ENABLE TRIGGER charging_policies_khong_sua_de`);
  // reconciliation_results tham chiếu charging_sessions → phải xóa trước
  await db.query(`DELETE FROM reconciliation_results`);
  await db.query(`ALTER TABLE charging_sessions DISABLE TRIGGER charging_sessions_append_only`);
  await db.query(`DELETE FROM charging_sessions`);
  await db.query(`ALTER TABLE charging_sessions ENABLE TRIGGER charging_sessions_append_only`);
  await db.query(`DELETE FROM ocpp_transactions`);
  await db.query(`DELETE FROM telematics_readings`);
  // notifications tham chiếu users/alerts/tickets → phải xóa trước cả ba (F-F3)
  await db.query(`DELETE FROM notifications`);
  await db.query(`DELETE FROM push_tokens`);
  await db.query(`DELETE FROM alerts`);
  await db.query(`DELETE FROM tickets`);
  await db.query(`DELETE FROM devices`);
  await db.query(`DELETE FROM batteries`);
  await db.query(`UPDATE vehicles SET assigned_driver_id = NULL`);
  await db.query(`DELETE FROM drivers`);
  await db.query(`DELETE FROM connectors`);
  await db.query(`DELETE FROM charging_stations`);
  await db.query(`DELETE FROM vehicles`);
  await db.query(`DELETE FROM users`);
  await db.query(`DELETE FROM customers`);
}

export async function seedWorld(db: pg.Client): Promise<TestWorld> {
  await resetWorld(db);

  const one = async (sql: string, params: unknown[] = []): Promise<string> => {
    const res = await db.query<{ id: string }>(sql, params);
    return res.rows[0]!.id;
  };

  const customerAId = await one(
    `INSERT INTO customers (name, contract_no) VALUES ('Đội A (GIẢ)', 'HD-TEST-A') RETURNING id`,
  );
  const customerBId = await one(
    `INSERT INTO customers (name, contract_no) VALUES ('Đội B (GIẢ)', 'HD-TEST-B') RETURNING id`,
  );

  const users = {} as TestWorld['users'];
  for (const role of Object.keys(PHONES) as Role[]) {
    // fleet_manager và driver thuộc đội A; vai trò nội bộ G3/Holding không gắn khách hàng
    const customerId = role === 'driver' || role === 'fleet_manager' ? customerAId : null;
    const id = await one(
      `INSERT INTO users (email, full_name, role, customer_id, phone)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [`${role}@test.local`, `Người dùng ${role} (GIẢ)`, role, customerId, PHONES[role]],
    );
    users[role] = { id, phone: PHONES[role] };
  }

  const driverId = await one(
    `INSERT INTO drivers (user_id, phone, consent_at, consent_version)
     VALUES ($1, $2, now(), 'v1.0') RETURNING id`,
    [users.driver.id, PHONES.driver],
  );

  const vehicleA1 = await one(
    `INSERT INTO vehicles (vin, model, customer_id, assigned_driver_id)
     VALUES ('G3-TEST-A1', 'EVT-262', $1, $2) RETURNING id`,
    [customerAId, driverId],
  );
  const vehicleA2 = await one(
    `INSERT INTO vehicles (vin, model, customer_id) VALUES ('G3-TEST-A2', 'EVT-400', $1) RETURNING id`,
    [customerAId],
  );
  const vehicleB1 = await one(
    `INSERT INTO vehicles (vin, model, customer_id) VALUES ('G3-TEST-B1', 'EVT-825', $1) RETURNING id`,
    [customerBId],
  );

  const deviceA1 = await one(
    `INSERT INTO devices (device_serial, vehicle_id, firmware_version, last_seen_at)
     VALUES ('G3-TEST-DEV-A1', $1, '1.0.0-sim', now()) RETURNING id`,
    [vehicleA1],
  );
  await db.query(
    `INSERT INTO batteries (pack_id, vehicle_id, capacity_kwh, soh_pct)
     VALUES ('G3-TEST-PACK-A1', $1, 105, 98)`,
    [vehicleA1],
  );

  const stationId = await one(
    `INSERT INTO charging_stations (code, name, location, area, total_power_kw)
     VALUES ('G3-TEST-ST-01', 'Trạm test (GIẢ)',
             ST_SetSRID(ST_MakePoint(106.7, 10.8), 4326)::geography, 'TP.HCM — Test', 480)
     RETURNING id`,
  );
  const connectorId = await one(
    `INSERT INTO connectors (station_id, ocpp_connector_id, max_power_kw)
     VALUES ($1, 1, 120) RETURNING id`,
    [stationId],
  );

  return {
    customerAId,
    customerBId,
    vehicleA1,
    vehicleA2,
    vehicleB1,
    stationId,
    connectorId,
    deviceA1,
    users,
  };
}

/** Tạo 1 phiên sạc (append-only — chỉ INSERT) và trả về id. */
export async function taoPhienSac(
  db: pg.Client,
  w: TestWorld,
  opts: {
    vehicleId?: string;
    startMs: number;
    endMs: number;
    energyKwh: number;
    socStartPct?: number;
    socEndPct?: number;
    ocppTxId?: string;
  },
): Promise<string> {
  const res = await db.query<{ id: string }>(
    `INSERT INTO charging_sessions
       (vehicle_id, station_id, connector_id, ocpp_transaction_id, started_at, ended_at,
        energy_kwh, soc_start_pct, soc_end_pct)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      opts.vehicleId ?? w.vehicleA1,
      w.stationId,
      w.connectorId,
      opts.ocppTxId ?? `TEST-${String(opts.startMs)}`,
      new Date(opts.startMs).toISOString(),
      new Date(opts.endMs).toISOString(),
      opts.energyKwh,
      opts.socStartPct ?? null,
      opts.socEndPct ?? null,
    ],
  );
  return res.rows[0]!.id;
}

/** Bản ghi thanh toán GIẢ do simulator sinh (Phase 1 — chưa có cổng thật). */
export async function taoThanhToan(
  db: pg.Client,
  sessionId: string,
  amountVnd: number,
  status: 'succeeded' | 'pending' | 'failed' = 'succeeded',
): Promise<void> {
  await db.query(
    `INSERT INTO payment_transactions (session_id, method, amount_vnd, status, gateway_ref)
     VALUES ($1, 'vnpay', $2, $3, $4)`,
    [sessionId, Math.round(amountVnd), status, `SANDBOX-${sessionId.slice(0, 8)}`],
  );
}

/**
 * Bơm chuỗi bản ghi telemetry cho 1 xe: SOC đi từ socStart tới socEnd đều đặn.
 * Dùng cho cả test API lẫn test đối soát (F-C6).
 */
export async function insertTelemetry(
  db: pg.Client,
  vehicleId: string,
  opts: {
    startMs: number;
    endMs: number;
    steps: number;
    socStart: number;
    socEnd: number;
    lat?: number;
    lng?: number;
  },
): Promise<void> {
  const { startMs, endMs, steps, socStart, socEnd } = opts;
  for (let i = 0; i <= steps; i++) {
    const ratio = steps === 0 ? 0 : i / steps;
    const time = new Date(startMs + (endMs - startMs) * ratio).toISOString();
    const soc = socStart + (socEnd - socStart) * ratio;
    await db.query(
      `INSERT INTO telematics_readings
         (time, vehicle_id, schema_version, soc_pct, speed_kmh, odometer_km, position)
       VALUES ($1, $2, 1, $3, 0, 12345, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography)
       ON CONFLICT DO NOTHING`,
      [time, vehicleId, soc.toFixed(2), opts.lng ?? 106.7, opts.lat ?? 10.8],
    );
  }
}
