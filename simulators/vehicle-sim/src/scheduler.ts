// F-A1/F-J3/NF-04/NF-09 — Điều phối đội xe giả lập: 1 vòng tick chung cho N xe (chịu 300 xe),
// 1 kết nối MQTT dùng chung; riêng kịch bản power-loss dùng kết nối riêng từng xe để gắn LWT.
// tick(nowMs) là public để test bơm thời gian giả — mô phỏng 2h mất sóng trong vài ms.
import {
  statusTopic,
  telemetryTopic,
  type TelemetryPublisher,
  type TelemetryStatus,
  type TelemetryWill,
} from '@g3/contracts';
import type { SimConfig } from './cli';
import { StoreAndForwardBuffer } from './buffer';
import { buildRoute, type Route } from './route';
import { mulberry32 } from './rng';
import { createVehicle, tickVehicle, type VehicleState } from './vehicle';

/** Factory tạo publisher — index.ts đưa MQTT thật, test đưa MockTelemetryPublisher. */
export type PublisherFactory = (clientId: string, will?: TelemetryWill) => TelemetryPublisher;

export interface FleetStats {
  published: number;
  buffered: number;
  flushed: number;
  halted: number;
  ticks: number;
}

export interface FleetVehicle {
  state: VehicleState;
  buffer: StoreAndForwardBuffer;
  /** Kịch bản power-loss: publisher riêng có LWT; các kịch bản khác dùng shared. */
  publisher: TelemetryPublisher;
  halted: boolean;
}

function statusPayload(
  vin: string,
  status: TelemetryStatus['status'],
  reason: TelemetryStatus['reason'],
  nowMs: number,
): string {
  const payload: TelemetryStatus = { vin, status, reason, ts: new Date(nowMs).toISOString() };
  return JSON.stringify(payload);
}

export class FleetSimulator {
  readonly stats: FleetStats = { published: 0, buffered: 0, flushed: 0, halted: 0, ticks: 0 };
  #vehicles: FleetVehicle[] = [];
  #sharedPublisher: TelemetryPublisher | null = null;
  #route: Route;
  #timer: NodeJS.Timeout | null = null;
  #startedAtMs = 0;

  constructor(
    private readonly cfg: SimConfig,
    private readonly publisherFor: PublisherFactory,
    private readonly clock: () => number = () => Date.now(),
    route: Route = buildRoute(),
  ) {
    this.#route = route;
  }

  get vehicles(): ReadonlyArray<Readonly<FleetVehicle>> {
    return this.#vehicles;
  }

  /** Kết nối broker + tạo N xe + phát trạng thái online (retained) cho từng VIN. */
  async start(): Promise<void> {
    const nowMs = this.clock();
    this.#startedAtMs = nowMs;
    const rand = mulberry32(this.cfg.seed);
    const perVehicleConnection = this.cfg.scenario === 'power-loss';

    if (!perVehicleConnection) {
      // Hậu tố ngẫu nhiên để 2 phiên simulator chạy song song không đá nhau khỏi broker (trùng clientId).
      this.#sharedPublisher = this.publisherFor(
        `g3-vehicle-sim-${Math.random().toString(36).slice(2, 8)}`,
      );
      await this.#sharedPublisher.connect();
    }

    for (let i = 0; i < this.cfg.count; i++) {
      const state = createVehicle(i, this.cfg, this.#route, nowMs, rand);
      let publisher: TelemetryPublisher;
      if (perVehicleConnection) {
        // LWT: broker tự phát 'offline' nếu client rớt KHÔNG gửi DISCONNECT (F-J3).
        const will: TelemetryWill = {
          topic: statusTopic(state.vin),
          payload: statusPayload(state.vin, 'offline', 'lwt', nowMs),
          retain: true,
        };
        publisher = this.publisherFor(`g3-vehicle-sim-${state.vin}`, will);
        await publisher.connect();
      } else {
        publisher = this.#sharedPublisher!;
      }
      await publisher.publish(
        statusTopic(state.vin),
        statusPayload(state.vin, 'online', 'boot', nowMs),
        { retain: true },
      );
      this.#vehicles.push({ state, buffer: new StoreAndForwardBuffer(), publisher, halted: false });
    }
  }

