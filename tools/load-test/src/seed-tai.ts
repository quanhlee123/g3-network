// NF-04 — Nâng dữ liệu lên quy mô load test: 300 xe + 10 trạm (mốc 2026 của NF-04).
//
// KHÔNG sửa packages/db/src/seed.ts: seed thường là 20 xe / 6 trạm và nhiều test khoá con
// số đó. Đây là bản BỔ SUNG idempotent — chạy lại không tạo bản ghi trùng, và giữ nguyên
// mọi thứ seed thường đã tạo (khách hàng, tài khoản, chính sách).
//
// Dữ liệu GIẢ 100% (quy tắc 12): VIN theo dãy G3-SIM-VIN-nnnn khớp đúng cách vehicle-sim
// sinh VIN, mã trạm G3-ST-nnn khớp đúng cách ocpp-sim đặt tên.
import type pg from 'pg';

/** Dung lượng pin GIẢ theo dòng xe — xoay vòng để đội xe không đồng nhất một dòng. */
const MODELS = [
  { model: 'EVT-262', capacityKwh: 105 },
  { model: 'EVT-400', capacityKwh: 210 },
  { model: 'EVT-825', capacityKwh: 420 },
] as const;

/**
 * Trạm bổ sung cho load test, đặt dọc hành lang Hà Nội – Lạng Sơn (tuyến `bac` mặc định
 * của vehicle-sim). Toạ độ GIẢ, chỉ cần nằm trên hành lang để cảnh báo pin F-A2 gợi ý ra
 * trạm hợp lý thay vì trạm cách nghìn km (bài học D-10).
 */
const TRAM_BO_SUNG = [
  {
    code: 'G3-ST-007',
    name: 'Trạm sạc G3 Bắc Ninh (GIẢ)',
    area: 'Bắc Ninh',
    lon: 106.05,
    lat: 21.18,
  },
  {
    code: 'G3-ST-008',
    name: 'Trạm sạc G3 Kép (GIẢ)',
    area: 'Bắc Giang — Kép',
    lon: 106.35,
    lat: 21.4,
  },
  {
    code: 'G3-ST-009',
    name: 'Trạm sạc G3 Hữu Lũng (GIẢ)',
    area: 'Lạng Sơn — Hữu Lũng',
    lon: 106.55,
    lat: 21.62,
  },
  {
    code: 'G3-ST-010',
    name: 'Trạm sạc G3 Chi Lăng (GIẢ)',
    area: 'Lạng Sơn — Chi Lăng',
    lon: 106.68,
    lat: 21.75,
  },
] as const;

export interface KetQuaSeed {
  xe_da_co: number;
  xe_them_moi: number;
  tram_tong: number;
  tru_tong: number;
}

export interface TuyChonSeed {
  soXe: number;
  soTram: number;
  log?: (msg: string) => void;
}

/**
 * Nâng số xe lên `soXe` và số trạm lên `soTram`. Chỉ THÊM, không xoá gì — dữ liệu test của
 * người khác trong DB dùng chung phải còn nguyên (mục Ranh giới, CLAUDE.md).
 */
export async function seedTai(
  db: pg.Client | pg.Pool,
  { soXe, soTram, log = () => {} }: TuyChonSeed,
): Promise<KetQuaSeed> {
  const khach = await db.query<{ id: string }>(
    `SELECT id FROM customers ORDER BY created_at, id LIMIT 2`,
  );
  if (khach.rows.length === 0) {
    throw new Error('Chưa có khách hàng nào — chạy `npm run db:seed` trước khi seed tải.');
  }
  const khachIds = khach.rows.map((r) => r.id);

  const daCo = await db.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM vehicles WHERE vin LIKE 'G3-SIM-VIN-%'`,
  );
  const xeDaCo = Number(daCo.rows[0]!.n);

  let themMoi = 0;
  for (let seq = 1; seq <= soXe; seq++) {
    const n = String(seq).padStart(4, '0');
    const vin = `G3-SIM-VIN-${n}`;
    const m = MODELS[seq % MODELS.length]!;
    // Chia đôi đội để phần kiểm tra phân quyền theo đội (quy tắc 6) vẫn có ý nghĩa ở
    // quy mô 300 xe, chứ không phải cả đội dồn vào 1 khách hàng.
    const customerId = khachIds[seq % khachIds.length]!;

    const xe = await db.query<{ id: string; moi: boolean }>(
      `INSERT INTO vehicles (vin, model, customer_id, handover_date, service_plan)
       VALUES ($1, $2, $3, '2026-01-15', 'standard')
       ON CONFLICT (vin) DO UPDATE SET model = vehicles.model
       RETURNING id, (xmax = 0) AS moi`,
      [vin, m.model, customerId],
    );
    const vehicleId = xe.rows[0]!.id;
    if (xe.rows[0]!.moi) themMoi += 1;

    // Thiết bị BẮT BUỘC phải có: không có device thì ingest vẫn ghi telemetry được nhưng
    // last_seen_at không cập nhật, và F-J1 sẽ coi toàn đội là "xe im lặng".
    await db.query(
      `INSERT INTO devices (device_serial, vehicle_id, firmware_version, sim_iccid, mtls_identity, last_seen_at)
       VALUES ($1, $2, '1.0.0-sim', $3, $4, now())
       ON CONFLICT (device_serial) DO UPDATE SET vehicle_id = EXCLUDED.vehicle_id`,
      [`G3-SIM-DEV-${n}`, vehicleId, `89000000000000${n}`, `mtls-sim-${n}`],
    );
    // Pin BẮT BUỘC phải có: đối soát 3 chiều (NF-10) tính kWh phía XE từ dung lượng pack.
    await db.query(
      `INSERT INTO batteries (pack_id, vehicle_id, chemistry, capacity_kwh, soh_pct, cycle_count)
       VALUES ($1, $2, 'LFP', $3, 100, 0)
       ON CONFLICT (pack_id) DO UPDATE SET vehicle_id = EXCLUDED.vehicle_id`,
      [`G3-SIM-PACK-${n}`, vehicleId, m.capacityKwh],
    );
  }
  log(`[seed-tai] xe: đã có ${xeDaCo} → thêm mới ${themMoi}, tổng yêu cầu ${soXe}`);

  for (const t of TRAM_BO_SUNG) {
    const stt = Number(t.code.slice(-3));
    if (stt > soTram) continue;
    const tram = await db.query<{ id: string }>(
      `INSERT INTO charging_stations (code, name, location, area, total_power_kw, operating_hours)
       VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography, $5, 480, '24/7')
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [t.code, t.name, t.lon, t.lat, t.area],
    );
    for (let c = 1; c <= 4; c++) {
      await db.query(
        `INSERT INTO connectors (station_id, ocpp_connector_id, max_power_kw, standard)
         VALUES ($1, $2, 120, 'CCS2')
         ON CONFLICT (station_id, ocpp_connector_id) DO NOTHING`,
        [tram.rows[0]!.id, c],
      );
    }
  }

  const dem = await db.query<{ tram: string; tru: string }>(
    `SELECT (SELECT count(*)::text FROM charging_stations) AS tram,
            (SELECT count(*)::text FROM connectors) AS tru`,
  );
  const ket_qua: KetQuaSeed = {
    xe_da_co: xeDaCo,
    xe_them_moi: themMoi,
    tram_tong: Number(dem.rows[0]!.tram),
    tru_tong: Number(dem.rows[0]!.tru),
  };
  log(`[seed-tai] trạm: ${ket_qua.tram_tong} · trụ: ${ket_qua.tru_tong}`);
  return ket_qua;
}
