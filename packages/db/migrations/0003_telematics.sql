-- F-G4 · Migration 0003 — telematics_readings: hypertable TimescaleDB (sheet 8: TelematicsReading).
-- NF-16: có schema_version từ ngày 1; retention hot mặc định 12 tháng
-- (migrate.ts cập nhật lại theo biến môi trường TELEMETRY_RETENTION_MONTHS).
-- F-A1: SOC, GPS, tốc độ, odometer, motor, nhiệt độ, mã lỗi.

CREATE TABLE telematics_readings (
  time              timestamptz NOT NULL,
  vehicle_id        uuid NOT NULL REFERENCES vehicles (id),
  device_id         uuid REFERENCES devices (id),
  schema_version    smallint NOT NULL DEFAULT 1, -- NF-16, khớp TELEMETRY_SCHEMA_VERSION ở @g3/shared
  soc_pct           numeric(5, 2) CHECK (soc_pct BETWEEN 0 AND 100),
  soh_pct           numeric(5, 2) CHECK (soh_pct BETWEEN 0 AND 100),
  battery_voltage_v numeric(6, 1),
  battery_temp_c    numeric(5, 1),
  motor_temp_c      numeric(5, 1),
  charge_current_a  numeric(7, 1), -- dòng sạc (+) / xả (−)
  speed_kmh         numeric(5, 1) CHECK (speed_kmh >= 0),
  odometer_km       numeric(10, 1) CHECK (odometer_km >= 0),
  position          geography (Point, 4326),
  fault_codes       jsonb, -- mảng mã lỗi BMS/motor, vd ["P0A80"]
  -- Khóa chính (vehicle_id, time): chặn bản ghi trùng cùng xe cùng thời điểm;
  -- ingest dùng ON CONFLICT DO NOTHING cho dữ liệu gửi lại khi mất sóng.
  PRIMARY KEY (vehicle_id, time)
);

SELECT create_hypertable('telematics_readings', 'time');

-- Truy vấn chủ đạo: theo xe + khoảng thời gian (mới nhất trước)
CREATE INDEX idx_telematics_vehicle_time ON telematics_readings (vehicle_id, time DESC);

-- Retention hot mặc định 12 tháng (NF-16). Giá trị thật đọc từ env khi chạy migrate.
SELECT add_retention_policy('telematics_readings', INTERVAL '12 months');
