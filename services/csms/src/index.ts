// F-G2 — CSMS tự xây cho OCPP 1.6J qua WebSocket (tham chiếu SteVe; Q8: 1.6J trước).
// Chạy: npm run start -w services/csms (cần docker compose up + db:migrate + db:seed).
// Trụ (thật hoặc simulators/ocpp-sim) kết nối ws://localhost:${CSMS_WS_PORT}/ocpp/{maTram}.
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { databaseUrl, loadEnv } from '@g3/db';
import { OpsServer, kiemTraDb } from '@g3/observability';
import { startInternalHttp } from './http';
import { CsmsMetrics } from './metrics';
import { startOcppServer, type SessionRegistry } from './ws-server';

// Cho script demo Gate 0 dựng lại CSMS trong cùng tiến trình.
export { CsmsMetrics, NF02_MAX_SECONDS } from './metrics';
export { startInternalHttp } from './http';
export { startOcppServer, type SessionRegistry } from './ws-server';
export { CsmsStationSession } from './session';

/** Đọc cổng WebSocket CSMS từ biến môi trường (xem infra/.env.example). */
export function resolveCsmsPort(env: NodeJS.ProcessEnv): number {
  const port = Number(env.CSMS_WS_PORT ?? 9220);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`CSMS_WS_PORT không hợp lệ: "${env.CSMS_WS_PORT}"`);
  }
  return port;
}

/** Cổng HTTP nội bộ RemoteStart/RemoteStop (chuẩn bị F-H1), mặc định 9221. */
export function resolveCsmsHttpPort(env: NodeJS.ProcessEnv): number {
  const port = Number(env.CSMS_HTTP_PORT ?? 9221);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`CSMS_HTTP_PORT không hợp lệ: "${env.CSMS_HTTP_PORT}"`);
  }
  return port;
}

/** Cổng /health + /metrics của CSMS (NF-14), mặc định 9465 — cạnh 9464 của ingest. */
export function resolveCsmsMetricsPort(env: NodeJS.ProcessEnv): number {
  const port = Number(env.CSMS_METRICS_PORT ?? 9465);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`CSMS_METRICS_PORT không hợp lệ: "${env.CSMS_METRICS_PORT}"`);
  }
  return port;
}

async function main(): Promise<void> {
  loadEnv();
  const pool = new pg.Pool({ connectionString: databaseUrl(), max: 5 });
  const sessions: SessionRegistry = new Map();
  const wsPort = resolveCsmsPort(process.env);
  const httpPort = resolveCsmsHttpPort(process.env);
  const metrics = new CsmsMetrics();
  const wss = startOcppServer(wsPort, pool, sessions, { metrics });
  const httpServer = startInternalHttp(httpPort, sessions);
  // NF-14: CSMS chỉ phụ thuộc DB (trụ tự kết nối vào, không phải phụ thuộc để "khoẻ").
  const ops = new OpsServer({
    service: 'csms',
    registry: metrics.registry,
    checks: { db: kiemTraDb(pool) },
  });
  const opsPort = resolveCsmsMetricsPort(process.env);
  ops.listen(opsPort);
  console.log(
    `[csms] OCPP 1.6J WebSocket: ws://localhost:${wsPort}/ocpp/{maTram} — HTTP nội bộ (RemoteStart/Stop): http://localhost:${httpPort}/internal/* — health/metrics: http://localhost:${opsPort}/health`,
  );

  const shutdown = async (signal: string) => {
    console.log(`[csms] nhận ${signal} — tắt sạch…`);
    wss.close();
    httpServer.close();
    ops.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    console.error(`[csms] lỗi khởi động: ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  });
}
