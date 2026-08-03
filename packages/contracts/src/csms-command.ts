// F-H1 — Lệnh điều khiển trụ sạc mà API gửi cho CSMS (RemoteStart/RemoteStop của OCPP 1.6J).
//
// QUY TẮC 2 (CLAUDE.md) liệt kê OCPP là tích hợp ngoài. `IChargePointTransport` (./ocpp.ts)
// là phía CSMS ↔ trụ; interface này là phía apps/api ↔ CSMS, vì hai tiến trình đó tách nhau
// (services/csms chạy riêng). Có interface ở đây thì luồng thanh toán QR test được mà không
// cần dựng WebSocket, và đổi sang CSMS thuê ngoài (Q2 còn MỞ) chỉ là thay bản cài đặt.
export type KetQuaLenh = 'Accepted' | 'Rejected';

export interface ICsmsCommander {
  /**
   * Yêu cầu trụ mở phiên sạc cho một idTag.
   *
   * LƯU Ý VỀ THỜI GIAN: 'Accepted' chỉ nghĩa là trụ NHẬN lệnh, KHÔNG phải phiên đã mở.
   * Trụ mở phiên xong mới gửi StartTransaction, và mã giao dịch chỉ tồn tại từ lúc đó.
   * Luồng thanh toán phải chịu được khoảng trống này (F-H1).
   */
  remoteStart(stationCode: string, connectorId: number, idTag: string): Promise<KetQuaLenh>;
  remoteStop(stationCode: string, transactionId: number): Promise<KetQuaLenh>;
}
