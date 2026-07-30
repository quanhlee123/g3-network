// F-F3 · Thế giới test cho khung thông báo — dữ liệu GIẢ 100% (quy tắc 12).
// Cố tình dựng ĐỦ hai đội xe và hai tài xế: chỉ như vậy mới kiểm tra được phạm vi
// 'own' / 'fleet' của sheet 9 (tài xế đội A không được nhận cảnh báo xe đội B).
import type pg from 'pg';

export interface NotifyWorld {
  customerA: string;
  customerB: string;
  /** Xe của đội A, đã gán tài xế A. */
  vehicleA: string;
  /** Xe của đội B, đã gán tài xế B. */
  vehicleB: string;
  driverUserA: string;
  driverUserB: string;
  fleetUserA: string;
  fleetUserB: string;
  adminUser: string;
  cskhUser: string;
  phoneA: string;
  phoneAdmin: string;
  tokenA: string;
}

const PHONE_A = '0900000091'; // dải SĐT GIẢ (quy tắc 12)
const PHONE_ADMIN = '0900000095';
const TOKEN_A = 'fcm-gia-tai-xe-a';

export async function dungTheGioi(db: pg.Client): Promise<NotifyWorld> {
  const customerA = await upsertCustomer(db, 'Đội A (GIẢ)', 'HD-FF3-A');
  const customerB = await upsertCustomer(db, 'Đội B (GIẢ)', 'HD-FF3-B');

  // SĐT đăng nhập (users.phone, migration 0013) — mọi vai trò đều có, nên SMS gửi được
  // cho cả vai trò nội bộ chứ không riêng tài xế.
  const driverUserA = await upsertUser(
    db,
    'ff3-driver-a@g3.test',
    'Tài xế A',
    'driver',
    customerA,
    PHONE_A,
  );
  const driverUserB = await upsertUser(
    db,
    'ff3-driver-b@g3.test',
    'Tài xế B',
    'driver',
    customerB,
    '0900000092',
  );
  const fleetUserA = await upsertUser(
    db,
    'ff3-fleet-a@g3.test',
    'QL đội A',
    'fleet_manager',
    customerA,
    '0900000093',
  );
  const fleetUserB = await upsertUser(
    db,
    'ff3-fleet-b@g3.test',
    'QL đội B',
    'fleet_manager',
    customerB,
    '0900000094',
  );
  const adminUser = await upsertUser(
    db,
    'ff3-admin@g3.test',
    'Admin G3',
    'admin',
    null,
    PHONE_ADMIN,
  );
  const cskhUser = await upsertUser(
    db,
    'ff3-cskh@g3.test',
    'CSKH Holding',
    'cskh',
    null,
    '0900000096',
  );

  const driverA = await upsertDriver(db, driverUserA, PHONE_A);
  const driverB = await upsertDriver(db, driverUserB, '0900000092');

  const vehicleA = await upsertVehicle(db, 'G3-FF3-VIN-A', customerA, driverA);
  const vehicleB = await upsertVehicle(db, 'G3-FF3-VIN-B', customerB, driverB);

  await db.query(
    `INSERT INTO push_tokens (user_id, token) VALUES ($1, $2)
     ON CONFLICT (token) DO UPDATE SET revoked_at = NULL`,
    [driverUserA, TOKEN_A],
  );

  return {
    customerA,
    customerB,
    vehicleA,
    vehicleB,
    driverUserA,
    driverUserB,
    fleetUserA,
    fleetUserB,
    adminUser,
    cskhUser,
    phoneA: PHONE_A,
    phoneAdmin: PHONE_ADMIN,
    tokenA: TOKEN_A,
  };
}

async function upsertCustomer(db: pg.Client, name: string, contract: string): Promise<string> {
  const res = await db.query<{ id: string }>(
    `INSERT INTO customers (name, contract_no) VALUES ($1, $2)
     ON CONFLICT (contract_no) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [name, contract],
  );
  return res.rows[0]!.id;
}

async function upsertUser(
  db: pg.Client,
  email: string,
  fullName: string,
  role: string,
  customerId: string | null,
  phone: string,
): Promise<string> {
  const res = await db.query<{ id: string }>(
    `INSERT INTO users (email, full_name, role, customer_id, phone)
     VALUES ($1, $2, $3::user_role, $4, $5)
     ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name, is_active = true,
                                       phone = EXCLUDED.phone
     RETURNING id`,
    [email, fullName, role, customerId, phone],
  );
  return res.rows[0]!.id;
}

async function upsertDriver(db: pg.Client, userId: string, phone: string): Promise<string> {
  const res = await db.query<{ id: string }>(
    `INSERT INTO drivers (user_id, phone) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET phone = EXCLUDED.phone RETURNING id`,
    [userId, phone],
  );
  return res.rows[0]!.id;
}

async function upsertVehicle(
  db: pg.Client,
  vin: string,
  customerId: string,
  driverId: string,
): Promise<string> {
  const res = await db.query<{ id: string }>(
    `INSERT INTO vehicles (vin, model, customer_id, assigned_driver_id)
     VALUES ($1, 'EVT-262', $2, $3)
     ON CONFLICT (vin) DO UPDATE SET assigned_driver_id = EXCLUDED.assigned_driver_id RETURNING id`,
    [vin, customerId, driverId],
  );
  return res.rows[0]!.id;
}
