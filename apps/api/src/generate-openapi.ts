// Sinh đặc tả OpenAPI ra apps/api/openapi.json — chạy: npm run openapi:generate
// Bắt buộc chạy lại sau mỗi thay đổi API (quy tắc 11, CLAUDE.md).
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app';

const app = await buildApp({ logger: false });
await app.ready();

const outPath = fileURLToPath(new URL('../openapi.json', import.meta.url));
writeFileSync(outPath, `${JSON.stringify(app.swagger(), null, 2)}\n`);
await app.close();

console.log(`Đã sinh ${outPath}`);
