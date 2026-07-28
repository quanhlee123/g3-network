// F-G1 — Service ingest: MQTT (EMQX) → validate theo schema_version → telematics_readings.
// Chạy: npm run start -w services/ingest (cần docker compose up + db:migrate + db:seed).
// Metric NF-01 expose tại http://localhost:${INGEST_METRICS_PORT}/metrics.
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { databaseUrl, loadEnv } from '@g3/db';
import { IngestMetrics } from './metrics';
import { MqttTelematicsSource } from './mqtt-source';
import { IngestPipeline } from './pipeline';

/** Đọc URL MQTT từ biến môi trường (xem infra/.env.example), mặc định broker local. */
export function resolveMqttUrl(env: NodeJS.ProcessEnv): string {
  return env.MQTT_URL ?? 'mqtt://localhost:1883';
}

/** Cổng HTTP /metrics (NF-14), mặc định 9464 (chuẩn cộng đồng Prometheus exporter). */
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
  const pipeline = new IngestPipeline(pool, metrics);
  const source = new MqttTelematicsSource(resolveMqttUrl(process.env));

  source.subscribe((msg) => pipeline.handle(msg));
  await source.connect();
  const metricsServer = metrics.serve(resolveMetricsPort(process.env));
  console.log(
    `[ingest] đang nhận telemetry từ ${resolveMqttUrl(process.env)} — metrics: http://localhost:${resolveMetricsPort(process.env)}/metrics`,
  );

  const shutdown = async (signal: string) => {
    console.log(`[ingest] nhận ${signal} — tắt sạch…`);
    await source.disconnect();
    metricsServer.close();
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
