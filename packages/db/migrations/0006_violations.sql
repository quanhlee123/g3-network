-- F-G4 · Migration 0006 — vi phạm chính sách sạc APPEND-ONLY (sheet 8: Violation; F-B3; NF-11).
-- evidence jsonb = snapshot phiên sạc + ngưỡng chính sách tại thời điểm phát hiện
-- (bằng chứng bất biến phục vụ đối chiếu hợp đồng bảo hành).

CREATE TYPE violation_type AS ENUM (
  'outside_hours',      -- sạc ngoài khung giờ ToU
  'soc_above_max',      -- sạc vượt SOC max (vd >90%)
  'soc_below_min',      -- xả sâu dưới SOC min (vd <20%)
  'overpower',          -- vượt công suất cho phép
  'fast_charge_excess', -- sạc nhanh quá mức quy định
  'duration_exceeded'   -- vượt thời lượng cho phép
);
CREATE TYPE risk_level AS ENUM ('low', 'medium', 'high');

CREATE TABLE violations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id  uuid NOT NULL REFERENCES vehicles (id),
  policy_id   uuid REFERENCES charging_policies (id), -- chính sách (đúng version) bị vi phạm
  session_id  uuid REFERENCES charging_sessions (id),
  type        violation_type NOT NULL,
  evidence    jsonb NOT NULL, -- snapshot bất biến (NF-11)
  risk_level  risk_level NOT NULL DEFAULT 'low',
  detected_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_violations_vehicle_time ON violations (vehicle_id, detected_at DESC);

CREATE TRIGGER violations_append_only
  BEFORE UPDATE OR DELETE ON violations
  FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
