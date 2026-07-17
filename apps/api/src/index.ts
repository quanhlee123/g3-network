// Khung khởi tạo (Prompt 01, chưa gắn F-xx) — điểm khởi động API.
// Cổng đọc từ biến môi trường API_PORT (xem infra/.env.example).
import { buildApp } from './app';

const port = Number(process.env.API_PORT ?? 3000);
const app = await buildApp();

try {
  await app.listen({ port, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
