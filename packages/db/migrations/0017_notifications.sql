-- F-F3 · Migration 0017 — khung thông báo đa kênh: push (FCM) / in-app / SMS.
-- Sheet 4 F-F3: "Cấu hình kênh & ngưỡng; lịch sử; SMS dự phòng cho cảnh báo pin ≤10%".
-- Sheet 2 (hành trình tài xế, bước 5): "Thông báo đúng lúc, không spam (giới hạn tần suất)".
--
-- Ba bảng:
--   notification_prefs — cấu hình KÊNH theo (loại alert × vai trò) + ngưỡng severity nhỏ nhất
--   notifications      — vừa là hộp thư in-app, vừa là LỊCH SỬ GỬI của mọi kênh
--   push_tokens        — token thiết bị di động (FCM giả ở Phase 1) của từng người dùng
--
-- Vì sao lưu cả bản tin bị chặn (status='suppressed'): rate-limit mà không để lại dấu thì
-- không ai điều tra được "vì sao tài xế không nhận được cảnh báo" — với hệ thống an toàn
-- thì đó là câu hỏi bắt buộc trả lời được.

CREATE TYPE notification_channel AS ENUM ('push', 'in_app', 'sms');

-- 'suppressed' = bị rate-limit chặn (KHÔNG áp dụng cho severity 3 — xem ADR-008)
CREATE TYPE notification_status AS ENUM ('sent', 'failed', 'suppressed');

-- Cấu hình kênh theo loại alert × vai trò.
-- min_severity: chỉ gửi khi alerts.severity >= giá trị này. Đây là cách F-A2 thể hiện
-- "tài xế nhận từ 30%, quản lý đội nhận TỪ 20%" (sheet 4 F-A2) bằng CẤU HÌNH, không phải if/else.
CREATE TABLE notification_prefs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type   alert_type NOT NULL,
  role         user_role NOT NULL,
  channels     notification_channel[] NOT NULL CHECK (cardinality(channels) > 0),
  min_severity smallint NOT NULL DEFAULT 1 CHECK (min_severity BETWEEN 1 AND 3),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (alert_type, role)
);

-- Token đẩy của thiết bị di động. Phase 1: giá trị GIẢ do mobile mock sinh (quy tắc 12).
CREATE TABLE push_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users (id),
  token      text NOT NULL UNIQUE,
  platform   text NOT NULL DEFAULT 'android', -- NF-13: ưu tiên Android tầm trung
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_push_tokens_user ON push_tokens (user_id) WHERE revoked_at IS NULL;

CREATE TABLE notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users (id),
  channel    notification_channel NOT NULL,
  status     notification_status NOT NULL,
  alert_id   uuid REFERENCES alerts (id),
  ticket_id  uuid REFERENCES tickets (id),
  alert_type alert_type NOT NULL, -- lặp lại từ alert để rate-limit không phải JOIN
  severity   smallint NOT NULL CHECK (severity BETWEEN 1 AND 3),
  title      text NOT NULL,
  body       text NOT NULL,
  data       jsonb, -- deep-link cho app: vehicle_id, alert_id, toạ độ…
  error      text,  -- lý do khi status='failed' hoặc 'suppressed'
  read_at    timestamptz, -- hộp thư in-app: thời điểm người dùng đọc
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Hộp thư in-app: "thông báo của tôi, mới nhất trước"
CREATE INDEX idx_notifications_user_time ON notifications (user_id, created_at DESC);
-- Cửa sổ rate-limit: đếm theo (người nhận, loại alert, kênh) trong N giây gần nhất
CREATE INDEX idx_notifications_rate ON notifications (user_id, alert_type, channel, created_at DESC);

