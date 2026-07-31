-- F-A5 · Migration 0020 — vùng geofence đa giác (PostGIS) + trạng thái trong/ngoài của từng xe.
-- Sheet 4 F-A5: "cảnh báo ra/vào vùng (phục vụ giám sát & quy trình thu hồi)",
-- tiêu chí: "geofence theo xe/đội".

CREATE TABLE geofences (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code         text NOT NULL UNIQUE,
  name         text NOT NULL,
  -- Phạm vi áp dụng, cùng quy ước với battery_alert_thresholds (0018) và anomaly_rules (0019):
  -- gắn XE, hoặc gắn ĐỘI, hoặc cả hai NULL = áp cho MỌI xe (vd vùng biên giới, vùng cấm).
  customer_id  uuid REFERENCES customers (id) ON DELETE CASCADE,
  vehicle_id   uuid REFERENCES vehicles (id) ON DELETE CASCADE,
  -- Đa giác trên mặt cầu. geography (không phải geometry) để ST_Covers/ST_Distance tính
  -- bằng mét thật, không phải bằng độ — quan trọng với vùng trải dài Bắc–Nam.
  vung         geography (Polygon, 4326) NOT NULL,
  canh_bao_vao boolean NOT NULL DEFAULT true,
  canh_bao_ra  boolean NOT NULL DEFAULT true,
  enabled      boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT geofences_pham_vi_check CHECK (customer_id IS NULL OR vehicle_id IS NULL)
);

CREATE INDEX idx_geofences_vung ON geofences USING GIST (vung);
CREATE INDEX idx_geofences_vehicle ON geofences (vehicle_id) WHERE vehicle_id IS NOT NULL;
CREATE INDEX idx_geofences_customer ON geofences (customer_id) WHERE customer_id IS NOT NULL;

-- Trạng thái trong/ngoài GẦN NHẤT của mỗi (vùng, xe).
-- Nằm ở DB chứ không phải RAM vì đây là nguồn sự thật để phát hiện CHUYỂN TIẾP: ingest
-- khởi động lại giữa chuyến không được coi xe "vừa mới vào vùng".
CREATE TABLE geofence_states (
  geofence_id  uuid NOT NULL REFERENCES geofences (id) ON DELETE CASCADE,
  vehicle_id   uuid NOT NULL REFERENCES vehicles (id) ON DELETE CASCADE,
  ben_trong    boolean NOT NULL,
  -- Giờ THIẾT BỊ của bản ghi telemetry làm đổi trạng thái (không phải giờ ghi DB).
  cap_nhat_luc timestamptz NOT NULL,
  PRIMARY KEY (geofence_id, vehicle_id)
);
