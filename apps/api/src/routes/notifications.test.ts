// F-F3 — Hộp thư in-app: mỗi người CHỈ thấy thông báo của mình (dữ liệu cá nhân,
// Nghị định 13/2023) và đánh dấu đã đọc được.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, loginAs, type Harness } from '../test/app-harness';
import { seedWorld, type TestWorld } from '../test/world';

describe('GET /notifications — hộp thư của tôi (F-F3)', () => {
  let h: Harness;
  let w: TestWorld;

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    w = await seedWorld(h.db);
  });

  const themThongBao = async (
    userId: string,
    opts: { title: string; channel?: string; status?: string; severity?: number } = {
      title: 'Thông báo',
    },
  ): Promise<string> => {
    const res = await h.db.query<{ id: string }>(
      `INSERT INTO notifications (user_id, channel, status, alert_type, severity, title, body)
       VALUES ($1, $2::notification_channel, $3::notification_status, 'battery_low', $4, $5, 'Nội dung (GIẢ)')
       RETURNING id`,
      [userId, opts.channel ?? 'in_app', opts.status ?? 'sent', opts.severity ?? 1, opts.title],
    );
    return res.rows[0]!.id;
  };

  it('tài xế chỉ thấy thông báo của mình, không thấy của quản lý đội', async () => {
    await themThongBao(w.users.driver.id, { title: 'Của tài xế' });
    await themThongBao(w.users.fleet_manager.id, { title: 'Của quản lý' });
    const auth = await loginAs(h.app, w.users.driver.phone);

    const res = await h.app.inject({
      method: 'GET',
      url: '/notifications',
      headers: { authorization: auth },
    });

    expect(res.statusCode).toBe(200);
    const titles = (res.json().items as { title: string }[]).map((i) => i.title);
    expect(titles).toEqual(['Của tài xế']);
  });

  it('đếm chưa đọc chỉ tính kênh in-app (push/SMS không có khái niệm "đọc")', async () => {
    await themThongBao(w.users.driver.id, { title: 'In-app', channel: 'in_app' });
    await themThongBao(w.users.driver.id, { title: 'Đẩy', channel: 'push' });
    const auth = await loginAs(h.app, w.users.driver.phone);

    const res = await h.app.inject({
      method: 'GET',
      url: '/notifications',
      headers: { authorization: auth },
    });

    expect(res.json().tong_chua_doc).toBe(1);
    expect(res.json().items).toHaveLength(2); // lịch sử gửi vẫn thấy cả 2 kênh
  });

  it('đánh dấu đã đọc, gọi lại lần hai không đổi mốc thời gian', async () => {
    const id = await themThongBao(w.users.driver.id, { title: 'Pin 30%' });
    const auth = await loginAs(h.app, w.users.driver.phone);

    const lan1 = await h.app.inject({
      method: 'POST',
      url: `/notifications/${id}/da-doc`,
      headers: { authorization: auth },
    });
    const lan2 = await h.app.inject({
      method: 'POST',
      url: `/notifications/${id}/da-doc`,
      headers: { authorization: auth },
    });

    expect(lan1.statusCode).toBe(200);
    expect(lan2.json().read_at).toBe(lan1.json().read_at);
  });

  it('kịch bản xấu — đánh dấu thông báo của NGƯỜI KHÁC: 404, không sửa được', async () => {
    const id = await themThongBao(w.users.fleet_manager.id, { title: 'Của quản lý' });
    const auth = await loginAs(h.app, w.users.driver.phone);

    const res = await h.app.inject({
      method: 'POST',
      url: `/notifications/${id}/da-doc`,
      headers: { authorization: auth },
    });

    expect(res.statusCode).toBe(404);
    const conNguyen = await h.db.query(`SELECT read_at FROM notifications WHERE id = $1`, [id]);
    expect(conNguyen.rows[0]!.read_at).toBeNull();
  });

  it('kịch bản xấu — chưa đăng nhập: 401', async () => {
    const res = await h.app.inject({ method: 'GET', url: '/notifications' });
    expect(res.statusCode).toBe(401);
  });

  it('mọi vai trò đều đọc được hộp thư của mình (kể cả vai trò nội bộ)', async () => {
    await themThongBao(w.users.energy_ops.id, { title: 'Đối soát lệch' });
    const auth = await loginAs(h.app, w.users.energy_ops.phone);

    const res = await h.app.inject({
      method: 'GET',
      url: '/notifications',
      headers: { authorization: auth },
    });

    expect(res.statusCode).toBe(200);
    expect((res.json().items as { title: string }[])[0]?.title).toBe('Đối soát lệch');
  });
});
