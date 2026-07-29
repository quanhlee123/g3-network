-- F-C6 · Migration 0015 — kết quả đối soát 3 chiều mỗi phiên sạc (NF-10).
--
-- Đây là bảng KẾT QUẢ TÍNH LẠI ĐƯỢC, không phải bằng chứng pháp lý: charging_sessions và
-- violations mới là append-only (NF-11). Chạy lại job trên cùng phiên phải cho cùng kết quả
-- → UNIQUE (session_id) + ghi kiểu upsert, không sinh dòng trùng mỗi lần chạy.

CREATE TYPE reconciliation_status AS ENUM (
  'khop',           -- cả 3 chiều lệch <= ngưỡng
  'lech',           -- lệch quá ngưỡng → đã sinh alert
  'thieu_du_lieu'   -- thiếu telemetry hoặc thiếu giao dịch → KHÔNG kết luận, không alert giả
);

CREATE TABLE reconciliation_results (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       uuid NOT NULL UNIQUE REFERENCES charging_sessions (id),
  vehicle_id       uuid NOT NULL REFERENCES vehicles (id),
  station_id       uuid NOT NULL REFERENCES charging_stations (id),

  -- Chiều 1 — TRỤ: công tơ OCPP (charging_sessions.energy_kwh)
  kwh_tru          numeric(9, 3) CHECK (kwh_tru >= 0),
  -- Chiều 2 — XE: (SOC cuối − SOC đầu)/100 × dung lượng pin ÷ hiệu suất sạc, SOC nội suy
  -- từ telematics_readings tại đúng mốc bắt đầu/kết thúc phiên
  kwh_xe           numeric(9, 3) CHECK (kwh_xe >= 0),
  -- Chiều 3 — TIỀN: amount_vnd của giao dịch đã 'succeeded' ÷ đơn giá điện
  kwh_thanh_toan   numeric(9, 3) CHECK (kwh_thanh_toan >= 0),
  so_tien_vnd      numeric(12, 0) CHECK (so_tien_vnd >= 0), -- VNĐ (NF-17)

  lech_xe_pct      numeric(7, 3), -- |kwh_xe − kwh_tru| / kwh_tru × 100
  lech_tien_pct    numeric(7, 3), -- |kwh_thanh_toan − kwh_tru| / kwh_tru × 100
  lech_max_pct     numeric(7, 3), -- lớn hơn trong hai giá trị trên — so với ngưỡng NF-10
  nguong_pct       numeric(5, 3) NOT NULL, -- ngưỡng áp dụng lúc chạy (mặc định 1.000)

  status           reconciliation_status NOT NULL,
  ghi_chu          text,          -- vì sao thiếu dữ liệu / chi tiết lệch
  alert_id         uuid REFERENCES alerts (id),
  checked_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_reconcile_status_time ON reconciliation_results (status, checked_at DESC);
CREATE INDEX idx_reconcile_vehicle ON reconciliation_results (vehicle_id, checked_at DESC);
