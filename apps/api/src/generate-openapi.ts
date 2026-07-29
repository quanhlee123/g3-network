// Sinh đặc tả OpenAPI ra apps/api/openapi.json — chạy: npm run openapi:generate
// Bắt buộc chạy lại sau mỗi thay đổi API (quy tắc 11, CLAUDE.md).
// Chỉ dựng app trong bộ nhớ để đọc schema: KHÔNG cần database, KHÔNG cần secret thật.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app';
import { loadConfig } from './config';
import type { Queryable } from './db';

// Chuỗi cố định, công khai, chỉ để @fastify/jwt khởi tạo được — không ký token nào.
const KHOA_GIA = 'openapi-generate-khong-phai-secret-that'; // gitleaks:allow

const dbGia: Queryable = {
  query: () => Promise.resolve({ rows: [], rowCount: 0 }),
};

const app = await buildApp({
  logger: false,
  config: loadConfig({ JWT_SECRET: KHOA_GIA }),
  db: dbGia,
});
await app.ready();

const outPath = fileURLToPath(new URL('../openapi.json', import.meta.url));
writeFileSync(outPath, `${JSON.stringify(app.swagger(), null, 2)}\n`);
await app.close();

console.log(`Đã sinh ${outPath}`);
