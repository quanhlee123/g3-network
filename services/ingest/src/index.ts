// Khung khởi tạo (Prompt 01, chưa gắn F-xx) — service nhận telemetry xe–pin từ MQTT (EMQX).
// Logic nhận & lưu telemetry thật được xây ở Prompt 05.
import { pathToFileURL } from 'node:url';
import { TELEMETRY_SCHEMA_VERSION } from '@g3/shared';

/** Đọc URL MQTT từ biến môi trường (xem infra/.env.example), mặc định broker local. */
export function resolveMqttUrl(env: NodeJS.ProcessEnv): string {
  return env.MQTT_URL ?? 'mqtt://localhost:1883';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(
    `[ingest] khung khởi động — schema_version=${TELEMETRY_SCHEMA_VERSION}, MQTT: ${resolveMqttUrl(process.env)}`,
  );
}
