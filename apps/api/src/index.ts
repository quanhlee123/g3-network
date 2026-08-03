// F-F1 — Điểm khởi động API. Cấu hình & secret đọc từ biến môi trường (quy tắc 3),
// xem infra/.env.example.
import { ConsolePushSender, ConsoleSmsSender } from '@g3/contracts';
import { NotifierService } from '@g3/notify';
import { buildApp } from './app';
import { loadConfigFromEnvFile } from './config';
import { createPool } from './db';
import { batLichQuetThietBi } from './modules/devices/scheduler';
import { batLichDoiSoat } from './modules/reconciliation/scheduler';
import { batLichSla } from './modules/tickets/scheduler';
import { batLichViPham } from './modules/violations/scheduler';

const config = loadConfigFromEnvFile();
const pool = createPool();

// Notifier phải dựng TRƯỚC app (route SOS cần nó), nhưng logger lại nằm trong app —
// nên log đi qua một biến trung gian, gắn vào app.log ngay sau khi app dựng xong.
let ghiLog: (msg: string) => void = (m) => console.log(m);
// F-F3: kênh push/SMS ở Phase 1 đều là bản mock in ra console (quy tắc 2 & 12).
const notifier = new NotifierService({
  db: pool,
  push: new ConsolePushSender((m) => ghiLog(m)),
  sms: new ConsoleSmsSender((m) => ghiLog(m)),
  log: (m) => ghiLog(m),
});

const app = await buildApp({ config, db: pool, notifier });
ghiLog = (m) => app.log.info(m);

// F-C6: job đối soát 3 chiều chạy định kỳ ngay trong tiến trình API (modular monolith).
const lichDoiSoat = batLichDoiSoat(pool, config, (m) => app.log.info(m));
// F-J1/F-J3: job quét thiết bị im lặng + phân loại nghi tháo thiết bị.
const lichQuetThietBi = batLichQuetThietBi(pool, config, (m) => app.log.info(m), notifier);
// F-I2: đồng hồ SLA — ticket quá hạn chưa ai nhận thì leo thang.
const lichSla = batLichSla(pool, config, (m) => app.log.info(m), notifier);
// F-B3/F-B5: đối chiếu phiên sạc với chính sách, gắn cờ vi phạm và báo cho tài xế/chủ xe.
const lichViPham = batLichViPham(pool, config, (m) => app.log.info(m), notifier);

const shutdown = async (signal: string): Promise<void> => {
  app.log.info(`nhận ${signal} — tắt sạch…`);
  lichDoiSoat.dung();
  lichQuetThietBi.dung();
  lichSla.dung();
  lichViPham.dung();
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info(`Tài liệu OpenAPI: http://localhost:${config.port}/docs`);
} catch (err) {
  app.log.error(err);
  await pool.end();
  process.exit(1);
}
