-- F-G4 · Migration 0009 — audit log truy cập dữ liệu vị trí xe (NF-06, sheet 9, quy tắc 5).
-- Mọi truy cập vị trí qua API phải ghi: ai, lúc nào, xe nào, lý do.
-- CSKH chỉ được xem vị trí khi có ticket đang mở → cột ticket_id để đối chiếu.

CREATE TABLE audit_logs (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users (id),          -- ai
  action      text NOT NULL,                                -- vd 'vehicle_location.read'
  vehicle_id  uuid REFERENCES vehicles (id),                -- xe nào
  reason      text NOT NULL,                                -- lý do truy cập
  ticket_id   uuid REFERENCES tickets (id),                 -- bắt buộc với vai trò CSKH (RBAC sheet 9)
  metadata    jsonb,                                        -- ngữ cảnh thêm (endpoint, IP nội bộ…)
  occurred_at timestamptz NOT NULL DEFAULT now()            -- lúc nào
);
CREATE INDEX idx_audit_vehicle_time ON audit_logs (vehicle_id, occurred_at DESC);
CREATE INDEX idx_audit_user_time ON audit_logs (user_id, occurred_at DESC);
