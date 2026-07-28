// Khung khởi tạo (Prompt 01, chưa gắn F-xx).
// QUY TẮC 2 (CLAUDE.md): MỌI tích hợp ngoài (telematics xe, OCPP, thanh toán, bản đồ,
// SMS, push, hóa đơn điện tử) đi qua interface khai báo trong package này.
// CẤM gọi thẳng SDK/API bên ngoài từ logic nghiệp vụ.
// Mỗi interface luôn có ít nhất 1 bản mock hoạt động được trong ./mocks.
// Interface nghiệp vụ cụ thể sẽ được thêm ở các prompt sau (05, 08...).

export * from './telemetry';
export { MockTelemetryPublisher, type MockPublishedMessage } from './mocks/telemetry';
export * from './telematics-source';
export { MockTelematicsSource } from './mocks/telematics-source';

/** Loại adapter — chọn qua biến môi trường, mặc định 'mock' ở Phase 1 (dữ liệu giả 100%). */
export type ProviderKind = 'mock' | 'real';

/**
 * Đọc loại adapter từ biến môi trường; mặc định 'mock'.
 * Phase 1 chạy simulator nên 'real' chỉ hợp lệ khi có ADR được duyệt.
 */
export function resolveProviderKind(value: string | undefined): ProviderKind {
  if (value === undefined || value === '' || value === 'mock') return 'mock';
  if (value === 'real') return 'real';
  throw new Error(`Loại adapter không hợp lệ: "${value}" (chỉ nhận 'mock' hoặc 'real')`);
}
