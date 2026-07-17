// Khung khởi tạo (Prompt 01, chưa gắn F-xx) — giả lập trụ sạc OCPP 1.6J.
// Chạy: npm run sim:ocpp -- --stations 3
// Logic giả lập thật (WebSocket tới CSMS) được xây ở Prompt 05.
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

/** Đọc số trụ sạc cần giả lập từ tham số --stations (mặc định 1). */
export function parseStations(argv: string[]): number {
  const { values } = parseArgs({
    args: argv,
    options: { stations: { type: 'string', default: '1' } },
    allowPositionals: true,
  });
  const stations = Number(values.stations);
  if (!Number.isInteger(stations) || stations < 1) {
    throw new Error(`--stations phải là số nguyên >= 1, nhận được: "${values.stations}"`);
  }
  return stations;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const stations = parseStations(process.argv.slice(2));
  console.log(`[ocpp-sim] khung — sẽ giả lập ${stations} trụ sạc (logic thật ở Prompt 05)`);
}