  /** Chạy vòng lặp thật theo intervalMs (index.ts gọi; test gọi thẳng tick()). */
  startLoop(): void {
    this.#timer = setInterval(() => {
      void this.tick(this.clock()).catch((err: unknown) => {
        console.error(
          `[vehicle-sim] lỗi trong tick: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }, this.cfg.intervalMs);
  }

  /** Tiến 1 bước mô phỏng cho toàn đội tại thời điểm nowMs (giờ thiết bị). */
  async tick(nowMs: number): Promise<void> {
    this.stats.ticks++;
    const rand = mulberry32(this.cfg.seed + this.stats.ticks);

    for (const v of this.#vehicles) {
      if (v.halted) continue;
      const result = tickVehicle(v.state, nowMs, this.cfg, this.#route, rand);
      v.state = result.state;

      if (result.action === 'halt') {
        // F-J3: cắt socket đột ngột — KHÔNG DISCONNECT, broker sẽ phát LWT sau keepalive.
        v.publisher.destroy();
        v.halted = true;
        this.stats.halted++;
        console.log(
          `[vehicle-sim] ${v.state.vin}: MẤT NGUỒN ĐỘT NGỘT — ngừng gửi, không có tin "goodbye" (kịch bản power-loss)`,
        );
        continue;
      }

      if (result.action === 'buffer' && result.record) {
        v.buffer.enqueue(result.record);
        this.stats.buffered++;
        continue;
      }

      if (result.action === 'publish' && result.record) {
        // Có sóng lại: xả toàn bộ buffer TRƯỚC (FIFO, giữ nguyên ts thiết bị — NF-09).
        if (v.buffer.size > 0) {
          const backlog = v.buffer.drain();
          for (const old of backlog) {
            await v.publisher.publish(telemetryTopic(old.vin), JSON.stringify(old));
          }
          this.stats.flushed += backlog.length;
          this.stats.published += backlog.length;
          console.log(
            `[vehicle-sim] ${v.state.vin}: có sóng lại — bù ${backlog.length} bản ghi với timestamp gốc (NF-09)`,
          );
        }
        await v.publisher.publish(telemetryTopic(result.record.vin), JSON.stringify(result.record));
        this.stats.published++;
      }
    }

    // Log tóm tắt ~mỗi phút (6 tick × 10s) phục vụ nghiệm thu 300 xe (NF-04).
    if (this.stats.ticks % 6 === 0) {
      const alive = this.#vehicles.filter((v) => !v.halted);
      const avgSoc =
        alive.length === 0 ? 0 : alive.reduce((s, v) => s + v.state.socPct, 0) / alive.length;
      const elapsedS = Math.max(1, (nowMs - this.#startedAtMs) / 1000);
      console.log(
        `[vehicle-sim] tick ${this.stats.ticks}: ${alive.length}/${this.#vehicles.length} xe online, ` +
          `SOC TB ${avgSoc.toFixed(1)}%, đã gửi ${this.stats.published} (≈${(this.stats.published / elapsedS).toFixed(1)} msg/s), ` +
          `đang đệm ${this.#vehicles.reduce((s, v) => s + v.buffer.size, 0)}`,
      );
    }
  }

  /** Tắt sạch: dừng vòng lặp, phát 'offline' graceful rồi disconnect (khác hẳn power-loss). */
  async stop(): Promise<void> {
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
    const nowMs = this.clock();
    for (const v of this.#vehicles) {
      if (v.halted || !v.publisher.connected) continue;
      await v.publisher.publish(
        statusTopic(v.state.vin),
        statusPayload(v.state.vin, 'offline', 'graceful', nowMs),
        { retain: true },
      );
    }
    const publishers = new Set(this.#vehicles.filter((v) => !v.halted).map((v) => v.publisher));
    for (const p of publishers) {
      if (p.connected) await p.disconnect();
    }
  }
}
