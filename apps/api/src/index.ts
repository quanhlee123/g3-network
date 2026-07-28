// F-F1 — Điểm khởi động API. Cấu hình & secret đọc từ biến môi trường (quy tắc 3),
// xem infra/.env.example.
import { buildApp } from './app';
import { loadConfigFromEnvFile } from './config';
import { createPool } from './db';

const config = loadConfigFromEnvFile();
const pool = createPool();
const app = await buildApp({ config, db: pool });

const shutdown = async (signal: string): Promise<void> => {
  app.log.info(`nhận ${signal} — tắt sạch…`);
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
