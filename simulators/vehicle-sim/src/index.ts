// F-A1/F-A2/F-A4/F-J3 — Simulator xe tải điện: N xe gửi telemetry mỗi 10s qua MQTT (EMQX)
// lên topic g3/telemetry/{vin}. VIN GIẢ 100% (quy tắc 12). Kịch bản: normal | drain |
// offline (store-and-forward, NF-09) | temp (F-A4) | power-loss (F-J3).
// Chạy: npm run sim:vehicles -- --count 20 --scenario drain --vin-prefix TEST
// Chi tiết từng kịch bản: docs/simulators.md
import { pathToFileURL } from 'node:url';
import { parseSimArgs, type SimConfig } from './cli';
import { FleetSimulator } from './scheduler';
import { MqttTelemetryPublisher } from './mqtt-publisher';

export { parseCount, parseSimArgs, SCENARIOS, type Scenario, type SimConfig } from './cli';
export { FleetSimulator, type PublisherFactory, type FleetStats } from './scheduler';
export { createVehicle, tickVehicle, type VehicleState, type TickResult } from './vehicle';
export { StoreAndForwardBuffer } from './buffer';
export {
  buildRoute,
  buildRouteByName,
  positionAtKm,
  haversineKm,
  HANOI_LANG_SON_ROUTE,
  HCM_TAN_AN_ROUTE,
  TUYEN,
  TEN_TUYEN,
  type Route,
  type TenTuyen,
} from './route';
export { mulberry32 } from './rng';
export { MqttTelemetryPublisher } from './mqtt-publisher';

async function main(cfg: SimConfig): Promise<void> {
  const sim = new FleetSimulator(
    cfg,
    (clientId, will) => new MqttTelemetryPublisher(cfg.mqttUrl, clientId, will),
  );

  try {
    await sim.start();
  } catch (err) {
    console.error(
      `[vehicle-sim] Không kết nối được MQTT broker tại ${cfg.mqttUrl} ` +
        `(${err instanceof Error ? err.message : String(err)}).\n` +
        `  → Khởi động EMQX: docker compose -f infra/docker-compose.yml up -d emqx\n` +
        `  → Hoặc kiểm tra biến MQTT_URL / flag --mqtt-url.`,
    );
    process.exit(1);
  }

  console.log(
    `[vehicle-sim] Đã kết nối ${cfg.mqttUrl} — giả lập ${cfg.count} xe, kịch bản "${cfg.scenario}", ` +
      `chu kỳ ${cfg.intervalMs}ms, VIN ${cfg.vinPrefix}-0001…${cfg.vinPrefix}-${String(cfg.count).padStart(4, '0')}. ` +
      `Ctrl+C để dừng sạch.`,
  );

  await sim.tick(Date.now()); // tick đầu ngay lập tức, không chờ hết chu kỳ
  sim.startLoop();

  const shutdown = () => {
    console.log('\n[vehicle-sim] Đang tắt sạch (phát trạng thái offline graceful)...');
    void sim
      .stop()
      .catch(() => undefined)
      .then(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let cfg: SimConfig;
  try {
    cfg = parseSimArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`[vehicle-sim] ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
  void main(cfg);
}
