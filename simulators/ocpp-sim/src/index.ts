// F-G2 — Giả lập trụ sạc OCPP 1.6J qua WebSocket tới CSMS (Prompt 05 phần 2).
// Chạy: npm run sim:ocpp -- --stations 3 --scenario normal|faulted|disconnect
// Mã trạm khớp seed (G3-ST-001…), idTag = VIN GIẢ khớp seed (G3-SIM-VIN-0001…) — ADR-005.
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { ChargePointSim, type SimScenario } from './station-sim';
import { connectWsTransport } from './ws-transport';

// Cho test tích hợp CSMS (services/csms) dùng lại trụ ảo qua mock transport
export { ChargePointSim, type SimScenario, type StationSimOptions } from './station-sim';

/** Đọc số trụ sạc cần giả lập từ tham số --stations (mặc định 1). */
export function parseStations(argv: string[]): number {
  const { values } = parseArgs({
    args: argv,
    options: { stations: { type: 'string', default: '1' } },
    allowPositionals: true,
    strict: false,
  });
  const stations = Number(values.stations);
  if (!Number.isInteger(stations) || stations < 1) {
    throw new Error(`--stations phải là số nguyên >= 1, nhận được: "${String(values.stations)}"`);
  }
  return stations;
}

export interface OcppSimArgs {
  stations: number;
  scenario: SimScenario;
  intervalMs: number;
  sessionTicks: number;
  powerKw: number;
  csmsUrl: string;
}

export function parseOcppSimArgs(argv: string[], env: NodeJS.ProcessEnv = {}): OcppSimArgs {
  const { values } = parseArgs({
    args: argv,
    options: {
      stations: { type: 'string', default: '1' },
      scenario: { type: 'string', default: 'normal' },
      'interval-ms': { type: 'string', default: '2000' },
      'session-ticks': { type: 'string', default: '6' },
      'power-kw': { type: 'string', default: '120' },
      'csms-url': { type: 'string' },
    },
    allowPositionals: true,
  });
  const scenario = values.scenario as string;
  if (!['normal', 'faulted', 'disconnect'].includes(scenario)) {
    throw new Error(`--scenario phải là normal|faulted|disconnect, nhận được: "${scenario}"`);
  }
  const num = (name: string, raw: string, min: number): number => {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < min) {
      throw new Error(`--${name} phải là số >= ${min}, nhận được: "${raw}"`);
    }
    return n;
  };
  return {
    stations: parseStations(argv),
    scenario: scenario as SimScenario,
    intervalMs: num('interval-ms', values['interval-ms'] as string, 100),
    sessionTicks: num('session-ticks', values['session-ticks'] as string, 2),
    powerKw: num('power-kw', values['power-kw'] as string, 1),
    csmsUrl: (values['csms-url'] as string | undefined) ?? env.CSMS_URL ?? 'ws://localhost:9220',
  };
}

/** Mã trạm/idTag khớp dữ liệu seed (packages/db/src/seed.ts). */
export function stationCode(i: number): string {
  return `G3-ST-${String(i).padStart(3, '0')}`;
}
export function seedIdTag(i: number): string {
  return `G3-SIM-VIN-${String(i).padStart(4, '0')}`;
}

async function main(): Promise<void> {
  const args = parseOcppSimArgs(process.argv.slice(2), process.env);
  console.log(
    `[ocpp-sim] ${args.stations} trụ — kịch bản ${args.scenario}, CSMS ${args.csmsUrl} (Ctrl+C để dừng)`,
  );
  const sims: ChargePointSim[] = [];
  for (let i = 1; i <= args.stations; i++) {
    const code = stationCode(i);
    const sim = new ChargePointSim(() => connectWsTransport(`${args.csmsUrl}/ocpp/${code}`), {
      stationCode: code,
      idTag: seedIdTag(i),
      scenario: args.scenario,
      intervalMs: args.intervalMs,
      sessionTicks: args.sessionTicks,
      powerKw: args.powerKw,
      meterStartWh: 1_000_000 * i, // công tơ mỗi trụ một mốc khác nhau cho dễ soi
      socStartPct: 30 + i * 5,
    });
    sims.push(sim);
  }

  try {
    for (const sim of sims) await sim.connect();
  } catch (err) {
    console.error(`[ocpp-sim] ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return;
  }

  // Chạy phiên sạc song song theo kịch bản, sau đó giữ kết nối + heartbeat
  // để demo RemoteStartTransaction từ CSMS (POST /internal/remote-start).
  await Promise.allSettled(
    sims.map((sim) =>
      sim.runSession().catch((err: unknown) => {
        console.error(`[ocpp-sim] ${sim.stationCode}: ${err instanceof Error ? err.message : err}`);
      }),
    ),
  );
  console.log(
    '[ocpp-sim] các phiên kịch bản đã xong — giữ kết nối chờ RemoteStart (Ctrl+C để thoát)',
  );
  const timers = sims.map((sim) =>
    setInterval(() => {
      void sim.heartbeat().catch(() => {
        /* mất kết nối — heartbeat sau sẽ báo tiếp, không giết tiến trình */
      });
    }, sim.heartbeatIntervalS * 1_000),
  );
  process.on('SIGINT', () => {
    for (const t of timers) clearInterval(t);
    console.log('[ocpp-sim] dừng.');
    process.exit(0);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    console.error(`[ocpp-sim] lỗi: ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  });
}
