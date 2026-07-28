// F-G2 — Trụ sạc ảo OCPP 1.6J: logic thuần trên IChargePointTransport + OcppRpc
// (quy tắc 2 — WebSocket thật chỉ ở ws-transport.ts). 3 kịch bản Prompt 05:
//   normal     : Boot → Available → phiên sạc trọn vẹn → Stop → Available
//   faulted    : trụ hỏng GIỮA phiên → StatusNotification Faulted + Stop (reason Other)
//   disconnect : đứt kết nối GIỮA phiên, meter vẫn chạy offline, nối lại và gửi
//                StopTransaction BÙ với meterStop đúng (test bắt buộc: vẫn ra 1 phiên, kWh đúng)
// Trả lời RemoteStartTransaction/RemoteStopTransaction từ CSMS (chuẩn bị F-H1).
import {
  OcppRpc,
  type BootNotificationConf,
  type IChargePointTransport,
  type RemoteStartTransactionReq,
  type RemoteStopTransactionReq,
  type StartTransactionConf,
  type StopTransactionConf,
} from '@g3/contracts';

export type SimScenario = 'normal' | 'faulted' | 'disconnect';

export interface StationSimOptions {
  stationCode: string;
  /** Phase 1: idTag = VIN xe GIẢ trong seed (ADR-005), vd G3-SIM-VIN-0001. */
  idTag: string;
  scenario?: SimScenario;
  connectorId?: number;
  powerKw?: number;
  /** Chu kỳ MeterValues (ms). */
  intervalMs?: number;
  /** Số tick MeterValues của 1 phiên sạc. */
  sessionTicks?: number;
  socStartPct?: number;
  /** % SOC tăng mỗi tick (đơn giản hóa — SOC "thật" nằm ở vehicle-sim). */
  socPerTick?: number;
  meterStartWh?: number;
  reconnectDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  clock?: () => number;
  log?: (msg: string) => void;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class ChargePointSim {
  #rpc: OcppRpc | null = null;
  #transport: IChargePointTransport | null = null;
  #meterWh: number;
  #socPct: number;
  #inSession = false;
  #remoteStopRequested = false;
  #heartbeatIntervalS = 30;

  readonly stationCode: string;
  readonly #opts: Required<Omit<StationSimOptions, 'stationCode' | 'idTag'>> & {
    idTag: string;
  };

