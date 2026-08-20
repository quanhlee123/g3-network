// F-G2 — WebSocket server OCPP 1.6J. CHỈ file này đụng lib `ws` (quy tắc 2):
// bọc mỗi kết nối thành IChargePointTransport rồi giao cho CsmsStationSession.
// Trụ kết nối tới ws://host:${CSMS_WS_PORT}/ocpp/{stationCode}, subprotocol 'ocpp1.6'.
import { WebSocketServer, type WebSocket } from 'ws';
import { OCPP_SUBPROTOCOL, type IChargePointTransport } from '@g3/contracts';
import { CsmsStationSession, type CsmsSessionOptions, type Queryable } from './session';

class WsChargePointTransport implements IChargePointTransport {
  #messageHandlers: ((data: string) => void)[] = [];
  #closeHandlers: (() => void)[] = [];
  // Trụ gửi BootNotification NGAY sau khi bắt tay WS, trước khi server kịp tra DB mã trạm
  // — đệm lại, xả khi handler đầu tiên đăng ký, để không rơi frame nào.
  #buffered: string[] = [];

  constructor(private readonly ws: WebSocket) {
    ws.on('message', (data) => {
      const text = data.toString();
      if (this.#messageHandlers.length === 0) {
        this.#buffered.push(text);
        return;
      }
      for (const h of this.#messageHandlers) h(text);
    });
    ws.on('close', () => {
      for (const h of this.#closeHandlers) h();
    });
  }

  get open(): boolean {
    return this.ws.readyState === this.ws.OPEN;
  }

  send(data: string): void {
    this.ws.send(data);
  }

  onMessage(handler: (data: string) => void): void {
    this.#messageHandlers.push(handler);
    if (this.#buffered.length > 0) {
      // Xả backlog Ở MICROTASK SAU: OcppRpc đăng ký onMessage trong constructor,
      // trước khi CsmsStationSession kịp gắn onCall — xả đồng bộ sẽ thành NotImplemented.
      const backlog = this.#buffered;
      this.#buffered = [];
      queueMicrotask(() => {
        for (const msg of backlog) handler(msg);
      });
    }
  }

  onClose(handler: () => void): void {
    this.#closeHandlers.push(handler);
  }

  close(): void {
    this.ws.close();
  }
}

/** Registry phiên đang kết nối theo mã trạm — HTTP nội bộ (RemoteStart F-H1) tra ở đây. */
export type SessionRegistry = Map<string, CsmsStationSession>;

export function startOcppServer(
  port: number,
  db: Queryable,
  sessions: SessionRegistry,
  opts: CsmsSessionOptions = {},
): WebSocketServer {
  const log = opts.log ?? ((m: string) => console.log(m));
  const wss = new WebSocketServer({
    port,
    handleProtocols: (protocols) => (protocols.has(OCPP_SUBPROTOCOL) ? OCPP_SUBPROTOCOL : false),
  });

  wss.on('connection', (ws, req) => {
    // Tạo transport NGAY để bắt đầu đệm message — BootNotification thường đến
    // trước khi truy vấn mã trạm dưới đây xong.
    const transport = new WsChargePointTransport(ws);
    void (async () => {
      // path /ocpp/{stationCode} — identity trụ = charging_stations.code (seed G3-ST-001…)
      const match = /^\/ocpp\/([^/]+)$/.exec(req.url ?? '');
      const stationCode = match?.[1] ? decodeURIComponent(match[1]) : null;
      if (!stationCode) {
        log(`[csms] từ chối kết nối: path "${req.url}" không đúng dạng /ocpp/{stationCode}`);
        ws.close(1008, 'path phai la /ocpp/{stationCode}');
        return;
      }
      const stationId = await CsmsStationSession.resolveStationId(db, stationCode);
      if (!stationId) {
        log(`[csms] từ chối kết nối: mã trạm "${stationCode}" không có trong charging_stations`);
        ws.close(1008, 'ma tram khong ton tai');
        return;
      }
      const session = new CsmsStationSession(transport, db, stationCode, stationId, opts);
      sessions.set(stationCode, session);
      opts.metrics?.setStationsConnected(sessions.size);
      transport.onClose(() => {
        if (sessions.get(stationCode) === session) sessions.delete(stationCode);
        // Đếm theo registry chứ không theo wss.clients: một kết nối WS đã bắt tay nhưng
        // bị từ chối vì mã trạm lạ KHÔNG phải là "trụ đang kết nối".
        opts.metrics?.setStationsConnected(sessions.size);
      });
      log(`[csms] trạm ${stationCode} đã kết nối (${wss.clients.size} kết nối)`);
    })().catch((err: unknown) => {
      log(`[csms] lỗi nhận kết nối: ${err instanceof Error ? err.message : String(err)}`);
      ws.close(1011);
    });
  });

  return wss;
}
