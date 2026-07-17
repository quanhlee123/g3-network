// Khung khởi tạo (Prompt 01, chưa gắn F-xx) — CSMS tự xây cho OCPP 1.6J qua WebSocket
// (tham chiếu SteVe). Logic OCPP thật được xây ở Prompt 05.
import { pathToFileURL } from 'node:url';

/** Đọc cổng WebSocket CSMS từ biến môi trường (xem infra/.env.example). */
export function resolveCsmsPort(env: NodeJS.ProcessEnv): number {
  const port = Number(env.CSMS_WS_PORT ?? 9220);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`CSMS_WS_PORT không hợp lệ: "${env.CSMS_WS_PORT}"`);
  }
  return port;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(
    `[csms] khung khởi động — OCPP 1.6J WebSocket dự kiến cổng ${resolveCsmsPort(process.env)}`,
  );
}
