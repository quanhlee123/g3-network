// F-A5 — Cảnh báo ra/vào vùng geofence. Ca bắt buộc của Prompt 7.3:
// xe sim đi XUYÊN đa giác → đúng 2 alert (vào, rồi ra).
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MockNotifier } from '@g3/contracts';
import { testDatabaseUrl } from '@g3/db';
import { GeofenceEvaluator, suyRaChuyenTiep } from './geofence';

describe('suyRaChuyenTiep — hàm thuần', () => {
  const nen = {
    geofence_id: 'g1',
    code: 'V1',
    name: 'Vùng 1',
    canh_bao_vao: true,
    canh_bao_ra: true,
  };

  it('lần đầu ghi nhận (chưa có trạng thái trước) KHÔNG phải chuyển tiếp', () => {
    expect(suyRaChuyenTiep({ ...nen, ben_trong: true, truoc: null })).toBeNull();
  });

  it('đang trong, vẫn trong → không báo', () => {
    expect(suyRaChuyenTiep({ ...nen, ben_trong: true, truoc: true })).toBeNull();
  });

  it('ngoài → trong = VÀO; trong → ngoài = RA', () => {
    expect(suyRaChuyenTiep({ ...nen, ben_trong: true, truoc: false })?.huong).toBe('vao');
    expect(suyRaChuyenTiep({ ...nen, ben_trong: false, truoc: true })?.huong).toBe('ra');
  });

  it('vùng tắt cảnh báo một chiều thì chiều đó im lặng', () => {
    const chiBaoRa = { ...nen, canh_bao_vao: false };
    expect(suyRaChuyenTiep({ ...chiBaoRa, ben_trong: true, truoc: false })).toBeNull();
    expect(suyRaChuyenTiep({ ...chiBaoRa, ben_trong: false, truoc: true })?.huong).toBe('ra');
  });
});

