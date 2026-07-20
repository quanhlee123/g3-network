-- F-G4 · Migration 0008 — cảnh báo & ticket (sheet 8 — MỚI v2.0: Alert, Ticket; F-A2, F-I1, F-I2).
-- dedup_key phục vụ chống spam cảnh báo (1 lần/ngưỡng/chuyến — F-A2).

CREATE TYPE alert_type AS ENUM (
  'battery_low',        -- 30%/20% (F-A2)
  'battery_critical',   -- 10% (F-A2)
  'battery_anomaly',    -- nhiệt độ cao, sụt áp, lỗi cell (F-A4)
  'charging_violation', -- vi phạm chính sách sạc (F-B5)
  'device_offline',     -- thiết bị im lặng (F-J1)
  'device_tamper',      -- mất nguồn đột ngột/tháo thiết bị (F-J3)
  'geofence',           -- ra/vào vùng (F-A5)
  'maintenance'         -- nhắc bảo dưỡng (F-F4)
);
CREATE TYPE alert_status AS ENUM ('open', 'acknowledged', 'resolved');

CREATE TABLE alerts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type         alert_type NOT NULL,
  vehicle_id   uuid REFERENCES vehicles (id),
  device_id    uuid REFERENCES devices (id),
  severity     smallint NOT NULL DEFAULT 1 CHECK (severity BETWEEN 1 AND 3), -- 1 sớm · 2 chính · 3 nguy cấp
  dedup_key    text, -- vd 'F-A2:<vehicle>:20:<trip>' — logic chống spam ở tầng ứng dụng
  payload      jsonb,
  status       alert_status NOT NULL DEFAULT 'open',
  triggered_at timestamptz NOT NULL DEFAULT now(),
  resolved_at  timestamptz,
  CHECK (vehicle_id IS NOT NULL OR device_id IS NOT NULL)
);
CREATE INDEX idx_alerts_vehicle_time ON alerts (vehicle_id, triggered_at DESC);
CREATE INDEX idx_alerts_dedup ON alerts (dedup_key) WHERE dedup_key IS NOT NULL;

CREATE TYPE ticket_channel AS ENUM ('in_app', 'hotline', 'zalo', 'sos');
CREATE TYPE ticket_status AS ENUM ('open', 'in_progress', 'resolved', 'closed');

CREATE TABLE tickets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel         ticket_channel NOT NULL,
  status          ticket_status NOT NULL DEFAULT 'open',
  title           text NOT NULL,
  description     text,
  created_by      uuid REFERENCES users (id),
  assigned_to     uuid REFERENCES users (id),
  vehicle_id      uuid REFERENCES vehicles (id),
  vehicle_context jsonb, -- ngữ cảnh tự đính kèm: VIN, vị trí, mã lỗi (F-I1)
  sla_due_at      timestamptz, -- hạn SLA phản hồi
  created_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz
);
CREATE INDEX idx_tickets_status ON tickets (status, sla_due_at);
