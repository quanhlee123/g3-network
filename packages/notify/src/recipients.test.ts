// F-F3 — Người nhận thông báo phải khớp ma trận sheet 9 (quy tắc 6: phạm vi 'own'/'fleet'/'all').
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDatabaseUrl } from '@g3/db';
import { timNguoiNhan } from './recipients';
import { dungTheGioi, type NotifyWorld } from './test-world';

describe('timNguoiNhan — cấu hình kênh × vai trò × phạm vi dữ liệu', () => {
  let db: pg.Client;
  let w: NotifyWorld;

  beforeAll(async () => {
    db = new pg.Client({ connectionString: testDatabaseUrl() });
    await db.connect();
    w = await dungTheGioi(db);
  });

  afterAll(async () => {
    await db.end();
  });

  it('pin yếu 30% (severity 1): CHỈ tài xế của xe đó — quản lý đội nhận từ 20% (F-A2)', async () => {
    const nn = await timNguoiNhan(db, 'battery_low', 1, w.vehicleA);
    expect(nn.map((r) => r.user_id)).toEqual([w.driverUserA]);
  });

  it('pin yếu 20% (severity 2): thêm quản lý ĐÚNG đội của xe, không lan sang đội khác', async () => {
    const nn = await timNguoiNhan(db, 'battery_low', 2, w.vehicleA);
    const ids = nn.map((r) => r.user_id);

    expect(ids).toContain(w.driverUserA);
    expect(ids).toContain(w.fleetUserA);
    expect(ids).toContain(w.adminUser);
    // Phạm vi 'fleet' và 'own' của sheet 9 — đây là phần dễ làm sai nhất
    expect(ids).not.toContain(w.fleetUserB);
    expect(ids).not.toContain(w.driverUserB);
  });

  it('kênh và địa chỉ liên lạc lấy đúng: tài xế có SĐT + token đẩy', async () => {
    const nn = await timNguoiNhan(db, 'battery_critical', 3, w.vehicleA);
    const taiXe = nn.find((r) => r.user_id === w.driverUserA);

    expect(taiXe?.channels.sort()).toEqual(['in_app', 'push', 'sms']);
    expect(taiXe?.phone).toBe(w.phoneA);
    expect(taiXe?.push_tokens).toEqual([w.tokenA]);
  });

  it('bất thường pin mức 1: quản lý đội nhận, tài xế KHÔNG (prefs đặt min_severity 3)', async () => {
    const nn = await timNguoiNhan(db, 'battery_anomaly', 1, w.vehicleA);
    const ids = nn.map((r) => r.user_id);

    expect(ids).toContain(w.fleetUserA);
    expect(ids).toContain(w.adminUser);
    expect(ids).not.toContain(w.driverUserA);
  });

  it('sự kiện KHÔNG gắn xe: chỉ vai trò nội bộ, hai vai trò phụ thuộc xe tự rỗng', async () => {
    const nn = await timNguoiNhan(db, 'device_tamper', 1, null);
    const ids = nn.map((r) => r.user_id);

    expect(ids).toContain(w.adminUser);
    expect(ids).toContain(w.cskhUser);
    expect(ids).not.toContain(w.fleetUserA);
    expect(ids).not.toContain(w.driverUserA);
  });

  it('kịch bản xấu — tài khoản bị vô hiệu hoá thì không nhận gì', async () => {
    await db.query(`UPDATE users SET is_active = false WHERE id = $1`, [w.driverUserA]);
    try {
      const nn = await timNguoiNhan(db, 'battery_low', 1, w.vehicleA);
      expect(nn).toEqual([]);
    } finally {
      await db.query(`UPDATE users SET is_active = true WHERE id = $1`, [w.driverUserA]);
    }
  });

  it('kịch bản xấu — xe không tồn tại: không nổ, chỉ còn vai trò nội bộ', async () => {
    const nn = await timNguoiNhan(db, 'battery_low', 2, '00000000-0000-0000-0000-000000000000');
    expect(nn.map((r) => r.user_id)).toEqual([w.adminUser]);
  });
});
