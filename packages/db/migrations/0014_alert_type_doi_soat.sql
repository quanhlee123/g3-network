-- F-C6 · Migration 0014 — thêm loại cảnh báo 'reconciliation_mismatch' (NF-10).
-- Sinh ra khi đối soát 3 chiều trụ (OCPP) ↔ xe (telematics) ↔ thanh toán lệch quá ngưỡng.
-- Phải tách file riêng khỏi 0015 vì PostgreSQL cấm DÙNG giá trị enum mới trong cùng
-- transaction với ALTER TYPE ADD VALUE (cùng lý do như cặp 0010/0011).

ALTER TYPE alert_type ADD VALUE 'reconciliation_mismatch';
