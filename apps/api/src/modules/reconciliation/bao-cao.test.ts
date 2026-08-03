// F-C6 — Báo cáo sản lượng kWh theo khách/phiên + báo cáo lệch theo ngày.
//
// Ca quan trọng nhất trong file này là ca "lệch hệ thống": mọi phiên lệch 0,9% — DƯỚI ngưỡng
// nên không phiên nào bị gắn cờ — nhưng cùng một chiều, cộng cả ngày thành khoản tiền thật.
// Báo cáo theo từng phiên của Prompt 06 mù hoàn toàn với loại sai lệch này.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, loginAs, type Harness } from '../../test/app-harness';
import {
  insertTelemetry,
  seedWorld,
  taoPhienSac,
  taoThanhToan,
  type TestWorld,
} from '../../test/world';
import { baoCaoLechTheoNgay, sanLuongTheoKhach } from './bao-cao';
import { chayDoiSoat, RECONCILE_DEFAULTS } from './reconcile';

let h: Harness;
let w: TestWorld;

const GIA = RECONCILE_DEFAULTS.giaVndMoiKwh; // 3500 VNĐ/kWh (giá GIẢ)

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  w = await seedWorld(h.db);
  await h.db.query(
    `INSERT INTO batteries (pack_id, vehicle_id, capacity_kwh, soh_pct)
     VALUES ('G3-TEST-PACK-B1', $1, 105, 98)`,
    [w.vehicleB1],
  );
});

/** Một phiên "sạch": trụ = xe = tiền. */
async function phienKhop(opts: {
  vehicleId: string;
  ngay: string;
  gioBatDau: number;
  kwh: number;
  /** Nhân vào số tiền để tạo lệch có chủ ý (1 = khớp). */
  heSoTien?: number;
}): Promise<string> {
  const start = Date.parse(`${opts.ngay}T${String(opts.gioBatDau).padStart(2, '0')}:00:00Z`);
  const end = start + 3600_000;
  const socStart = 30;
  const socEnd = socStart + (opts.kwh / 105) * 100;

  const sid = await taoPhienSac(h.db, w, {
    vehicleId: opts.vehicleId,
    startMs: start,
    endMs: end,
    energyKwh: opts.kwh,
    socStartPct: socStart,
    socEndPct: socEnd,
    ocppTxId: `TX-${opts.ngay}-${opts.gioBatDau}-${opts.vehicleId.slice(0, 4)}`,
  });
  await insertTelemetry(h.db, opts.vehicleId, {
    startMs: start,
    endMs: end,
    steps: 4,
    socStart,
    socEnd,
  });
  await taoThanhToan(h.db, sid, opts.kwh * GIA * (opts.heSoTien ?? 1));
  return sid;
}

describe('F-C6 — sản lượng kWh theo khách hàng', () => {
  it('gom đúng theo đội xe, kèm số phiên và số xe', async () => {
    await phienKhop({ vehicleId: w.vehicleA1, ngay: '2026-06-10', gioBatDau: 2, kwh: 40 });
    await phienKhop({ vehicleId: w.vehicleA2, ngay: '2026-06-10', gioBatDau: 5, kwh: 60 });
    await phienKhop({ vehicleId: w.vehicleB1, ngay: '2026-06-10', gioBatDau: 8, kwh: 30 });

    const bao = await sanLuongTheoKhach(h.db, {});

    expect(bao.tong_kwh).toBe(130);
    expect(bao.tong_phien).toBe(3);
    const doiA = bao.theo_khach.find((d) => d.customer_id === w.customerAId)!;
    expect(doiA.kwh).toBe(100);
    expect(doiA.so_phien).toBe(2);
    expect(doiA.so_xe).toBe(2);
    expect(doiA.so_tien_vnd).toBe(100 * GIA);
  });

  it('số tiền lấy từ giao dịch THÀNH CÔNG, không tính giao dịch pending', async () => {
    // Đây chính là chỗ báo cáo doanh thu dễ thổi phồng: đếm cả tiền chưa vào tài khoản.
    const sid = await phienKhop({
      vehicleId: w.vehicleA1,
      ngay: '2026-06-10',
      gioBatDau: 2,
      kwh: 40,
    });
    await taoThanhToan(h.db, sid, 999_000, 'pending');

    const bao = await sanLuongTheoKhach(h.db, {});

    expect(bao.tong_tien_vnd).toBe(40 * GIA);
  });

  it('lọc theo kỳ: phiên ngoài khoảng không được tính', async () => {
    await phienKhop({ vehicleId: w.vehicleA1, ngay: '2026-06-10', gioBatDau: 2, kwh: 40 });
    await phienKhop({ vehicleId: w.vehicleA1, ngay: '2026-07-10', gioBatDau: 2, kwh: 55 });

    const bao = await sanLuongTheoKhach(h.db, {
      tuNgay: '2026-07-01T00:00:00Z',
      denNgay: '2026-07-31T23:59:59Z',
    });

    expect(bao.tong_kwh).toBe(55);
    expect(bao.tong_phien).toBe(1);
  });

  it('phiên CHƯA ĐÓNG không vào báo cáo doanh thu', async () => {
    await h.db.query(
      `INSERT INTO charging_sessions
         (vehicle_id, station_id, connector_id, ocpp_transaction_id, started_at, ended_at, energy_kwh)
       VALUES ($1, $2, $3, 'TX-DANG-SAC', '2026-06-10T02:00:00Z', NULL, 20)`,
      [w.vehicleA1, w.stationId, w.connectorId],
    );

    const bao = await sanLuongTheoKhach(h.db, {});

    expect(bao.tong_phien).toBe(0);
    expect(bao.tong_kwh).toBe(0);
  });
});

