// F-F2 — Test luồng kích hoạt thiết bị theo VIN, từ đầu tới TICK XANH.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, loginAs, type Harness } from '../test/app-harness';
import { seedWorld, type TestWorld } from '../test/world';

let h: Harness;
let w: TestWorld;
let auth: string;

beforeAll(async () => {
  h = await createHarness();
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  w = await seedWorld(h.db);
  auth = await loginAs(h.app, w.users.admin.phone);
});

/** Bơm MỘT bản ghi telemetry "vừa về" cho xe — mô phỏng thiết bị lên sóng lần đầu. */
async function thietBiLenSong(vehicleId: string): Promise<void> {
  await h.db.query(
    `INSERT INTO telematics_readings (time, vehicle_id, schema_version, soc_pct, speed_kmh, odometer_km, position)
     VALUES (now(), $1, 2, 88.0, 0, 12, ST_SetSRID(ST_MakePoint(106.7, 10.8), 4326)::geography)`,
    [vehicleId],
  );
}

async function batDau(vin: string) {
  return h.app.inject({
    method: 'POST',
    url: '/provisioning',
    headers: { authorization: auth },
    payload: { vin },
  });
}

describe('F-F2 — luồng kích hoạt đầy đủ', () => {
  it('KỊCH BẢN CHÍNH: quét VIN → gán thiết bị → consent → tick xanh → chốt', async () => {
    // Xe A2 chưa có thiết bị nào (seedWorld chỉ gắn thiết bị cho A1).
    const mo = await batDau('G3-TEST-A2');
    expect(mo.statusCode).toBe(201);
    const phienId = mo.json().id as string;
    expect(mo.json().buoc).toBe('chon_xe');
    expect(mo.json().vin).toBe('G3-TEST-A2');

    // --- Bước 2: gán thiết bị
    const tb = await h.app.inject({
      method: 'POST',
      url: `/provisioning/${phienId}/thiet-bi`,
      headers: { authorization: auth },
      payload: { device_serial: 'G3-TEST-DEV-MOI', firmware_version: '1.2.0-sim' },
    });
    expect(tb.statusCode).toBe(200);
    expect(tb.json().device_serial).toBe('G3-TEST-DEV-MOI');
    expect(tb.json().buoc).toBe('gan_thiet_bi');

    // --- Bước 3: consent (Q7 còn MỞ nên phải có cảnh báo pháp lý)
    const vb = await h.app.inject({
      method: 'GET',
      url: '/provisioning/consent',
      headers: { authorization: auth },
    });
    expect(vb.json().la_ban_nhap).toBe(true);
    expect(vb.json().tieu_de).toContain('[CHỜ LEGAL — Q7]');

    const driverId = (await h.db.query<{ id: string }>(`SELECT id FROM drivers LIMIT 1`)).rows[0]!
      .id;
    const cs = await h.app.inject({
      method: 'POST',
      url: `/provisioning/${phienId}/consent`,
      headers: { authorization: auth },
      payload: { driver_id: driverId, consent_version: vb.json().version },
    });
    expect(cs.statusCode).toBe(200);
    expect(cs.json().phien.consent_at).not.toBeNull();
    // Ký theo bản nháp thì API PHẢI nói rõ là chưa có giá trị pháp lý.
    expect(cs.json().canh_bao_phap_ly).toContain('CHƯA có');

    // --- Bước 4: telemetry chưa về → chưa được tick xanh
    const chua = await h.app.inject({
      method: 'GET',
      url: `/provisioning/${phienId}/telemetry`,
      headers: { authorization: auth },
    });
    expect(chua.json().da_ve).toBe(false);

    // Chưa có tick xanh thì KHÔNG chốt được.
    const chotSom = await h.app.inject({
      method: 'POST',
      url: `/provisioning/${phienId}/hoan-tat`,
      headers: { authorization: auth },
    });
    expect(chotSom.statusCode).toBe(400);
    expect(chotSom.json().error.message).toContain('chưa nhận được dữ liệu telemetry');

    // --- Thiết bị lên sóng → tick xanh
    await thietBiLenSong(w.vehicleA2);
    const roi = await h.app.inject({
      method: 'GET',
      url: `/provisioning/${phienId}/telemetry`,
      headers: { authorization: auth },
    });
    expect(roi.json().da_ve).toBe(true);
    expect(roi.json().ban_ghi_dau_at).not.toBeNull();

    // --- Chốt
    const chot = await h.app.inject({
      method: 'POST',
      url: `/provisioning/${phienId}/hoan-tat`,
      headers: { authorization: auth },
    });
    expect(chot.statusCode).toBe(200);
    expect(chot.json().status).toBe('thanh_cong');
    expect(chot.json().buoc).toBe('xong');
    expect(chot.json().ket_thuc_at).not.toBeNull();

    // Thiết bị đã thật sự gắn vào xe trong bảng devices.
    const gan = await h.db.query(
      `SELECT vehicle_id FROM devices WHERE device_serial = 'G3-TEST-DEV-MOI'`,
    );
    expect(gan.rows[0]!.vehicle_id).toBe(w.vehicleA2);
  });

  it('TICK XANH KHÔNG ĐƯỢC TÍNH dữ liệu CŨ có sẵn từ trước', async () => {
    // Đây là cách dễ nhất để tick xanh thành tick giả: xe đã chạy trước đó vẫn còn
    // telemetry trong bảng, đếm cả dữ liệu cũ thì kích hoạt nào cũng "thành công" ngay.
    await h.db.query(
      `INSERT INTO telematics_readings (time, vehicle_id, schema_version, soc_pct)
       VALUES (now() - interval '2 hours', $1, 2, 50.0)`,
      [w.vehicleA2],
    );

    const mo = await batDau('G3-TEST-A2');
    const phienId = mo.json().id as string;

    const kt = await h.app.inject({
      method: 'GET',
      url: `/provisioning/${phienId}/telemetry`,
      headers: { authorization: auth },
    });
    expect(kt.json().da_ve).toBe(false); // dữ liệu cũ KHÔNG tính

    // Bản ghi MỚI thì mới tính.
    await thietBiLenSong(w.vehicleA2);
    const kt2 = await h.app.inject({
      method: 'GET',
      url: `/provisioning/${phienId}/telemetry`,
      headers: { authorization: auth },
    });
    expect(kt2.json().da_ve).toBe(true);
  });

  it('thời gian chờ đo bằng ĐỒNG HỒ CỦA DB, không phải đồng hồ tiến trình Node', async () => {
    // Bắt được khi chạy thật: cho_telemetry_giay từng lấy Date.now() (Node) trừ đi
    // bat_dau_at (do PostgreSQL sinh). Hai đồng hồ không bảo đảm khớp — container g3-db
    // trên máy dev từng lệch ~4 giờ so với host, và một phiên vừa mở 2 phút bị ghi là
    // "chờ 14776 giây". Con số đó đi thẳng vào KPI nên sai nó là sai cả báo cáo.
    const mo = await batDau('G3-TEST-A2');
    const phienId = mo.json().id as string;

    // Đẩy mốc bắt đầu lùi đúng 30 giây THEO ĐỒNG HỒ DB.
    await h.db.query(
      `UPDATE provisioning_sessions SET bat_dau_at = now() - interval '30 seconds' WHERE id = $1`,
      [phienId],
    );
    await thietBiLenSong(w.vehicleA2);

    const kt = await h.app.inject({
      method: 'GET',
      url: `/provisioning/${phienId}/telemetry`,
      headers: { authorization: auth },
    });
    expect(kt.json().da_ve).toBe(true);
    // Khoảng hẹp quanh 30s: lệch đồng hồ Node↔DB sẽ đẩy con số ra ngoài ngay.
    expect(kt.json().cho_giay).toBeGreaterThanOrEqual(29);
    expect(kt.json().cho_giay).toBeLessThan(45);

    // Và giá trị ghi xuống DB phải khớp với giá trị vừa trả về.
    const luu = await h.db.query<{ cho_telemetry_giay: number }>(
      `SELECT cho_telemetry_giay FROM provisioning_sessions WHERE id = $1`,
      [phienId],
    );
    expect(Number(luu.rows[0]!.cho_telemetry_giay)).toBe(kt.json().cho_giay);
  });

  it('KỊCH BẢN XẤU — VIN không tồn tại (quét nhầm/gõ sai)', async () => {
    const res = await batDau('G3-KHONG-CO-XE-NAY');
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('khong_tim_thay_vin');
  });

  it('KỊCH BẢN XẤU — hai nhân viên cùng kích hoạt một xe', async () => {
    const dau = await batDau('G3-TEST-A2');
    expect(dau.statusCode).toBe(201);

    const hai = await batDau('G3-TEST-A2');
    expect(hai.statusCode).toBe(409);
    expect(hai.json().error.code).toBe('xe_dang_duoc_kich_hoat');
  });

  it('KỊCH BẢN XẤU — thiết bị đang gắn xe khác thì bị từ chối', async () => {
    const mo = await batDau('G3-TEST-A2');
    const phienId = mo.json().id as string;

    // G3-TEST-DEV-A1 đã gắn cho xe A1 trong seedWorld.
    const res = await h.app.inject({
      method: 'POST',
      url: `/provisioning/${phienId}/thiet-bi`,
      headers: { authorization: auth },
      payload: { device_serial: 'G3-TEST-DEV-A1' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('thiet_bi_da_gan_xe_khac');
  });

  it('KỊCH BẢN XẤU — mất sóng quá 60 giây thì báo quá hạn', async () => {
    const mo = await batDau('G3-TEST-A2');
    const phienId = mo.json().id as string;

    // Kéo lùi mốc bắt đầu để mô phỏng đã chờ 90 giây.
    await h.db.query(
      `UPDATE provisioning_sessions SET bat_dau_at = now() - interval '90 seconds' WHERE id = $1`,
      [phienId],
    );

    const kt = await h.app.inject({
      method: 'GET',
      url: `/provisioning/${phienId}/telemetry`,
      headers: { authorization: auth },
    });
    expect(kt.json().da_ve).toBe(false);
    expect(kt.json().qua_han).toBe(true);
    expect(kt.json().cho_giay).toBeGreaterThanOrEqual(90);
  });

  it('phiên THẤT BẠI bắt buộc có lý do và được ghi lại', async () => {
    const mo = await batDau('G3-TEST-A2');
    const phienId = mo.json().id as string;

    const res = await h.app.inject({
      method: 'POST',
      url: `/provisioning/${phienId}/that-bai`,
      headers: { authorization: auth },
      payload: { ly_do: 'Thiet bi khong len song sau 60 giay, nghi hong SIM' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('that_bai');
    expect(res.json().ly_do_that_bai).toContain('hong SIM');
  });

  it('KỊCH BẢN XẤU — vai trò khác admin không kích hoạt được (rbac-matrix R-16)', async () => {
    for (const vaiTro of ['fleet_manager', 'energy_ops', 'cskh'] as const) {
      const khac = await loginAs(h.app, w.users[vaiTro].phone);
      const res = await h.app.inject({
        method: 'POST',
        url: '/provisioning',
        headers: { authorization: khac },
        payload: { vin: 'G3-TEST-A2' },
      });
      expect(res.statusCode, `${vaiTro} phải bị chặn`).toBe(403);
    }
  });
});

describe('F-F2 — KPI tỷ lệ kích hoạt thành công (mục tiêu ≥98%)', () => {
  /** Chạy trọn một phiên tới thành công. */
  async function motPhienThanhCong(vin: string, vehicleId: string, serial: string): Promise<void> {
    const mo = await batDau(vin);
    const id = mo.json().id as string;
    await h.app.inject({
      method: 'POST',
      url: `/provisioning/${id}/thiet-bi`,
      headers: { authorization: auth },
      payload: { device_serial: serial },
    });
    const driverId = (await h.db.query<{ id: string }>(`SELECT id FROM drivers LIMIT 1`)).rows[0]!
      .id;
    await h.app.inject({
      method: 'POST',
      url: `/provisioning/${id}/consent`,
      headers: { authorization: auth },
      payload: { driver_id: driverId, consent_version: 'v0.1-cho-legal' },
    });
    await thietBiLenSong(vehicleId);
    await h.app.inject({
      method: 'GET',
      url: `/provisioning/${id}/telemetry`,
      headers: { authorization: auth },
    });
    await h.app.inject({
      method: 'POST',
      url: `/provisioning/${id}/hoan-tat`,
      headers: { authorization: auth },
    });
  }

  it('chưa có phiên nào kết thúc thì tỷ lệ là KHÔNG XÁC ĐỊNH, không phải 0%', async () => {
    // Hiện 0% ngày đầu triển khai là báo động giả — mẫu số rỗng khác hẳn "hỏng hết".
    await batDau('G3-TEST-A2');
    const res = await h.app.inject({
      method: 'GET',
      url: '/provisioning',
      headers: { authorization: auth },
    });
    expect(res.json().kpi.mau_so).toBe(0);
    expect(res.json().kpi.ty_le_pct).toBeNull();
    expect(res.json().kpi.dat_muc_tieu).toBeNull();
    expect(res.json().kpi.so_dang_lam).toBe(1);
  });

  it('tính đúng tỷ lệ và so với mục tiêu 98%', async () => {
    await motPhienThanhCong('G3-TEST-A2', w.vehicleA2, 'G3-TEST-DEV-X2');

    // Một phiên thất bại trên xe B1.
    const hong = await batDau('G3-TEST-B1');
    await h.app.inject({
      method: 'POST',
      url: `/provisioning/${hong.json().id as string}/that-bai`,
      headers: { authorization: auth },
      payload: { ly_do: 'Khong tim thay thiet bi trong hop' },
    });

    const res = await h.app.inject({
      method: 'GET',
      url: '/provisioning',
      headers: { authorization: auth },
    });
    const kpi = res.json().kpi as {
      so_thanh_cong: number;
      so_that_bai: number;
      mau_so: number;
      ty_le_pct: number;
      dat_muc_tieu: boolean;
    };
    expect(kpi.so_thanh_cong).toBe(1);
    expect(kpi.so_that_bai).toBe(1);
    expect(kpi.mau_so).toBe(2);
    expect(kpi.ty_le_pct).toBe(50);
    expect(kpi.dat_muc_tieu).toBe(false);
  });

  it('phiên HUỶ không làm hỏng KPI (quét nhầm xe rồi tự dừng)', async () => {
    await motPhienThanhCong('G3-TEST-A2', w.vehicleA2, 'G3-TEST-DEV-X3');

    const nham = await batDau('G3-TEST-B1');
    await h.app.inject({
      method: 'POST',
      url: `/provisioning/${nham.json().id as string}/that-bai`,
      headers: { authorization: auth },
      payload: { ly_do: 'Quet nham xe, dung lai', la_huy: true },
    });

    const res = await h.app.inject({
      method: 'GET',
      url: '/provisioning',
      headers: { authorization: auth },
    });
    const kpi = res.json().kpi as { mau_so: number; ty_le_pct: number; so_huy: number };
    // Huỷ KHÔNG vào mẫu số: quét nhầm xe không phải lỗi của quy trình kích hoạt.
    expect(kpi.so_huy).toBe(1);
    expect(kpi.mau_so).toBe(1);
    expect(kpi.ty_le_pct).toBe(100);
  });
});
