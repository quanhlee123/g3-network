// F-G2/F-C6 — Đồng hồ ảo của trụ: kWh công tơ phải KHỚP độ dài phiên ghi trong OCPP.
// Không khớp thì đối soát 3 chiều (NF-10, ngưỡng 1%) báo động giả — đúng lỗi đã bắt được
// trong lần chạy demo Gate 0 đầu tiên (lệch 1.06%).
import { describe, expect, it } from 'vitest';
import { createMockTransportPair, OcppRpc } from '@g3/contracts';
import { ChargePointSim } from './station-sim';

interface GoiTin {
  action: string;
  payload: Record<string, unknown>;
}

/** Dựng 1 trụ ảo nối vào CSMS giả chỉ ghi lại message, chạy tức thì (sleep = no-op). */
async function chayPhien(intervalMs: number, sessionTicks: number, powerKw: number) {
  const nhan: GoiTin[] = [];
  let txId = 0;

  const sim = new ChargePointSim(
    () => {
      const pair = createMockTransportPair();
      const rpc = new OcppRpc(pair.csms);
      rpc.onCall((action, payload) => {
        nhan.push({ action, payload: payload as Record<string, unknown> });
        switch (action) {
          case 'BootNotification':
            return { status: 'Accepted', currentTime: new Date().toISOString(), interval: 30 };
          case 'StartTransaction':
            txId += 1;
            return { transactionId: txId, idTagInfo: { status: 'Accepted' } };
          case 'StopTransaction':
            return { idTagInfo: { status: 'Accepted' } };
          default:
            return {};
        }
      });
      return Promise.resolve(pair.station);
    },
    {
      stationCode: 'G3-TEST-ST',
      idTag: 'G3-SIM-VIN-0001',
      intervalMs,
      sessionTicks,
      powerKw,
      meterStartWh: 1_000_000,
      sleep: () => Promise.resolve(), // tua nhanh: thời gian THẬT ~0
      log: () => {},
    },
  );
  await sim.connect();
  await sim.runSession();
  return nhan;
}

describe('đồng hồ ảo của trụ sạc', () => {
  it('kWh công tơ khớp chính xác độ dài phiên, dù test chạy tức thì', async () => {
    const intervalMs = 2000;
    const ticks = 60;
    const powerKw = 120;

    const nhan = await chayPhien(intervalMs, ticks, powerKw);
    const start = nhan.find((g) => g.action === 'StartTransaction')!;
    const stop = nhan.find((g) => g.action === 'StopTransaction')!;

    const kwh = ((stop.payload.meterStop as number) - (start.payload.meterStart as number)) / 1000;
    const giay =
      (Date.parse(stop.payload.timestamp as string) -
        Date.parse(start.payload.timestamp as string)) /
      1000;

    expect(kwh).toBeCloseTo((powerKw * (intervalMs * ticks)) / 3_600_000, 6);
    expect(giay).toBeCloseTo((intervalMs * ticks) / 1000, 6);

    // Công suất trung bình suy ra từ 2 con số này phải đúng bằng công suất sạc —
    // đây chính là điều kiện để chiều "trụ" và chiều "xe" của NF-10 khớp nhau.
    expect((kwh / (giay / 3600)) as number).toBeCloseTo(powerKw, 6);
  });

  it('phiên không còn dài ~0 giây khi test tua nhanh (avg_power_kw có nghĩa)', async () => {
    const nhan = await chayPhien(3_600_000 / 4, 4, 120); // 4 tick × 15 phút ảo
    const start = nhan.find((g) => g.action === 'StartTransaction')!;
    const stop = nhan.find((g) => g.action === 'StopTransaction')!;

    const giay =
      (Date.parse(stop.payload.timestamp as string) -
        Date.parse(start.payload.timestamp as string)) /
      1000;
    expect(giay).toBeCloseTo(3600, 6); // đúng 1 giờ ảo
  });
});
