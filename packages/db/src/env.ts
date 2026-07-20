// F-G4 · Đọc biến môi trường DB từ infra/.env (quy tắc 3: không hardcode secret).
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** Nạp infra/.env nếu có (không ghi đè biến đã đặt sẵn trong môi trường). */
export function loadEnv(): void {
  const envFile = path.join(repoRoot, 'infra', '.env');
  if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }
}

export function databaseUrl(): string {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('Thiếu DATABASE_URL — copy infra/.env.example thành infra/.env');
  }
  return url;
}

/** URL tới database test riêng g3_test — không đụng dữ liệu DB g3 dùng chung. */
export function testDatabaseUrl(): string {
  const url = new URL(databaseUrl());
  url.pathname = '/g3_test';
  return url.toString();
}

/** Số tháng giữ dữ liệu telematics hot (NF-16), cấu hình qua TELEMETRY_RETENTION_MONTHS. */
export function retentionMonths(): number {
  loadEnv();
  const raw = process.env.TELEMETRY_RETENTION_MONTHS ?? '12';
  const months = Number.parseInt(raw, 10);
  if (!Number.isInteger(months) || months < 1) {
    throw new Error(`TELEMETRY_RETENTION_MONTHS không hợp lệ: "${raw}" (cần số nguyên ≥ 1)`);
  }
  return months;
}
