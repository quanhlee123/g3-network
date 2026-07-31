// F-F3 — Điểm vào @g3/notify: khung thông báo đa kênh dùng chung cho services/ingest
// (cảnh báo pin F-A2, bất thường F-A4, geofence F-A5, thiết bị F-J1/J3) và apps/api (SOS F-I2).
export { resolveRateLimit, SEVERITY_BO_QUA_RATE_LIMIT, type RateLimitConfig } from './config';
export { timNguoiNhan, type Queryable, type Recipient } from './recipients';
export { NotifierService, type NotifierServiceDeps } from './notifier';
