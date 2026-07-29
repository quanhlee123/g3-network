// F-A1/F-J3 — Implementation MQTT thật của TelemetryPublisher (interface ở @g3/contracts,
// quy tắc 2). Chỉ file này được đụng SDK mqtt; logic mô phỏng không import mqtt trực tiếp.
import mqtt, { type MqttClient } from 'mqtt';
import type { TelemetryPublisher, TelemetryWill } from '@g3/contracts';

export class MqttTelemetryPublisher implements TelemetryPublisher {
  #client: MqttClient | null = null;

  constructor(
    private readonly url: string,
    private readonly clientId: string,
    private readonly will?: TelemetryWill,
  ) {}

  get connected(): boolean {
    return this.#client?.connected ?? false;
  }

  async connect(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const client = mqtt.connect(this.url, {
        clientId: this.clientId,
        clean: true,
        keepalive: 15, // ngắn để broker phát LWT nhanh khi mất nguồn (F-J3)
        connectTimeout: 5_000,
        reconnectPeriod: 2_000,
        will: this.will
          ? {
              topic: this.will.topic,
              payload: Buffer.from(this.will.payload),
              qos: 1,
              retain: this.will.retain,
            }
          : undefined,
      });
      this.#client = client;
      const onError = (err: Error) => {
        client.end(true);
        reject(err);
      };
      client.once('error', onError);
      client.once('connect', () => {
        client.removeListener('error', onError);
        resolve();
      });
    });
  }

  async publish(topic: string, payload: string, opts?: { retain?: boolean }): Promise<void> {
    const client = this.#client;
    if (!client) throw new Error('Chưa kết nối MQTT — gọi connect() trước');
    await new Promise<void>((resolve, reject) => {
      client.publish(topic, payload, { qos: 1, retain: opts?.retain ?? false }, (err) =>
        err ? reject(err) : resolve(),
      );
    });
  }

  /** Tắt sạch: chờ gửi nốt hàng đợi rồi đóng (client gửi DISCONNECT cho broker). */
  async disconnect(): Promise<void> {
    const client = this.#client;
    if (!client) return;
    await client.endAsync(false);
    this.#client = null;
  }

  /**
   * Mất nguồn đột ngột (F-J3): hủy thẳng socket TCP — KHÔNG gửi gói DISCONNECT.
   * Broker thấy kết nối rớt bất thường sau ~1.5× keepalive và tự phát LWT.
   */
  destroy(): void {
    const client = this.#client;
    if (!client) return;
    // end(true) của mqtt.js đóng ngay không gửi DISCONNECT; hủy thêm stream cho chắc chắn.
    const stream = (client as unknown as { stream?: { destroy?: () => void } }).stream;
    stream?.destroy?.();
    client.end(true);
    this.#client = null;
  }
}
