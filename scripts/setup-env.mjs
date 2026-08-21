// Tạo infra/.env từ infra/.env.example nếu chưa có (chạy tự động sau npm install).
// Giá trị trong .env.example là mẫu cho local/simulator — KHÔNG phải secret thật.
//
// Một số biến (JWT_SECRET của F-F1, mật khẩu Grafana của NF-14) cố tình để TRỐNG trong
// .env.example (quy tắc 3 — không commit giá trị thật). Script này sinh giá trị ngẫu nhiên
// vào infra/.env để máy sạch chạy được ngay, và bổ sung cho .env cũ tạo từ trước khi có
// biến đó. Biến chỉ là CỔNG thì không sinh ở đây: docker-compose và mã nguồn đều đã có
// giá trị mặc định, nên .env cũ vẫn chạy được không cần sửa.
import { randomBytes } from 'node:crypto';
import { appendFileSync, copyFileSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Biến bắt buộc phải có giá trị, sinh ngẫu nhiên nếu thiếu hoặc đang để trống. */
const BIEN_CAN_SINH = [
  { ten: 'JWT_SECRET', soByte: 48, mo_ta: 'khóa ký JWT (F-F1)' },
  { ten: 'GRAFANA_ADMIN_PASSWORD', soByte: 18, mo_ta: 'mật khẩu admin Grafana (NF-14)' },
];

const src = fileURLToPath(new URL('../infra/.env.example', import.meta.url));
const dest = fileURLToPath(new URL('../infra/.env', import.meta.url));

if (!existsSync(dest) && existsSync(src)) {
  copyFileSync(src, dest);
  console.log('[setup] Đã tạo infra/.env từ infra/.env.example — đổi mật khẩu nếu cần.');
}

if (existsSync(dest)) {
  for (const bien of BIEN_CAN_SINH) {
    const content = readFileSync(dest, 'utf8');
    // Khớp cả trường hợp biến đã có nhưng để TRỐNG (copy thẳng từ .env.example)
    if (new RegExp(`^${bien.ten}=.+$`, 'm').test(content)) continue;
    const giaTri = randomBytes(bien.soByte).toString('base64url');
    const xuongDong = content.endsWith('\n') || content === '' ? '' : '\n';
    appendFileSync(dest, `${xuongDong}${bien.ten}=${giaTri}\n`);
    console.log(
      `[setup] Đã sinh ${bien.ten} ngẫu nhiên vào infra/.env — ${bien.mo_ta}. Không commit file này.`,
    );
  }
}
