// F-G2 — Test trụ ảo với "CSMS giả" qua mock transport (không cần ws, không cần DB):
// soi TRÌNH TỰ message OCPP từng kịch bản — đây là hợp đồng hành vi với CSMS thật.
import { describe, expect, it } from 'vitest';
import {
  OcppRpc,
  createMockTransportPair,
  type IChargePointTransport,
  type StartTransactionReq,
  type StopTransactionReq,
} from '@g3/contracts';
import { ChargePointSim, type SimScenario } from './station-sim';

interface RecordedCall {
  action: string;
  payload: unknown;
}

/** CSMS giả: chấp nhận mọi thứ, ghi log call — mỗi lần "trụ kết nối" gắn vào transport mới. */
function makeFakeCsms(calls: RecordedCall[]) {
  let nextTxId = 100;
  return (csmsSide: IChargePointTransport): void => {
    const rpc = new OcppRpc(csmsSide);
    rpc.onCall((action, payload) => {
      calls.push({ action, payload });
      switch (action) {
        case 'BootNotification':
          return { status: 'Accepted', currentTime: new Date().toISOString(), interval: 30 };
        case 'StartTransaction':
          return { transactionId: nextTxId++, idTagInfo: { status: 'Accepted' } };
        case 'StopTransaction':
          return { idTagInfo: { status: 'Accepted' } };
        default:
          return {};
      }
    });
  };
}

function makeSim(scenario: SimScenario, calls: RecordedCall[]) {
  const attachCsms = makeFakeCsms(calls);
  return new ChargePointSim(
    async () => {
      const pair = createMockTransportPair();
      attachCsms(pair.csms);
      return pair.station;
    },
    {
      stationCode: 'G3-ST-001',
      idTag: 'G3-SIM-VIN-0001',
      scenario,
      sessionTicks: 4,
      powerKw: 120,
      intervalMs: 3_600_000 / 4, // mỗi tick = 15 phút ảo → 30 kWh/tick, số đẹp để soi meter
      meterStartWh: 1_000_000,
      socStartPct: 40,
      sleep: () => Promise.resolve(), // chạy tức thì
      log: () => {},
    },
  );
}

const actions = (calls: RecordedCall[]) => calls.map((c) => c.action);

describe('ChargePointSim', () => {
  it('kịch bản normal: Boot → Available → Charging → Start → MeterValues → Stop → Available', async () => {
    const calls: RecordedCall[] = [];
    const sim = makeSim('normal', calls);
    await sim.connect();
    await sim.runSession();

    expect(actions(calls)).toEqual([
      'BootNotification',
      'StatusNotification', // Available sau boot
      'StatusNotification', // Charging
      'StartTransaction',
      'MeterValues',
      'MeterValues',
      'MeterValues',
      'MeterValues',
      'StopTransaction',
      'StatusNotification', // Available
    ]);
    const start = calls.find((c) => c.action === 'StartTransaction')!
      .payload as StartTransactionReq;
    expect(start.idTag).toBe('G3-SIM-VIN-0001');
    expect(start.meterStart).toBe(1_000_000);
    const stop = calls.find((c) => c.action === 'StopTransaction')!.payload as StopTransactionReq;
    // 4 tick × 30 kWh = 120 kWh
    expect(stop.meterStop).toBe(1_120_000);
    expect(stop.transactionData?.[0]?.sampledValue[0]?.value).toBe('48'); // SOC 40 + 4×2
  });

  it('kịch bản faulted: Faulted GIỮA phiên + Stop (reason Other), KHÔNG quay lại Available', async () => {
    const calls: RecordedCall[] = [];
    const sim = makeSim('faulted', calls);
    await sim.connect();
    await sim.runSession();

    const seq = actions(calls);
    expect(seq[seq.length - 1]).toBe('StopTransaction'); // kết thúc bằng Stop, không Available
    const statuses = calls
      .filter((c) => c.action === 'StatusNotification')
      .map((c) => (c.payload as { status: string }).status);
    expect(statuses).toEqual(['Available', 'Charging', 'Faulted']);
    const stop = calls.find((c) => c.action === 'StopTransaction')!.payload as StopTransactionReq;
    expect(stop.reason).toBe('Other');
    expect(stop.meterStop).toBe(1_060_000); // đứt ở tick 2/4 → mới sạc 60 kWh
  });

  it('BÀI BẮT BUỘC (phía trụ): disconnect giữa phiên → meter chạy offline, nối lại gửi Stop BÙ meterStop đúng', async () => {
    const calls: RecordedCall[] = [];
    const sim = makeSim('disconnect', calls);
    await sim.connect();
    await sim.runSession();

    const seq = actions(calls);
    // Sau khi đứt (tick 2), không MeterValues nào lọt ra nữa; nối lại: Boot mới + Stop bù
    expect(seq).toEqual([
      'BootNotification',
      'StatusNotification', // Available (kết nối 1)
      'StatusNotification', // Charging
      'StartTransaction',
      'MeterValues', // tick 1
      'BootNotification', // kết nối 2 (nối lại)
      'StatusNotification', // Available sau boot kết nối 2
      'StopTransaction', // BÙ
      'StatusNotification', // Available sau khi đóng phiên
    ]);
    const stop = calls.find((c) => c.action === 'StopTransaction')!.payload as StopTransactionReq;
    expect(stop.reason).toBe('PowerLoss');
    // Trọn 4 tick × 30 kWh vẫn được tính dù 3 tick cuối offline — công tơ trụ là nguồn sự thật
    expect(stop.meterStop).toBe(1_120_000);
  });

  it('RemoteStop khi đang nghỉ → Rejected (không có phiên để dừng)', async () => {
    // 1 RPC duy nhất phía CSMS: vừa trả lời trụ, vừa chủ động gọi RemoteStop
    let csmsRpc: OcppRpc | null = null;
    const sim = new ChargePointSim(
      async () => {
        const pair = createMockTransportPair();
        const rpc = new OcppRpc(pair.csms);
        rpc.onCall((action) => {
          if (action === 'BootNotification') {
            return { status: 'Accepted', currentTime: new Date().toISOString(), interval: 30 };
          }
          return {};
        });
        csmsRpc = rpc;
        return pair.station;
      },
      {
        stationCode: 'G3-ST-001',
        idTag: 'G3-SIM-VIN-0001',
        sleep: () => Promise.resolve(),
        log: () => {},
      },
    );
    await sim.connect();
    const conf = await csmsRpc!.call<{ status: string }>('RemoteStopTransaction', {
      transactionId: 1,
    });
    expect(conf.status).toBe('Rejected');
  });
});
