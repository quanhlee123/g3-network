-- F-G4 · Migration 0005 — phiên sạc APPEND-ONLY (sheet 8: ChargingSession; F-B2; NF-11).
-- Bản ghi bất biến, có giá trị pháp lý bảo hành: trigger chặn mọi UPDATE/DELETE từ tầng ứng dụng.
-- Liên kết thanh toán đi theo chiều payment_transactions.session_id (migration 0007)
-- để bản ghi phiên sạc không bao giờ phải sửa sau khi ghi.

-- Hàm dùng chung cho mọi bảng append-only (charging_sessions, violations)
CREATE FUNCTION forbid_update_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Bảng % là APPEND-ONLY (NF-11) — không được %', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'raise_exception';
END;
$$;

CREATE TABLE charging_sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id          uuid NOT NULL REFERENCES vehicles (id),
  station_id          uuid NOT NULL REFERENCES charging_stations (id),
  connector_id        uuid NOT NULL REFERENCES connectors (id),
  ocpp_transaction_id text UNIQUE, -- transactionId OCPP để đối soát trụ–xe–thanh toán (NF-10)
  started_at          timestamptz NOT NULL,
  ended_at            timestamptz,
  energy_kwh          numeric(9, 3) CHECK (energy_kwh >= 0),
  soc_start_pct       numeric(5, 2) CHECK (soc_start_pct BETWEEN 0 AND 100),
  soc_end_pct         numeric(5, 2) CHECK (soc_end_pct BETWEEN 0 AND 100),
  avg_power_kw        numeric(8, 2) CHECK (avg_power_kw >= 0),
  max_power_kw        numeric(8, 2) CHECK (max_power_kw >= 0),
  cost_vnd            numeric(12, 0) CHECK (cost_vnd >= 0), -- đơn vị VNĐ (NF-17)
  recorded_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);
CREATE INDEX idx_sessions_vehicle_time ON charging_sessions (vehicle_id, started_at DESC);
CREATE INDEX idx_sessions_station_time ON charging_sessions (station_id, started_at DESC);

CREATE TRIGGER charging_sessions_append_only
  BEFORE UPDATE OR DELETE ON charging_sessions
  FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
