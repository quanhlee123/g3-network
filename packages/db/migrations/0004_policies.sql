-- F-G4 · Migration 0004 — chính sách sạc bảo hành (sheet 8: ChargingPolicy; F-B1).
-- Có version + hiệu lực từ–đến; phạm vi áp dụng: 1 xe / 1 đội (customer) / 1 dòng xe.

CREATE TYPE policy_scope AS ENUM ('vehicle', 'fleet', 'model');

CREATE TABLE charging_policies (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                 text NOT NULL, -- mã chính sách; (code, version) là duy nhất
  version              integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  name                 text NOT NULL,
  scope_type           policy_scope NOT NULL,
  vehicle_id           uuid REFERENCES vehicles (id),
  customer_id          uuid REFERENCES customers (id),
  vehicle_model        vehicle_model,
  soc_min_pct          numeric(5, 2) CHECK (soc_min_pct BETWEEN 0 AND 100),
  soc_max_pct          numeric(5, 2) CHECK (soc_max_pct BETWEEN 0 AND 100),
  -- Khung giờ ToU được phép sạc, vd [{"from": "22:00", "to": "06:00"}]; NULL = mọi giờ
  allowed_hours        jsonb,
  max_power_kw         numeric(8, 2) CHECK (max_power_kw > 0),
  max_duration_minutes integer CHECK (max_duration_minutes > 0),
  max_sessions_per_day integer CHECK (max_sessions_per_day > 0),
  effective_from       timestamptz NOT NULL,
  effective_to         timestamptz, -- NULL = vô thời hạn
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code, version),
  CHECK (effective_to IS NULL OR effective_to > effective_from),
  CHECK (soc_min_pct IS NULL OR soc_max_pct IS NULL OR soc_max_pct > soc_min_pct),
  -- Đúng 1 cột phạm vi khớp scope_type được điền
  CHECK (
    (scope_type = 'vehicle' AND vehicle_id IS NOT NULL AND customer_id IS NULL AND vehicle_model IS NULL)
    OR (scope_type = 'fleet' AND customer_id IS NOT NULL AND vehicle_id IS NULL AND vehicle_model IS NULL)
    OR (scope_type = 'model' AND vehicle_model IS NOT NULL AND vehicle_id IS NULL AND customer_id IS NULL)
  )
);
CREATE INDEX idx_policies_effective ON charging_policies (effective_from, effective_to);
