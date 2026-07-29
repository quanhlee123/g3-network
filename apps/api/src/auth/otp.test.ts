// F-F1 — Đăng nhập OTP: luồng chính + các kịch bản xấu (DoD: ít nhất 2 kịch bản xấu).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, TEST_OTP_CODE, type Harness } from '../test/app-harness';
import { seedWorld, type TestWorld } from '../test/world';
import { normalizePhone } from './otp';

let h: Harness;
let w: TestWorld;

beforeAll(async () => {
  h = await createHarness({ OTP_MAX_ATTEMPTS: '3', OTP_TTL_SECONDS: '300' });
  w = await seedWorld(h.db);
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.db.query('TRUNCATE auth_otp_challenges RESTART IDENTITY');
});

const xinMa = (phone: string) =>
  h.app.inject({ method: 'POST', url: '/auth/otp/request', payload: { phone } });
const doiMa = (phone: string, code: string) =>
  h.app.inject({ method: 'POST', url: '/auth/otp/verify', payload: { phone, code } });

describe('normalizePhone', () => {
  it('quy các cách viết SĐT Việt Nam về cùng một dạng', () => {
    expect(normalizePhone('0911 000 001')).toBe('0911000001');
    expect(normalizePhone('+84911000001')).toBe('0911000001');
    expect(normalizePhone('84911000001')).toBe('0911000001');
    expect(normalizePhone('0911-000-001')).toBe('0911000001');
  });
});

describe('F-F1 — luồng đăng nhập OTP', () => {
  it('xin mã → mã đi qua ISmsSender → đổi lấy token dùng được', async () => {
    const phone = w.users.fleet_manager.phone;

    const asked = await xinMa(phone);
    expect(asked.statusCode).toBe(202);
    expect(h.sms.lastTo(phone)?.kind).toBe('otp');
    expect(h.sms.lastTo(phone)?.body).toContain(TEST_OTP_CODE);

    const verified = await doiMa(phone, TEST_OTP_CODE);
    expect(verified.statusCode).toBe(200);
    expect(verified.json().token_type).toBe('Bearer');
    expect(verified.json().expires_in).toBeGreaterThan(0);
    expect(verified.json().user.role).toBe('fleet_manager');

    const me = await h.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${verified.json().access_token as string}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().role).toBe('fleet_manager');
    expect(me.json().permissions.map((p: { permission: string }) => p.permission)).toContain(
      'device_health.read',
    );
  });

  it('DB chỉ lưu BĂM của mã, không lưu mã thô', async () => {
    await xinMa(w.users.driver.phone);

    const res = await h.db.query<{ code_hash: string }>(
      `SELECT code_hash FROM auth_otp_challenges`,
    );
    expect(res.rows[0]!.code_hash).not.toContain(TEST_OTP_CODE);
    expect(res.rows[0]!.code_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('SĐT viết kiểu +84 vẫn đăng nhập được đúng tài khoản', async () => {
    const phone = w.users.admin.phone; // 0911000006
    await xinMa(`+84${phone.slice(1)}`);

    const verified = await doiMa(phone, TEST_OTP_CODE);
    expect(verified.statusCode).toBe(200);
    expect(verified.json().user.role).toBe('admin');
  });

  it('mã dùng 1 lần: đổi lần thứ hai bị từ chối', async () => {
    const phone = w.users.driver.phone;
    await xinMa(phone);

    expect((await doiMa(phone, TEST_OTP_CODE)).statusCode).toBe(200);
    const lanHai = await doiMa(phone, TEST_OTP_CODE);
    expect(lanHai.statusCode).toBe(401);
    expect(lanHai.json().error.code).toBe('ma_khong_dung');
  });
});

describe('F-F1 — kịch bản xấu', () => {
  it('mã sai → 401, và sai quá OTP_MAX_ATTEMPTS lần thì mã bị khóa', async () => {
    const phone = w.users.driver.phone;
    await xinMa(phone);

    for (let i = 0; i < 3; i++) {
      const res = await doiMa(phone, '000000');
      expect(res.json().error.code).toBe('ma_khong_dung');
    }
    // Lần thứ 4: mã đã bị khóa, kể cả nhập ĐÚNG cũng không vào được
    const res = await doiMa(phone, TEST_OTP_CODE);
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('qua_so_lan');
  });

  it('mã hết hạn → 401 ma_het_han', async () => {
    const phone = w.users.driver.phone;
    await xinMa(phone);
    await h.db.query(`UPDATE auth_otp_challenges SET expires_at = now() - interval '1 minute'`);

    const res = await doiMa(phone, TEST_OTP_CODE);
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('ma_het_han');
  });

  it('SĐT không có tài khoản: vẫn trả 202 (không dò được tài khoản), không gửi SMS', async () => {
    const truoc = h.sms.sent.length;

    const asked = await xinMa('0988888888');
    expect(asked.statusCode).toBe(202);
    expect(h.sms.sent.length).toBe(truoc);

    // …và mã "đoán trúng" cũng không đăng nhập được
    const res = await doiMa('0988888888', TEST_OTP_CODE);
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('ma_khong_dung');
  });

  it('SĐT sai định dạng → 400', async () => {
    const res = await xinMa('khong-phai-so');
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('sdt_khong_hop_le');
  });

  it('tài khoản bị khóa sau khi xin mã → không đổi được token', async () => {
    const phone = w.users.warranty_admin.phone;
    await xinMa(phone);
    await h.db.query(`UPDATE users SET is_active = false WHERE id = $1`, [
      w.users.warranty_admin.id,
    ]);

    const res = await doiMa(phone, TEST_OTP_CODE);
    await h.db.query(`UPDATE users SET is_active = true WHERE id = $1`, [
      w.users.warranty_admin.id,
    ]);

    expect(res.statusCode).toBe(401);
  });
});