describe('F-C6 · NF-10 — báo cáo lệch theo ngày', () => {
  const optsBaoCao = { nguongPct: 1 };

  it('ngày mọi phiên khớp → không cần xem lại', async () => {
    await phienKhop({ vehicleId: w.vehicleA1, ngay: '2026-06-10', gioBatDau: 2, kwh: 40 });
    await phienKhop({ vehicleId: w.vehicleA1, ngay: '2026-06-10', gioBatDau: 5, kwh: 50 });
    await chayDoiSoat(h.db, { ...RECONCILE_DEFAULTS });

    const bao = await baoCaoLechTheoNgay(h.db, optsBaoCao);

    expect(bao).toHaveLength(1);
    expect(bao[0]!.ngay).toBe('2026-06-10');
    expect(bao[0]!.so_phien).toBe(2);
    expect(bao[0]!.khop).toBe(2);
    expect(bao[0]!.lech).toBe(0);
    expect(bao[0]!.can_xem_lai).toBe(false);
  });

  it('một phiên lệch nặng → ngày đó cần xem lại, chỉ ra lệch lớn nhất của phiên', async () => {
    await phienKhop({ vehicleId: w.vehicleA1, ngay: '2026-06-11', gioBatDau: 2, kwh: 40 });
    await phienKhop({
      vehicleId: w.vehicleA1,
      ngay: '2026-06-11',
      gioBatDau: 5,
      kwh: 50,
      heSoTien: 1.4, // thu tiền nhiều hơn 40% so với kWh đã bán
    });
    await chayDoiSoat(h.db, { ...RECONCILE_DEFAULTS });

    const bao = await baoCaoLechTheoNgay(h.db, optsBaoCao);

    expect(bao[0]!.lech).toBe(1);
    expect(bao[0]!.khop).toBe(1);
    expect(bao[0]!.can_xem_lai).toBe(true);
    expect(bao[0]!.lech_max_phien_pct).toBeGreaterThan(30);
  });

  it('CA QUAN TRỌNG — lệch HỆ THỐNG: mọi phiên dưới ngưỡng nhưng cùng chiều', async () => {
    // 5 phiên, mỗi phiên thu dư 0,9% → không phiên nào bị gắn cờ (ngưỡng 1%), nhưng cả ngày
    // dư gần 1% trên tổng. Báo cáo theo từng phiên của Prompt 06 hoàn toàn mù với ca này;
    // đây đúng hình dạng của công tơ lệch chuẩn hoặc hệ số hiệu suất sai (ADR-007).
    for (let i = 0; i < 5; i++) {
      await phienKhop({
        vehicleId: w.vehicleA1,
        ngay: '2026-06-12',
        // Cách nhau 3 giờ: hai phiên liền kề dùng chung mốc telemetry ở ranh giới thì chiều
        // XE của phiên sau đọc nhầm SOC cuối của phiên trước, và cả ca test thành vô nghĩa.
        gioBatDau: i * 3,
        kwh: 40,
        heSoTien: 1.009,
      });
    }
    await chayDoiSoat(h.db, { ...RECONCILE_DEFAULTS });

    const bao = await baoCaoLechTheoNgay(h.db, { nguongPct: 0.5 });

    expect(bao[0]!.lech, 'không phiên nào vượt ngưỡng 1% của job đối soát').toBe(0);
    expect(bao[0]!.khop).toBe(5);
    // ...nhưng tổng ngày thì lệch, và ngưỡng báo cáo 0,5% bắt được
    expect(bao[0]!.lech_tong_pct).toBeGreaterThan(0.5);
    expect(bao[0]!.can_xem_lai, 'lệch cùng chiều cả ngày phải nổi lên').toBe(true);
  });

  it('phiên chưa chạy đối soát được đếm riêng, không lẫn vào "khớp"', async () => {
    await phienKhop({ vehicleId: w.vehicleA1, ngay: '2026-06-13', gioBatDau: 2, kwh: 40 });

    const bao = await baoCaoLechTheoNgay(h.db, optsBaoCao);

    expect(bao[0]!.chua_doi_soat).toBe(1);
    expect(bao[0]!.khop).toBe(0);
  });

  it('gom theo NGÀY KẾT THÚC phiên, không theo ngày bắt đầu', async () => {
    // Phiên 23:30 ngày 14 → kết thúc 00:30 ngày 15. Kế toán chốt sổ theo lúc điện bán xong.
    const start = Date.parse('2026-06-14T23:30:00Z');
    const sid = await taoPhienSac(h.db, w, {
      startMs: start,
      endMs: start + 3600_000,
      energyKwh: 30,
      ocppTxId: 'TX-QUA-NGAY',
    });
    await taoThanhToan(h.db, sid, 30 * GIA);

    const bao = await baoCaoLechTheoNgay(h.db, optsBaoCao);

    expect(bao).toHaveLength(1);
    expect(bao[0]!.ngay).toBe('2026-06-15');
  });
});

