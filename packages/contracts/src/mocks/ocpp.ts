// F-G2 — Mock IChargePointTransport (quy tắc 2): cặp transport nối nhau trong RAM,
// message giao KHÔNG đồng bộ (queueMicrotask) để mô phỏng mạng — test csms↔sim không cần ws.
import type { IChargePointTransport } from '../ocpp';

export class MockChargePointTransport implements IChargePointTransport {
  #peer: MockChargePointTransport | null = null;
  #messageHandlers: ((data: string) => void)[] = [];
  #closeHandlers: (() => void)[] = [];
  #open = true;
  /** Log mọi frame đã gửi — test soi trình tự message. */
  readonly sent: string[] = [];

  /** Nối 2 transport thành 1 "đường mạng": gửi ở đầu này → nhận ở đầu kia. */
  static link(a: MockChargePointTransport, b: MockChargePointTransport): void {
    a.#peer = b;
    b.#peer = a;
  }

  get open(): boolean {
    return this.#open;
  }

  send(data: string): void {
    if (!this.#open) throw new Error('Transport đã đóng — không gửi được');
    this.sent.push(data);
    const peer = this.#peer;
    if (peer && peer.#open) {
      queueMicrotask(() => {
        if (peer.#open) for (const h of peer.#messageHandlers) h(data);
      });
    }
  }

  onMessage(handler: (data: string) => void): void {
    this.#messageHandlers.push(handler);
  }

  onClose(handler: () => void): void {
    this.#closeHandlers.push(handler);
  }

  /** Đứt kết nối (sạch hay đột ngột như nhau ở tầng này): cả 2 đầu nhận onClose. */
  close(): void {
    if (!this.#open) return;
    this.#open = false;
    for (const h of this.#closeHandlers) h();
    const peer = this.#peer;
    if (peer && peer.#open) peer.close();
  }
}

/** Tạo cặp transport nối nhau: { station: phía trụ sạc, csms: phía CSMS }. */
export function createMockTransportPair(): {
  station: MockChargePointTransport;
  csms: MockChargePointTransport;
} {
  const station = new MockChargePointTransport();
  const csms = new MockChargePointTransport();
  MockChargePointTransport.link(station, csms);
  return { station, csms };
}
