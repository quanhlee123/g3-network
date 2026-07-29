// F-C6 — Chạy TAY job đối soát 3 chiều: npm run reconcile -w apps/api [-- --lam-lai-tat-ca]
// Dùng khi điều tra sự cố hoặc trong script demo Gate 0.
import { parseArgs } from 'node:util';
import { loadConfigFromEnvFile } from './config';
import { createPool } from './db';
import { chayDoiSoat } from './modules/reconciliation/reconcile';

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    from: { type: 'string' },
    to: { type: 'string' },
    'session-id': { type: 'string' },
    'lam-lai-tat-ca': { type: 'boolean', default: false },
  },
  allowPositionals: true,
});

const config = loadConfigFromEnvFile();
const pool = createPool();
try {
  const tomTat = await chayDoiSoat(
    pool,
    {
      ...config.reconcile,
      lamLaiTatCa: values['lam-lai-tat-ca'] === true,
      log: (m) => console.log(m),
    },
    { tuNgay: values.from, denNgay: values.to, sessionId: values['session-id'] },
  );
  console.log(
    `Đối soát ${tomTat.da_xet} phiên (ngưỡng ${config.reconcile.nguongPct}%): ` +
      `${tomTat.khop} khớp · ${tomTat.lech} lệch · ${tomTat.thieu_du_lieu} thiếu dữ liệu` +
      (tomTat.loi > 0 ? ` · ${tomTat.loi} LỖI KỸ THUẬT` : ''),
  );
  // Mã thoát ≠ 0 CHỈ khi có lỗi kỹ thuật. Tìm ra phiên lệch là job làm ĐÚNG việc của nó,
  // không phải sự cố — báo bằng mã lỗi sẽ khiến cron/CI kêu nhầm chỗ.
  if (tomTat.loi > 0) process.exitCode = 1;
} finally {
  await pool.end();
}
