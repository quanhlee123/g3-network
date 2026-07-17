// Tạo infra/.env từ infra/.env.example nếu chưa có (chạy tự động sau npm install).
// Giá trị trong .env.example là mẫu cho local/simulator — KHÔNG phải secret thật.
import { copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('../infra/.env.example', import.meta.url));
const dest = fileURLToPath(new URL('../infra/.env', import.meta.url));

if (!existsSync(dest) && existsSync(src)) {
  copyFileSync(src, dest);
  console.log('[setup] Đã tạo infra/.env từ infra/.env.example — đổi mật khẩu nếu cần.');
}