describe('GeofenceEvaluator (PostGIS)', () => {
  let db: pg.Client;
  let customerId: string;
  let vehicleId: string;
  let vehicleKhac: string;
  let geofenceId: string;
  let notifier: MockNotifier;

  // Ô vuông quanh (106.70–106.80, 10.75–10.85) — khu vực TP.HCM giả lập
  const VUNG = 'POLYGON((106.70 10.75, 106.80 10.75, 106.80 10.85, 106.70 10.85, 106.70 10.75))';

  const T0 = '2026-07-01T08:00:00.000Z';
  const gio = (phut: number) => new Date(Date.parse(T0) + phut * 60_000).toISOString();

  beforeAll(async () => {
    db = new pg.Client({ connectionString: testDatabaseUrl() });
    await db.connect();
    const customer = await db.query<{ id: string }>(
      `INSERT INTO customers (name, contract_no) VALUES ('KH F-A5 (GIẢ)', 'HD-FA5-001')
       ON CONFLICT (contract_no) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    );
    customerId = customer.rows[0]!.id;
    const v1 = await db.query<{ id: string }>(
      `INSERT INTO vehicles (vin, model, customer_id) VALUES ('G3-FA5-VIN-0001', 'EVT-262', $1)
       ON CONFLICT (vin) DO UPDATE SET model = EXCLUDED.model RETURNING id`,
      [customerId],
    );
    vehicleId = v1.rows[0]!.id;
    const khacKh = await db.query<{ id: string }>(
      `INSERT INTO customers (name, contract_no) VALUES ('KH F-A5 khác (GIẢ)', 'HD-FA5-002')
       ON CONFLICT (contract_no) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    );
    const v2 = await db.query<{ id: string }>(
      `INSERT INTO vehicles (vin, model, customer_id) VALUES ('G3-FA5-VIN-0002', 'EVT-400', $1)
       ON CONFLICT (vin) DO UPDATE SET model = EXCLUDED.model RETURNING id`,
      [khacKh.rows[0]!.id],
    );
    vehicleKhac = v2.rows[0]!.id;
  });

  afterAll(async () => {
    await db.end();
  });

  beforeEach(async () => {
    await db.query(`DELETE FROM alerts WHERE type = 'geofence'`);
    await db.query(`DELETE FROM geofences`);
    const g = await db.query<{ id: string }>(
      `INSERT INTO geofences (code, name, customer_id, vung)
       VALUES ('G3-FA5-VUNG-01', 'Vùng TP.HCM (GIẢ)', $1, ST_GeogFromText($2)) RETURNING id`,
      [customerId, VUNG],
    );
    geofenceId = g.rows[0]!.id;
    notifier = new MockNotifier();
  });

  const chay = () => new GeofenceEvaluator(db, () => {}, notifier);

  const layAlerts = async () => {
    const res = await db.query<{ payload: { huong: string; geofence_code: string } }>(
      `SELECT payload FROM alerts WHERE vehicle_id = $1 AND type = 'geofence'
       ORDER BY triggered_at`,
      [vehicleId],
    );
    return res.rows.map((r) => r.payload);
  };

  it('CA BẮT BUỘC — xe đi XUYÊN đa giác: đúng 2 cảnh báo, vào trước rồi ra', async () => {
    const ev = chay();
    // Tuyến đi từ tây sang đông, cắt ngang ô vuông ở vĩ độ 10.80
    const chuyen: [number, number][] = [
      [106.65, 10.8], // ngoài (tây)
      [106.68, 10.8], // ngoài
      [106.72, 10.8], // TRONG  → cảnh báo VÀO
      [106.75, 10.8], // trong
      [106.78, 10.8], // trong
      [106.85, 10.8], // ngoài (đông) → cảnh báo RA
      [106.9, 10.8], // ngoài
    ];
    for (const [i, [lng, lat]] of chuyen.entries()) {
      await ev.danhGia(vehicleId, { lat, lng }, gio(i));
    }

    const alerts = await layAlerts();
    expect(alerts.map((a) => a.huong)).toEqual(['vao', 'ra']);
    expect(alerts[0]!.geofence_code).toBe('G3-FA5-VUNG-01');
    // Người cũng phải được báo cả 2 lần
    expect(notifier.theoLoai('geofence')).toHaveLength(2);
  });

  it('xe chạy loanh quanh TRONG vùng: chỉ 1 cảnh báo vào, không spam', async () => {
    const ev = chay();
    await ev.danhGia(vehicleId, { lat: 10.8, lng: 106.65 }, gio(0)); // ngoài — ghi trạng thái
    for (let i = 0; i < 10; i += 1) {
      await ev.danhGia(vehicleId, { lat: 10.78 + i * 0.001, lng: 106.75 }, gio(i + 1));
    }

    const alerts = await layAlerts();
    expect(alerts.map((a) => a.huong)).toEqual(['vao']);
  });

  it('lần đầu thấy xe ĐANG Ở TRONG vùng: ghi trạng thái, KHÔNG báo "vừa vào"', async () => {
    const ev = chay();
    await ev.danhGia(vehicleId, { lat: 10.8, lng: 106.75 }, gio(0));

    expect(await layAlerts()).toEqual([]);
    const st = await db.query<{ ben_trong: boolean }>(
      `SELECT ben_trong FROM geofence_states WHERE geofence_id = $1 AND vehicle_id = $2`,
      [geofenceId, vehicleId],
    );
    expect(st.rows[0]!.ben_trong).toBe(true);
  });

  it('kịch bản xấu — ingest khởi động lại giữa lúc xe đang trong vùng: KHÔNG báo lại', async () => {
    const truoc = chay();
    await truoc.danhGia(vehicleId, { lat: 10.8, lng: 106.65 }, gio(0)); // ngoài
    await truoc.danhGia(vehicleId, { lat: 10.8, lng: 106.75 }, gio(1)); // vào → 1 cảnh báo
    expect(await layAlerts()).toHaveLength(1);

    // Tiến trình mới, RAM trắng — trạng thái phải đọc từ geofence_states
    const sau = chay();
    await sau.danhGia(vehicleId, { lat: 10.79, lng: 106.76 }, gio(2));
    await sau.danhGia(vehicleId, { lat: 10.78, lng: 106.77 }, gio(3));

    expect(await layAlerts()).toHaveLength(1);
  });

  it('vùng của ĐỘI KHÁC không áp cho xe này', async () => {
    const ev = chay();
    await ev.danhGia(vehicleKhac, { lat: 10.8, lng: 106.65 }, gio(0));
    await ev.danhGia(vehicleKhac, { lat: 10.8, lng: 106.75 }, gio(1));

    const res = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM alerts WHERE vehicle_id = $1 AND type = 'geofence'`,
      [vehicleKhac],
    );
    expect(res.rows[0]!.n).toBe(0);
  });

  it('vùng bị tắt (enabled = false) thì không sinh cảnh báo nào', async () => {
    await db.query(`UPDATE geofences SET enabled = false WHERE id = $1`, [geofenceId]);
    const ev = chay();
    await ev.danhGia(vehicleId, { lat: 10.8, lng: 106.65 }, gio(0));
    await ev.danhGia(vehicleId, { lat: 10.8, lng: 106.75 }, gio(1));

    expect(await layAlerts()).toEqual([]);
  });

  it('kịch bản xấu — xử lý lại đúng bản ghi đó: không sinh cảnh báo thứ hai', async () => {
    const ev = chay();
    await ev.danhGia(vehicleId, { lat: 10.8, lng: 106.65 }, gio(0));
    await ev.danhGia(vehicleId, { lat: 10.8, lng: 106.75 }, gio(1));

    // Bản ghi gửi bù về sau mất sóng, cùng thời điểm — dedup_key có ts nên chặn được
    const lai = chay();
    await lai.danhGia(vehicleId, { lat: 10.8, lng: 106.65 }, gio(0));
    await lai.danhGia(vehicleId, { lat: 10.8, lng: 106.75 }, gio(1));

    const alerts = await layAlerts();
    expect(alerts.filter((a) => a.huong === 'vao')).toHaveLength(1);
  });

  it('kịch bản xấu — bản ghi không có toạ độ: bỏ qua, không nổ', async () => {
    const ev = chay();
    await expect(ev.danhGia(vehicleId, null, gio(0))).resolves.toBe(0);
  });
});
