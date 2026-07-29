-- F-G1 · Migration 0010 — hạ tầng ingest telemetry (Prompt 05 phần 1).
-- 1) telemetry_quarantine: bản ghi sai schema / VIN lạ KHÔNG drop lặng lẽ mà cách ly
--    tại đây kèm lý do, phục vụ điều tra chất lượng dữ liệu (NF-14) — xem ADR-004.
-- 2) alert_type thêm 'data_quality': ingest sinh alert khi có bản ghi vào quarantine.

CREATE TABLE telemetry_quarantine (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at    timestamptz NOT NULL, -- giờ ingest NHẬN bản tin (không phải giờ thiết bị)
  topic          text NOT NULL,
  raw_payload    text NOT NULL, -- giữ nguyên payload thô, kể cả khi không parse được JSON
  schema_version smallint,      -- NULL nếu không đọc được từ payload
  reason         text NOT NULL, -- vd 'json_khong_hop_le', 'sai_schema_v1', 'vin_khong_ton_tai'
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_quarantine_received ON telemetry_quarantine (received_at DESC);
CREATE INDEX idx_quarantine_reason ON telemetry_quarantine (reason, received_at DESC);

-- PostgreSQL 12+ cho phép ADD VALUE trong transaction, miễn là không DÙNG giá trị mới
-- trong cùng transaction (ingest chỉ dùng lúc runtime).
ALTER TYPE alert_type ADD VALUE 'data_quality';
