// F-A1 — Mock TelemetryPublisher (quy tắc 2: mỗi interface có ≥1 mock hoạt động được).
// Dùng trong unit test simulator/ingest — không cần broker MQTT thật.
import type { TelemetryPublisher, TelemetryWill } from '../telemetry';

export interface MockPublishedMessage {
  topic: string;
  payload: string;
  /** Giờ "nhận" tại publisher (giờ tường) — để test so với ts thiết bị trong payload. */
  publishedAtMs: number;
  retain: boolean;
}

/** Publisher trong bộ nhớ: ghi lại mọi bản tin, phân biệt disconnect (sạch) vs destroy (mất nguồn). */
export class MockTelemetryPublisher implements TelemetryPublisher {
  readonly published: MockPublishedMessage[] = [];
  #connected = false;
  #destroyed = false;
  #disconnectedGracefully = false;

  constructor(
    private readonly clock: () => number = () => Date.now(),
    readonly will?: TelemetryWill,
  ) {}

  get connected(): boolean {
    return this.#connected;
  }

  /** true nếu bị cắt đột ngột không "goodbye" (mô phỏng F-J3). */
  get destroyed(): boolean {
    return this.#destroyed;
  }

  /** true nếu tắt sạch qua disconnect(). */
  get disconnectedGracefully(): boolean {
    return this.#disconnectedGracefully;
  }

  async connect(): Promise<void> {
    this.#connected = true;
  }

  async publish(topic: string, payload: string, opts?: { retain?: boolean }): Promise<void> {
    if (!this.#connected) {
      throw new Error(`Mock chưa kết nối — không publish được lên "${topic}"`);
    }
    this.published.push({
      topic,
      payload,
      publishedAtMs: this.clock(),
      retain: opts?.retain ?? false,
    });
  }

  async disconnect(): Promise<void> {
    this.#connected = false;
    this.#disconnectedGracefully = true;
  }

  destroy(): void {
    // Cắt đột ngột: KHÔNG đặt cờ graceful — test phân biệt được với disconnect().
    this.#connected = false;
    this.#destroyed = true;
  }
}
