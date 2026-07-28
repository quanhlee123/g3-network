// F-G1 — Mock ITelematicsSource (quy tắc 2: mỗi interface có ≥1 mock hoạt động được).
// Test tự bơm bản tin bằng emit() — không cần broker MQTT thật.
import type { ITelematicsSource, TelematicsHandler } from '../telematics-source';

/** Nguồn telematics trong bộ nhớ: emit(topic, payload) giả lập bản tin đến từ broker. */
export class MockTelematicsSource implements ITelematicsSource {
  #handlers: TelematicsHandler[] = [];
  #connected = false;

  constructor(private readonly clock: () => number = () => Date.now()) {}

  get connected(): boolean {
    return this.#connected;
  }

  subscribe(handler: TelematicsHandler): void {
    this.#handlers.push(handler);
  }

  async connect(): Promise<void> {
    this.#connected = true;
  }

  async disconnect(): Promise<void> {
    this.#connected = false;
  }

  /** Giả lập một bản tin đến; chờ mọi handler xử lý xong (kể cả handler async). */
  async emit(topic: string, payload: string): Promise<void> {
    if (!this.#connected) {
      throw new Error(`Mock chưa kết nối — không giao được bản tin từ "${topic}"`);
    }
    const msg = { topic, payload, receivedAtMs: this.clock() };
    for (const handler of this.#handlers) {
      await handler(msg);
    }
  }
}
