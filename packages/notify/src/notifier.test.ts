// F-F3 — Khung thông báo: đủ kênh, có lịch sử, rate-limit chống spam (sheet 2 bước 5),
// và nguyên tắc quan trọng nhất: một kênh hỏng KHÔNG được làm chết luồng cảnh báo an toàn.
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ConsolePushSender, ConsoleSmsSender } from '@g3/contracts';
import { testDatabaseUrl } from '@g3/db';
import { NotifierService } from './notifier';
import type { Queryable } from './recipients';
import { dungTheGioi, type NotifyWorld } from './test-world';

const RATE_LIMIT = { max: 3, windowS: 900 };

describe('NotifierService', () => {
  let db: pg.Client;
  let w: NotifyWorld;
  let push: ConsolePushSender;
  let sms: ConsoleSmsSender;
  let notifier: NotifierService;

  const imLang = () => {};

  beforeAll(async () => {
    db = new pg.Client({ connectionString: testDatabaseUrl() });
    await db.connect();
    w = await dungTheGioi(db);
  });

  afterAll(async () => {
    await db.end();
  });

  beforeEach(async () => {
    await db.query('DELETE FROM notifications');
    push = new ConsolePushSender(imLang);
    sms = new ConsoleSmsSender(imLang);
    notifier = new NotifierService({ db, push, sms, rateLimit: RATE_LIMIT, log: imLang });
  });

  const canhBaoNguyCap = () => ({
    alert_type: 'battery_critical' as const,
    severity: 3 as const,
    title: 'Pin còn 9%',
    body: 'Trạm gần nhất G3-ST-01 cách 4,2 km',
    vehicle_id: w.vehicleA,
    data: { soc_pct: 9 },
  });

  const canhBaoSom = () => ({
    alert_type: 'battery_low' as const,
    severity: 1 as const,
    title: 'Pin còn 30%',
    body: 'Nên sạc trong 60 km tới',
    vehicle_id: w.vehicleA,
  });

  const demTheoKenh = async (userId: string) => {
    const res = await db.query<{ channel: string; status: string; n: number }>(
      `SELECT channel::text, status::text, count(*)::int AS n FROM notifications
       WHERE user_id = $1 GROUP BY channel, status ORDER BY channel, status`,
      [userId],
    );
    return res.rows.map((r) => `${r.channel}/${r.status}=${r.n}`);
  };

  it('cảnh báo nguy cấp tới tài xế qua cả 3 kênh, có SMS dự phòng (F-F3)', async () => {
    const kq = await notifier.notify(canhBaoNguyCap());
    const cuaTaiXe = kq.filter((o) => o.user_id === w.driverUserA);

    expect(cuaTaiXe.map((o) => `${o.channel}/${o.status}`).sort()).toEqual([
      'in_app/sent',
      'push/sent',
      'sms/sent',
    ]);
    expect(push.lastTo(w.tokenA)?.title).toBe('Pin còn 9%');
    expect(sms.lastTo(w.phoneA)?.kind).toBe('canh_bao');
    expect(sms.lastTo(w.phoneA)?.body).toContain('Pin còn 9%');
  });

  it('mất thiết bị: admin nhận SMS qua SĐT đăng nhập (users.phone), không riêng tài xế', async () => {
    const kq = await notifier.notify({
      alert_type: 'device_tamper',
      severity: 1,
      title: 'Nghi tháo thiết bị',
      body: 'Xe G3-FF3-VIN-A mất nguồn đột ngột',
      vehicle_id: w.vehicleA,
    });

    const cuaAdmin = kq.filter((o) => o.user_id === w.adminUser);
    expect(cuaAdmin.find((o) => o.channel === 'sms')?.status).toBe('sent');
    expect(sms.lastTo(w.phoneAdmin)?.body).toContain('Nghi tháo thiết bị');
  });

  it('lịch sử gửi ghi lại mọi kênh kèm dữ liệu deep-link', async () => {
    await notifier.notify(canhBaoNguyCap());

    const res = await db.query<{ data: { soc_pct: number } | null; severity: number }>(
      `SELECT data, severity FROM notifications WHERE user_id = $1 AND channel = 'in_app'`,
      [w.driverUserA],
    );
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]!.data).toEqual({ soc_pct: 9 });
    expect(res.rows[0]!.severity).toBe(3);
  });

  it('kịch bản xấu — nhà cung cấp push chết: ghi failed, các kênh khác VẪN gửi', async () => {
    push.loi = true;

    const kq = await notifier.notify(canhBaoNguyCap());
    const cuaTaiXe = kq.filter((o) => o.user_id === w.driverUserA);

    expect(cuaTaiXe.find((o) => o.channel === 'push')?.status).toBe('failed');
    expect(cuaTaiXe.find((o) => o.channel === 'sms')?.status).toBe('sent');
    expect(cuaTaiXe.find((o) => o.channel === 'in_app')?.status).toBe('sent');
    expect(await demTheoKenh(w.driverUserA)).toContain('push/failed=1');
  });

  it('kịch bản xấu — tài xế chưa đăng ký thiết bị: push failed có lý do đọc được', async () => {
    await db.query(`UPDATE push_tokens SET revoked_at = now() WHERE token = $1`, [w.tokenA]);
    try {
      const kq = await notifier.notify(canhBaoNguyCap());
      const day = kq.find((o) => o.user_id === w.driverUserA && o.channel === 'push');

      expect(day?.status).toBe('failed');
      expect(day?.error).toBe('chua_dang_ky_thiet_bi_nhan_push');
    } finally {
      await db.query(`UPDATE push_tokens SET revoked_at = NULL WHERE token = $1`, [w.tokenA]);
    }
  });

  it('rate-limit chặn kênh chen ngang nhưng in-app luôn được ghi (không mất thông tin)', async () => {
    for (let i = 0; i < 5; i += 1) await notifier.notify(canhBaoSom());

    const theoKenh = await demTheoKenh(w.driverUserA);
    // 3 tin đẩy đầu qua, 2 tin sau bị chặn
    expect(theoKenh).toContain('push/sent=3');
    expect(theoKenh).toContain('push/suppressed=2');
    // in-app đủ 5: mở app vẫn thấy toàn bộ
    expect(theoKenh).toContain('in_app/sent=5');
    expect(push.sent).toHaveLength(3);
  });

  it('cảnh báo NGUY CẤP không bao giờ bị rate-limit chặn (ADR-008)', async () => {
    for (let i = 0; i < 5; i += 1) await notifier.notify(canhBaoNguyCap());

    const theoKenh = await demTheoKenh(w.driverUserA);
    expect(theoKenh).toContain('push/sent=5');
    expect(theoKenh).toContain('sms/sent=5');
    expect(theoKenh.some((s) => s.includes('suppressed'))).toBe(false);
  });

  it('tin bị chặn KHÔNG kéo dài cửa sổ: chỉ đếm tin đã gửi', async () => {
    // 6 lần = 3 tin gửi được + ĐÚNG 3 tin bị chặn. Con số 3 quan trọng: phải bằng hạn mức
    // mới phân biệt được hai cách đếm — với 2 tin bị chặn thì cách đếm nào cũng cho qua,
    // test sẽ xanh một cách vô nghĩa.
    for (let i = 0; i < 6; i += 1) await notifier.notify(canhBaoSom());
    // Đẩy 3 tin ĐÃ GỬI ra ngoài cửa sổ, giữ nguyên 2 tin 'suppressed' bên trong cửa sổ.
    // Nếu #vuotHanMuc đếm cả tin 'suppressed' thì lần gửi sau vẫn bị chặn — người dùng
    // có thể bị im lặng vô thời hạn.
    await db.query(
      `UPDATE notifications SET created_at = now() - interval '2 hours'
       WHERE user_id = $1 AND channel = 'push' AND status = 'sent'`,
      [w.driverUserA],
    );

    const kq = await notifier.notify(canhBaoSom());

    const day = kq.find((o) => o.user_id === w.driverUserA && o.channel === 'push');
    expect(day?.status).toBe('sent');
    expect(push.sent).toHaveLength(4); // 3 lần đầu + lần này
  });

  it('kịch bản xấu — DB hỏng: notify KHÔNG ném lỗi, trả danh sách rỗng', async () => {
    const dbHong: Queryable = {
      query: () => Promise.reject(new Error('connection terminated')),
    };
    const n = new NotifierService({ db: dbHong, push, sms, rateLimit: RATE_LIMIT, log: imLang });

    await expect(n.notify(canhBaoNguyCap())).resolves.toEqual([]);
  });

  it('kịch bản xấu — không ai được cấu hình nhận: trả rỗng, không nổ', async () => {
    // Loại alert chưa có dòng cấu hình nào (F-A5 geofence chỉ cấu hình cho QL đội & admin,
    // ở đây hỏi bằng một xe KHÔNG thuộc đội nào của họ thì vẫn còn admin) → dùng cách chắc
    // chắn hơn: tạm gỡ toàn bộ cấu hình của 1 loại rồi trả lại nguyên trạng.
    await db.query(`CREATE TEMP TABLE prefs_tam AS
                    SELECT * FROM notification_prefs WHERE alert_type = 'maintenance'`);
    await db.query(`DELETE FROM notification_prefs WHERE alert_type = 'maintenance'`);
    try {
      const kq = await notifier.notify({
        alert_type: 'maintenance',
        severity: 1,
        title: 'Nhắc bảo dưỡng',
        body: 'Xe đến hạn 10.000 km',
        vehicle_id: w.vehicleA,
      });

      expect(kq).toEqual([]);
    } finally {
      await db.query(`INSERT INTO notification_prefs SELECT * FROM prefs_tam`);
      await db.query(`DROP TABLE prefs_tam`);
    }
  });
});