  constructor(
    private readonly connectTransport: () => Promise<IChargePointTransport>,
    opts: StationSimOptions,
  ) {
    this.stationCode = opts.stationCode;
    this.#opts = {
      idTag: opts.idTag,
      scenario: opts.scenario ?? 'normal',
      connectorId: opts.connectorId ?? 1,
      powerKw: opts.powerKw ?? 120,
      intervalMs: opts.intervalMs ?? 1_000,
      sessionTicks: opts.sessionTicks ?? 6,
      socStartPct: opts.socStartPct ?? 35,
      socPerTick: opts.socPerTick ?? 2,
      meterStartWh: opts.meterStartWh ?? 0,
      reconnectDelayMs: opts.reconnectDelayMs ?? 2_000,
      sleep: opts.sleep ?? defaultSleep,
      clock: opts.clock ?? (() => Date.now()),
      log: opts.log ?? ((m: string) => console.log(m)),
    };
    this.#meterWh = this.#opts.meterStartWh;
    this.#socPct = this.#opts.socStartPct;
  }

  get heartbeatIntervalS(): number {
    return this.#heartbeatIntervalS;
  }

  /** Kết nối + BootNotification + báo Available — trạng thái nghỉ sẵn sàng nhận RemoteStart. */
  async connect(): Promise<void> {
    this.#transport = await this.connectTransport();
    this.#rpc = new OcppRpc(this.#transport);
    this.#rpc.onCall((action, payload) => this.#onCsmsCall(action, payload));
    const boot = await this.#rpc.call<BootNotificationConf>('BootNotification', {
      chargePointVendor: 'G3-SIM',
      chargePointModel: 'TRU-SIM-120KW',
      chargePointSerialNumber: `${this.stationCode}-SIM`,
      firmwareVersion: '1.0.0-sim',
    });
    this.#heartbeatIntervalS = boot.interval;
    await this.#sendStatus('Available');
    this.#log(`kết nối OK — BootNotification ${boot.status}, heartbeat ${boot.interval}s`);
  }

  async heartbeat(): Promise<void> {
    await this.#rpcOrThrow().call('Heartbeat', {});
  }

  /** Chạy 1 phiên sạc theo kịch bản đã cấu hình. */
  async runSession(): Promise<void> {
    if (this.#inSession) return;
    this.#inSession = true;
    this.#remoteStopRequested = false;
    const o = this.#opts;
    try {
      await this.#sendStatus('Charging');
      const start = await this.#rpcOrThrow().call<StartTransactionConf>('StartTransaction', {
        connectorId: o.connectorId,
        idTag: o.idTag,
        meterStart: Math.round(this.#meterWh),
        timestamp: this.#now(),
      });
      if (start.idTagInfo.status !== 'Accepted') {
        this.#log(`CSMS từ chối idTag "${o.idTag}" (${start.idTagInfo.status}) — hủy phiên`);
        await this.#sendStatus('Available');
        return;
      }
      const txId = start.transactionId;
      this.#log(`bắt đầu phiên #${txId} — meterStart ${Math.round(this.#meterWh)} Wh`);

      const faultTick = Math.ceil(o.sessionTicks / 2);
      let offline = false;

      for (let tick = 1; tick <= o.sessionTicks; tick++) {
        await o.sleep(o.intervalMs);
        // Trụ vẫn đo dù mất kết nối — nguồn sự thật là công tơ trong trụ
        this.#meterWh += ((o.powerKw * o.intervalMs) / 3_600_000) * 1_000;
        this.#socPct = Math.min(100, this.#socPct + o.socPerTick);

        if (o.scenario === 'faulted' && tick === faultTick) {
          this.#log(`trụ FAULTED giữa phiên (tick ${tick}/${o.sessionTicks})`);
          await this.#sendStatus('Faulted', 'GroundFailure');
          await this.#stopTransaction(txId, 'Other');
          return; // trụ giữ trạng thái Faulted — không quay lại Available
        }
        if (o.scenario === 'disconnect' && tick === faultTick && !offline) {
          this.#log(
            `ĐỨT KẾT NỐI giữa phiên (tick ${tick}/${o.sessionTicks}) — meter chạy tiếp offline`,
          );
          this.#transport?.close(); // terminate đột ngột, không close frame
          offline = true;
          continue;
        }
        if (!offline) {
          await this.#sendMeterValues(txId);
        }
        if (this.#remoteStopRequested) {
          this.#log(`nhận RemoteStop — dừng phiên #${txId}`);
          await this.#stopTransaction(txId, 'Remote');
          await this.#sendStatus('Available');
          return;
        }
      }

      if (offline) {
        // Nối lại rồi gửi StopTransaction BÙ — giữ nguyên số công tơ đo được lúc offline
        const stopTs = this.#now();
        await o.sleep(o.reconnectDelayMs);
        this.#log(
          `nối lại CSMS, gửi StopTransaction bù (meterStop ${Math.round(this.#meterWh)} Wh)`,
        );
        await this.connect();
        await this.#stopTransaction(txId, 'PowerLoss', stopTs);
        await this.#sendStatus('Available');
        return;
      }

      await this.#stopTransaction(txId, 'Local');
      await this.#sendStatus('Available');
      this.#log(
        `kết thúc phiên #${txId} — meterStop ${Math.round(this.#meterWh)} Wh, SOC ${this.#socPct}%`,
      );
    } finally {
      this.#inSession = false;
    }
  }

  async #stopTransaction(txId: number, reason: string, timestamp?: string): Promise<void> {
    await this.#rpcOrThrow().call<StopTransactionConf>('StopTransaction', {
      transactionId: txId,
      meterStop: Math.round(this.#meterWh),
      timestamp: timestamp ?? this.#now(),
      reason,
      transactionData: [
        {
          timestamp: timestamp ?? this.#now(),
          sampledValue: [
            {
              value: String(this.#socPct),
              measurand: 'SoC',
              unit: 'Percent',
              context: 'Transaction.End',
            },
          ],
        },
      ],
    });
  }

  async #sendMeterValues(txId: number): Promise<void> {
    await this.#rpcOrThrow().call('MeterValues', {
      connectorId: this.#opts.connectorId,
      transactionId: txId,
      meterValue: [
        {
          timestamp: this.#now(),
          sampledValue: [
            {
              value: String(Math.round(this.#meterWh)),
              measurand: 'Energy.Active.Import.Register',
              unit: 'Wh',
            },
            { value: String(this.#socPct), measurand: 'SoC', unit: 'Percent' },
            { value: String(this.#opts.powerKw), measurand: 'Power.Active.Import', unit: 'kW' },
          ],
        },
      ],
    });
  }

  async #sendStatus(
    status: 'Available' | 'Charging' | 'Faulted',
    errorCode = 'NoError',
  ): Promise<void> {
    await this.#rpcOrThrow().call('StatusNotification', {
      connectorId: this.#opts.connectorId,
      status,
      errorCode,
      timestamp: this.#now(),
    });
  }

  /** CSMS gọi xuống trụ (chuẩn bị F-H1). */
  #onCsmsCall(action: string, payload: unknown): unknown {
    if (action === 'RemoteStartTransaction') {
      const req = payload as RemoteStartTransactionReq;
      if (this.#inSession) return { status: 'Rejected' };
      this.#log(`nhận RemoteStartTransaction (idTag ${req.idTag}) — mở phiên`);
      // chạy phiên nền; lỗi chỉ log (simulator không được chết vì 1 phiên hỏng)
      void this.runSession().catch((err: unknown) =>
        this.#log(`lỗi phiên RemoteStart: ${err instanceof Error ? err.message : String(err)}`),
      );
      return { status: 'Accepted' };
    }
    if (action === 'RemoteStopTransaction') {
      const req = payload as RemoteStopTransactionReq;
      this.#log(`nhận RemoteStopTransaction #${req.transactionId}`);
      if (!this.#inSession) return { status: 'Rejected' };
      this.#remoteStopRequested = true;
      return { status: 'Accepted' };
    }
    throw new Error(`NotImplemented: ${action}`);
  }

  #rpcOrThrow(): OcppRpc {
    if (!this.#rpc) throw new Error('Chưa kết nối CSMS — gọi connect() trước');
    return this.#rpc;
  }

  #now(): string {
    return new Date(this.#opts.clock()).toISOString();
  }

  #log(msg: string): void {
    this.#opts.log(`[ocpp-sim] ${this.stationCode}: ${msg}`);
  }
}
