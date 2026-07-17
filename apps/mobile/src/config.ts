// Khung khởi tạo (Prompt 01, chưa gắn F-xx) — cấu hình tĩnh của app tài xế.
export const APP_CONFIG = {
  /** Trạng thái khung: màn hình thật build ở Prompt 09 (chờ chốt D-01). */
  stage: 'khung' as const,
  /** NF-13: ưu tiên Android tầm trung. */
  targetPlatform: 'android' as const,
};
