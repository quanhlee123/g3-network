-- F-G2 · Migration 0012 — ocpp_transactions: trạng thái phiên sạc ĐANG MỞ phía CSMS.
-- Bảng MUTABLE có chủ đích, tách khỏi charging_sessions append-only (NF-11) — xem ADR-005:
-- charging_sessions chỉ được ghi ĐÚNG 1 LẦN tại StopTransaction; mọi cập nhật trung gian
-- (MeterValues, SoC, công suất) diễn ra ở đây. Sống sót khi CSMS restart / trụ mất kết nối
-- giữa phiên rồi gửi StopTransaction bù.

CREATE TYPE ocpp_transaction_status AS ENUM ('open', 'closed');

CREATE TABLE ocpp_transactions (
  -- transactionId OCPP 1.6 là số nguyên do CSMS cấp — dùng sequence làm luôn khóa chính
  transaction_id  integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  station_id      uuid NOT NULL REFERENCES charging_stations (id),
  connector_id    uuid NOT NULL REFERENCES connectors (id),
  vehicle_id      uuid NOT NULL REFERENCES vehicles (id), -- resolve từ idTag (Phase 1: idTag = VIN)
  id_tag          text NOT NULL,
  meter_start_wh  integer NOT NULL CHECK (meter_start_wh >= 0),
  soc_start_pct   numeric(5, 2) CHECK (soc_start_pct BETWEEN 0 AND 100),
  started_at      timestamptz NOT NULL, -- giờ TRỤ báo trong StartTransaction
  last_meter_wh   integer CHECK (last_meter_wh >= 0),
  last_soc_pct    numeric(5, 2) CHECK (last_soc_pct BETWEEN 0 AND 100),
  max_power_kw    numeric(8, 2) CHECK (max_power_kw >= 0),
  status          ocpp_transaction_status NOT NULL DEFAULT 'open',
  created_at      timestamptz NOT NULL DEFAULT now(),
  closed_at       timestamptz
);
CREATE INDEX idx_ocpp_tx_open ON ocpp_transactions (station_id) WHERE status = 'open';
CREATE INDEX idx_ocpp_tx_connector ON ocpp_transactions (connector_id, started_at DESC);