describe('F-C6 — API báo cáo & phạm vi vai trò', () => {
  beforeEach(async () => {
    await phienKhop({ vehicleId: w.vehicleA1, ngay: '2026-06-10', gioBatDau: 2, kwh: 40 });
    await phienKhop({ vehicleId: w.vehicleB1, ngay: '2026-06-10', gioBatDau: 5, kwh: 60 });
    await chayDoiSoat(h.db, { ...RECONCILE_DEFAULTS });
  });

  it('Vận hành Energy thấy sản lượng TOÀN HỆ', async () => {
    const token = await loginAs(h.app, w.users.energy_ops.phone);

    const res = await h.app.inject({
      method: 'GET',
      url: '/reports/kwh',
      headers: { authorization: token },
    });

    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().tong_kwh).toBe(100);
    expect(res.json().theo_khach).toHaveLength(2);
  });

  it('QL đội CHỈ thấy sản lượng đội mình (sheet 9: V\\*)', async () => {
    const token = await loginAs(h.app, w.users.fleet_manager.phone);

    const res = await h.app.inject({
      method: 'GET',
      url: '/reports/kwh?chi_tiet_phien=true',
      headers: { authorization: token },
    });

    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().tong_kwh).toBe(40);
    expect(res.json().theo_khach).toHaveLength(1);
    const phien = res.json().theo_phien as { vin: string }[];
    expect(phien).toHaveLength(1);
    expect(phien[0]!.vin).toBe('G3-TEST-A1');
  });

  it('tài xế KHÔNG có quyền xem báo cáo sản lượng (sheet 9 để "—")', async () => {
    const token = await loginAs(h.app, w.users.driver.phone);

    const res = await h.app.inject({
      method: 'GET',
      url: '/reports/kwh',
      headers: { authorization: token },
    });

    expect(res.statusCode).toBe(403);
  });

  it('GET /reconciliation/report trả báo cáo lệch theo ngày, lọc được ngày bất thường', async () => {
    const token = await loginAs(h.app, w.users.energy_ops.phone);

    const tatCa = await h.app.inject({
      method: 'GET',
      url: '/reconciliation/report',
      headers: { authorization: token },
    });
    const batThuong = await h.app.inject({
      method: 'GET',
      url: '/reconciliation/report?chi_ngay_bat_thuong=true',
      headers: { authorization: token },
    });

    expect(tatCa.statusCode, tatCa.body).toBe(200);
    expect(tatCa.json().nguong_pct).toBe(1);
    expect((tatCa.json().items as unknown[]).length).toBe(1);
    expect(tatCa.json().so_ngay_can_xem_lai).toBe(0);
    expect(batThuong.json().items).toEqual([]);
  });
});
