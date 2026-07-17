// Khung khởi tạo (Prompt 01, chưa gắn F-xx) — giả lập xe tải điện.
// Chạy: npm run sim:vehicles -- --count 20
// Logic giả lập thật (telemetry MQTT, VIN GIẢ 100%) được xây ở Prompt 04.
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

/** Đọc số xe cần giả lập từ tham số --count (mặc định 1). */
export function parseCount(argv: string[]): number {
  const { values } = parseArgs({
    args: argv,
    options: { count: { type: 'string', default: '1' } },
    allowPositionals: true,
  });
  const count = Number(values.count);
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`--count phải là số nguyên >= 1, nhận được: "${values.count}"`);
  }
  return count;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const count = parseCount(process.argv.slice(2));
  console.log(`[vehicle-sim] khung — sẽ giả lập ${count} xe (logic thật ở Prompt 04)`);
}
