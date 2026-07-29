// F-G1 — Implementation MQTT thật của ITelematicsSource (interface ở @g3/contracts,
// quy tắc 2). Chỉ file này được đụng SDK mqtt; pipeline không import mqtt trực tiếp.
// Subscribe wildcard g3/telemetry/+ và g3/status/+ (QoS 1 khớp publisher vehicle-sim).
import mqtt, { type MqttClient } from 'mqtt';
import {
  STATUS_TOPIC_PREFIX,
  TELEMETRY_TOPIC_PREFIX,
  type ITelematicsSource,
  type TelematicsHandler,
} from '@g3/contracts';

export class MqttTelematicsSource implements ITelematicsSource {
  #client: MqttClient | null = null;
  #handlers: TelematicsHandler[] = [];

  constructor(
    private readonly url: string,
    private readonly clientId: string = `g3-ingest-${process.pid}`,
  ) {}

  get connected(): boolean {
    return this.#client?.connected ?? false;
  }

  subscribe(handler: TelematicsHandler): void {
    this.#handlers.push(handler);
  }

  async connect(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const client = mqtt.connect(this.url, {
        clientId: this.clientId,
        clean: true,
        connectTimeout: 5_000,
        reconnectPeriod: 2_000,
      });
      this.#client = client;

      client.on('message', (topic, payload) => {
        const msg = { topic, payload: payload.toString('utf8'), receivedAtMs: Date.now() };
        for (const handler of this.#handlers) {
          // Lỗi xử lý 1 bản tin không được giết vòng nhận (NF-03: ingest là luồng ưu tiên)
          Promise.resolve(handler(msg)).catch((err: unknown) => {
            console.error(
              `[ingest] lỗi xử lý bản tin từ "${topic}": ${err instanceof Error ? err.message : String(err)}`,
            );
          });
        }
      });

      const onError = (err: Error) => {
        client.end(true);
        reject(err);
      };
      client.once('error', onError);
      client.once('connect', () => {
        client.removeListener('error', onError);
        client.subscribe(
          [`${TELEMETRY_TOPIC_PREFIX}+`, `${STATUS_TOPIC_PREFIX}+`],
          { qos: 1 },
          (err) => (err ? reject(err) : resolve()),
        );
      });
    });
  }

  async disconnect(): Promise<void> {
    const client = this.#client;
    if (!client) return;
    await client.endAsync(false);
    this.#client = null;
  }
}
