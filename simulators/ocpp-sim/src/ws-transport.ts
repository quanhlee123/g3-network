// F-G2 — Transport WebSocket phía trụ sạc. CHỈ file này đụng lib `ws` (quy tắc 2);
// logic mô phỏng ở station-sim.ts chỉ biết IChargePointTransport.
import WebSocket from 'ws';
import { OCPP_SUBPROTOCOL, type IChargePointTransport } from '@g3/contracts';

class WsClientTransport implements IChargePointTransport {
  #messageHandlers: ((data: string) => void)[] = [];
  #closeHandlers: (() => void)[] = [];

  constructor(private readonly ws: WebSocket) {
    ws.on('message', (data) => {
      for (const h of this.#messageHandlers) h(data.toString());
    });
    ws.on('close', () => {
      for (const h of this.#closeHandlers) h();
    });
  }

  get open(): boolean {
    return this.ws.readyState === WebSocket.OPEN;
  }

  send(data: string): void {
    this.ws.send(data);
  }

  onMessage(handler: (data: string) => void): void {
    this.#messageHandlers.push(handler);
  }

  onClose(handler: () => void): void {
    this.#closeHandlers.push(handler);
  }

  /** Đứt kết nối ĐỘT NGỘT (kịch bản disconnect): hủy thẳng socket, không WS close frame. */
  close(): void {
    this.ws.terminate();
  }
}

/** Kết nối tới CSMS: ws://host:port/ocpp/{maTram}, subprotocol ocpp1.6. */
export async function connectWsTransport(url: string): Promise<IChargePointTransport> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, [OCPP_SUBPROTOCOL], { handshakeTimeout: 5_000 });
    ws.once('open', () => resolve(new WsClientTransport(ws)));
    ws.once('error', (err) =>
      reject(
        new Error(
          `Không kết nối được CSMS tại ${url} — chạy \`npm run start -w services/csms\` trước. (${err.message})`,
        ),
      ),
    );
  });
}