-- ---------------------------------------------------------------------------
-- Cấu hình MẶC ĐỊNH — chép từ ma trận sheet 9 (docs/prd/09-rbac.md).
--
-- Dòng "Nhận cảnh báo pin / bất thường": Tài xế ✓ · QL đội ✓ · Vận hành — ·
--   Bảo hành V · CSKH V · Admin ✓ · Sale —
-- Dòng "Sức khỏe thiết bị telematics": QL đội V* · CSKH V · Admin ✓ (còn lại —)
--
-- CỐ Ý cài sẵn thay vì để bảng rỗng: bảng rỗng nghĩa là KHÔNG AI nhận được cảnh báo an toàn
-- trên một DB mới dựng — trạng thái mặc định phải là an toàn, không phải im lặng.
-- Vận hành đổi được từng dòng mà không cần deploy.
--
-- KÊNH 'sms' dùng cột users.phone (thêm ở migration 0013 cho đăng nhập OTP) — mọi vai trò
-- đều có SĐT nên gửi được, không chỉ tài xế. Vẫn cấu hình SMS RẤT TIẾT KIỆM: chỉ cho việc
-- không thể bỏ lỡ (pin ≤10%, bất thường pin, mất thiết bị) vì SMS là kênh tốn phí thật và
-- chen ngang mạnh nhất.
-- ---------------------------------------------------------------------------

INSERT INTO notification_prefs (alert_type, role, channels, min_severity) VALUES
  -- F-A2 pin yếu 30% (severity 1) và 20% (severity 2).
  -- QL đội min_severity = 2 → KHÔNG nhận mức 30%, đúng "quản lý đội nhận từ 20%".
  ('battery_low',      'driver',         '{push,in_app}',     1),
  ('battery_low',      'fleet_manager',  '{push,in_app}',     2),
  ('battery_low',      'admin',          '{in_app}',          2),

  -- F-A2 pin nguy cấp ≤10% (severity 3): thêm SMS dự phòng khi không có data (F-F3, NF).
  ('battery_critical', 'driver',         '{push,in_app,sms}', 3),
  ('battery_critical', 'fleet_manager',  '{push,in_app}',     3),
  ('battery_critical', 'admin',          '{in_app}',          3),

  -- F-A4 bất thường pin (an toàn cháy nổ): thêm Bảo hành & CSKH theo sheet 9.
  ('battery_anomaly',  'driver',         '{push,in_app,sms}', 3),
  ('battery_anomaly',  'fleet_manager',  '{push,in_app}',     1),
  ('battery_anomaly',  'warranty_admin', '{in_app}',          1),
  ('battery_anomaly',  'cskh',           '{in_app}',          3),
  ('battery_anomaly',  'admin',          '{push,in_app}',     1),

  -- F-A5 geofence ra/vào vùng: việc của người quản lý đội, không phải của tài xế.
  ('geofence',         'fleet_manager',  '{in_app}',          1),
  ('geofence',         'admin',          '{in_app}',          1),

  -- F-J1/F-J3 thiết bị: theo dòng "Sức khỏe thiết bị telematics" của sheet 9.
  -- LƯU Ý: F-J3 yêu cầu báo cho "Vận hành & Quản lý rủi ro", nhưng sheet 9 và enum
  -- user_role KHÔNG có vai trò "Quản lý rủi ro" → tạm gộp vào admin, đã ghi thành mục
  -- MỞ trong docs/DECISION-LOG.md (D-12). Không tự thêm vai trò mới (quy tắc 6).
  ('device_offline',   'fleet_manager',  '{in_app}',          1),
  ('device_offline',   'cskh',           '{in_app}',          2),
  ('device_offline',   'admin',          '{in_app}',          1),
  ('device_tamper',    'fleet_manager',  '{push,in_app}',     1),
  ('device_tamper',    'cskh',           '{in_app}',          1),
  ('device_tamper',    'admin',          '{push,in_app,sms}', 1),

  -- F-B5 vi phạm sạc & F-C6 đối soát lệch: đã có alert từ Prompt 06, giờ có kênh đi kèm.
  ('charging_violation', 'fleet_manager', '{in_app}',         1),
  ('charging_violation', 'warranty_admin', '{in_app}',        1),
  ('charging_violation', 'admin',         '{in_app}',         1),
  ('reconciliation_mismatch', 'energy_ops', '{in_app}',       1),
  ('reconciliation_mismatch', 'admin',      '{in_app}',       1),

  -- F-F4 nhắc bảo dưỡng (sheet 4): kênh nhẹ, không đánh thức ai giữa đêm.
  ('maintenance',      'driver',         '{in_app}',          1),
  ('maintenance',      'fleet_manager',  '{in_app}',          1);
