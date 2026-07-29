// Tạo infra/.env từ infra/.env.example nếu chưa có (chạy tự động sau npm install).
// Giá trị trong .env.example là mẫu cho local/simulator — KHÔNG phải secret thật.
//
// Riêng JWT_SECRET (F-F1): .env.example cố tình để TRỐNG (quy tắc 3 — không commit giá trị
// thật). Script này sinh khóa ngẫu nhiên vào infra/.env để máy sạch chạy được ngay,
// và bổ sung khóa cho .env cũ đã tạo từ trước khi có biến này.
import { randomBytes } from 'node:crypto';
import { appendFileSync, copyFileSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('../infra/.env.example', import.meta.url));
const dest = fileURLToPath(new URL('../infra/.env', import.meta.url));

if (!existsSync(dest) && existsSync(src)) {
  copyFileSync(src, dest);
  console.log('[setup] Đã tạo infra/.env từ infra/.env.example — đổi mật khẩu nếu cần.');
}

if (existsSync(dest)) {
  const content = readFileSync(dest, 'utf8');
  // Khớp cả trường hợp biến đã có nhưng để trống (copy thẳng từ .env.example)
  const coKhoa = /^JWT_SECRET=.+$/m.test(content);
  if (!coKhoa) {
    const khoa = randomBytes(48).toString('base64url');
    const xuongDong = content.endsWith('\n') || content === '' ? '' : '\n';
    appendFileSync(dest, `${xuongDong}JWT_SECRET=${khoa}\n`);
    console.log('[setup] Đã sinh JWT_SECRET ngẫu nhiên vào infra/.env (không commit file này).');
  }
}
