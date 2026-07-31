// F-F1 · Dựng app + database test dùng chung cho các file test của apps/api.
import pg from 'pg';
import { testDatabaseUrl } from '@g3/db';
import { ConsoleSmsSender, type INotifier } from '@g3/contracts';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { loadConfig } from '../config';

/** Khóa GIẢ chỉ dùng trong test — không phải secret thật (quy tắc 3 & 12). */
export const TEST_JWT_SECRET = 'khoa-test-g3-network-khong-phai-secret-that'; // gitleaks:allow
/** Mã OTP cố định để test không phải đọc console. */
export const TEST_OTP_CODE = '123456';

export interface Harness {
  app: FastifyInstance;
  db: pg.Client;
  sms: ConsoleSmsSender;
  close(): Promise<void>;
}

export async function createHarness(
  env: Record<string, string> = {},
  /** F-F3: tiêm MockNotifier để test khẳng định "ai được báo" mà không cần bảng prefs. */
  extra: { notifier?: INotifier } = {},
): Promise<Harness> {
  const db = new pg.Client({ connectionString: testDatabaseUrl() });
  await db.connect();
  const sms = new ConsoleSmsSender(() => {
    /* im lặng trong test */
  });
  const app = await buildApp({
    logger: false,
    config: loadConfig({ JWT_SECRET: TEST_JWT_SECRET, ...env }),
    db,
    sms,
    ...(extra.notifier ? { notifier: extra.notifier } : {}),
    otpCodeFactory: () => TEST_OTP_CODE,
  });
  await app.ready();
  return {
    app,
    db,
    sms,
    async close() {
      await app.close();
      await db.end();
    },
  };
}

/** Đăng nhập bằng OTP như người dùng thật và trả về header Authorization. */
export async function loginAs(app: FastifyInstance, phone: string): Promise<string> {
  const asked = await app.inject({
    method: 'POST',
    url: '/auth/otp/request',
    payload: { phone },
  });
  if (asked.statusCode !== 202) throw new Error(`xin OTP thất bại: ${asked.statusCode}`);

  const verified = await app.inject({
    method: 'POST',
    url: '/auth/otp/verify',
    payload: { phone, code: TEST_OTP_CODE },
  });
  if (verified.statusCode !== 200) {
    throw new Error(`đổi OTP thất bại: ${verified.statusCode} ${verified.body}`);
  }
  return `Bearer ${verified.json().access_token as string}`;
}
