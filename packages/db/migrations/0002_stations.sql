-- F-G4 · Migration 0002 — trạm sạc & trụ/súng (sheet 8: ChargingStation, Connector).
-- PostGIS geography cho tọa độ trạm (kiến trúc đã chốt). Trạng thái súng theo OCPP (F-C2).

CREATE TYPE station_status AS ENUM ('active', 'maintenance', 'inactive');
CREATE TYPE connector_status AS ENUM ('Available', 'Charging', 'Faulted', 'Unavailable');

-- Trạm sạc (sheet 8: station_id; GPS; khu vực; công suất; số trụ; CCS2; giờ hoạt động)
CREATE TABLE charging_stations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code               text NOT NULL UNIQUE, -- mã trạm, dùng làm ChargePoint identity OCPP
  name               text NOT NULL,
  location           geography (Point, 4326) NOT NULL,
  area               text, -- khu vực (vd TP.HCM — Thủ Đức)
  total_power_kw     numeric(8, 2) CHECK (total_power_kw > 0),
  connector_standard text NOT NULL DEFAULT 'CCS2',
  status             station_status NOT NULL DEFAULT 'active',
  operating_hours    text, -- vd '24/7' hoặc '06:00-22:00'
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_stations_location ON charging_stations USING gist (location);

-- Trụ/Súng sạc (sheet 8: connector_id; station_id; công suất; chuẩn; trạng thái)
CREATE TABLE connectors (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id        uuid NOT NULL REFERENCES charging_stations (id),
  ocpp_connector_id integer NOT NULL CHECK (ocpp_connector_id >= 1), -- connectorId trong OCPP 1.6J
  max_power_kw      numeric(8, 2) NOT NULL CHECK (max_power_kw > 0),
  standard          text NOT NULL DEFAULT 'CCS2',
  status            connector_status NOT NULL DEFAULT 'Available',
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (station_id, ocpp_connector_id)
);
