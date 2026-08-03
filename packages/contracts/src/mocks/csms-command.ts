// F-H1 — CSMS giả cho test luồng thanh toán QR: ghi lệnh vào RAM, không cần WebSocket.
import type { ICsmsCommander, KetQuaLenh } from '../csms-command';

export interface LenhDaGui {
  loai: 'start' | 'stop';
  stationCode: string;
  connectorId?: number;
  idTag?: string;
  transactionId?: number;
}

export class MockCsmsCommander implements ICsmsCommander {
  readonly lenh: LenhDaGui[] = [];
  /** Đặt 'Rejected' để mô phỏng trụ từ chối (đang bận, đang lỗi). */
  ketQua: KetQuaLenh = 'Accepted';
  /** Đặt true để mô phỏng CSMS không kết nối được — luồng gọi phải xử lý tử tế. */
  loi = false;

  remoteStart(stationCode: string, connectorId: number, idTag: string): Promise<KetQuaLenh> {
    if (this.loi) return Promise.reject(new Error('csms-mock: không kết nối được'));
    this.lenh.push({ loai: 'start', stationCode, connectorId, idTag });
    return Promise.resolve(this.ketQua);
  }

  remoteStop(stationCode: string, transactionId: number): Promise<KetQuaLenh> {
    if (this.loi) return Promise.reject(new Error('csms-mock: không kết nối được'));
    this.lenh.push({ loai: 'stop', stationCode, transactionId });
    return Promise.resolve(this.ketQua);
  }

  xoa(): void {
    this.lenh.length = 0;
  }
}
