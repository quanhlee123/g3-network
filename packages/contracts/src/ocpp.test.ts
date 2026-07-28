// F-G2 — Test khung OCPP-J + OcppRpc trên cặp mock transport (quy tắc 2: mock hoạt động được).
import { describe, expect, it } from 'vitest';
import { OcppRpc, parseOcppFrame } from './ocpp';
import { createMockTransportPair } from './mocks/ocpp';

describe('parseOcppFrame', () => {
  it('nhận đúng CALL / CALLRESULT / CALLERROR', () => {
    expect(parseOcppFrame('[2,"uid-1","Heartbeat",{}]')).toEqual([2, 'uid-1', 'Heartbeat', {}]);
    expect(parseOcppFrame('[3,"uid-1",{"currentTime":"x"}]')).toEqual([
      3,
      'uid-1',
      { currentTime: 'x' },
    ]);
    expect(parseOcppFrame('[4,"uid-1","InternalError","boom",{}]')).toEqual([
      4,
      'uid-1',
      'InternalError',
      'boom',
      {},
    ]);
  });

  it('kịch bản xấu: frame rác → null, không ném lỗi', () => {
    expect(parseOcppFrame('khong-phai-json')).toBeNull();
    expect(parseOcppFrame('{"kieu":"object"}')).toBeNull();
    expect(parseOcppFrame('[9,"uid",{}]')).toBeNull();
    expect(parseOcppFrame('[2,123,"Action",{}]')).toBeNull(); // uid phải là string
  });
});

describe('OcppRpc qua mock transport', () => {
  it('call() nhận đúng CALLRESULT từ handler bên kia', async () => {
    const { station, csms } = createMockTransportPair();
    const stationRpc = new OcppRpc(station);
    const csmsRpc = new OcppRpc(csms);
    csmsRpc.onCall((action, payload) => {
      expect(action).toBe('BootNotification');
      expect(payload).toEqual({ chargePointVendor: 'G3' });
      return { status: 'Accepted', interval: 30, currentTime: 'now' };
    });

    const conf = await stationRpc.call<{ status: string }>('BootNotification', {
      chargePointVendor: 'G3',
    });
    expect(conf.status).toBe('Accepted');
  });

  it('handler ném lỗi → bên gọi nhận CALLERROR (reject kèm thông điệp)', async () => {
    const { station, csms } = createMockTransportPair();
    const stationRpc = new OcppRpc(station);
    new OcppRpc(csms).onCall(() => {
      throw new Error('DB sập');
    });
    await expect(stationRpc.call('StatusNotification', {})).rejects.toThrow(/DB sập/);
  });

  it('kịch bản xấu: kết nối đóng khi đang chờ → call() reject, không treo', async () => {
    const { station, csms } = createMockTransportPair();
    const stationRpc = new OcppRpc(station);
    new OcppRpc(csms); // phía kia không có handler và sẽ đóng ngay
    const pending = stationRpc.call('Heartbeat', {});
    station.close();
    await expect(pending).rejects.toThrow(/đóng/);
  });
});
