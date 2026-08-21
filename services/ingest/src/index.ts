// F-G1 — Service ingest: MQTT (EMQX) → validate theo schema_version → telematics_readings.
// Chạy: npm run start -w services/ingest (cần docker compose up + db:migrate + db:seed).
// NF-14: /health + /metrics tại http://localhost:${INGEST_METRICS_PORT} (chỉ nội bộ).
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { ConsolePushSender, ConsoleSmsSender } from '@g3/contracts';
import { databaseUrl, loadEnv } from '@g3/db';
import { NotifierService } from '@g3/notify';
import { OpsServer, kiemTraDb } from '@g3/observability';
import { IngestMetrics } from './metrics';
import { MqttTelematicsSource } from './mqtt-source';
import { IngestPipeline } from './pipeline';

// Cho script demo Gate 0 dựng lại pipeline ingest trong cùng tiến trình.
export { IngestMetrics } from './metrics';
export { MqttTelematicsSource } from './mqtt-source';
export { IngestPipeline } from './pipeline';
export { BatteryAlertEvaluator, DAC_TA_MUC, docNguongPin } from './battery-alerts';

/** Đọc URL MQTT từ biến môi trường (xem infra/.env.example), mặc định broker local. */
export function resolveMqttUrl(env: NodeJS.ProcessEnv): string {
  return env.MQTT_URL ?? 'mqtt://localhost:1883';
}

/** Cổng HTTP /health + /metrics (NF-14), mặc định 9464 (chuẩn cộng đồng Prometheus). */
export function resolveMetricsPort(env: NodeJS.ProcessEnv): number {
  const port = Number(env.INGEST_METRICS_PORT ?? 9464);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`INGEST_METRICS_PORT không hợp lệ: "${env.INGEST_METRICS_PORT}"`);
  }
  return port;
}

async function main(): Promise<void> {
  loadEnv();
  const pool = new pg.Pool({ connectionString: databaseUrl(), max: 5 });
  const metrics = new IngestMetrics();
  // F-F3: kênh push/SMS ở Phase 1 đều là bản mock in ra console (quy tắc 2 & 12).
  const notifier = new NotifierService({
    db: pool,
    push: new ConsolePushSender((m) => console.log(m)),
    sms: new ConsoleSmsSender((m) => console.log(m)),
    log: (m) => console.log(m),
  });
  // Tham số 4: log để cảnh báo pin F-A2 hiện ra console khi chạy demo.
  const pipeline = new IngestPipeline(
    pool,
    metrics,
    () => Date.now(),
    (m) => console.log(m),
    notifier,
  );
  const source = new MqttTelematicsSource(resolveMqttUrl(process.env));

  source.subscribe((msg) => pipeline.handle(msg));
  await source.connect();
  // NF-14: /health phải phản ánh CẢ HAI phụ thuộc sống còn của ingest. Broker đứt mà
  // /health vẫn xanh thì probe vô dụng — đó đúng là kịch bản "ingest gián đoạn" cần bắt.
  const ops = new OpsServer({
    service: 'ingest',
    registry: metrics.registry,
    checks: {
      db: kiemTraDb(pool),
      mqtt: () =>
        source.connected
          ? { ok: true }
          : { ok: false, chi_tiet: 'chưa/không kết nối được MQTT broker' },
    },
  });
  const opsPort = resolveMetricsPort(process.env);
  ops.listen(opsPort);
  console.log(
    `[ingest] đang nhận telemetry từ ${resolveMqttUrl(process.env)} — health: http://localhost:${opsPort}/health · metrics: http://localhost:${opsPort}/metrics`,
  );

  const shutdown = async (signal: string) => {
    console.log(`[ingest] nhận ${signal} — tắt sạch…`);
    await source.disconnect();
    ops.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    console.error(`[ingest] lỗi khởi động: ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  });
}
