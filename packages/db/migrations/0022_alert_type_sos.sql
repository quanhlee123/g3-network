-- F-I2 · Migration 0022 — thêm hai loại cảnh báo cho luồng SOS.
-- Phải tách file riêng khỏi 0023 vì PostgreSQL cấm DÙNG giá trị enum mới trong cùng
-- transaction với ALTER TYPE ADD VALUE (cùng lý do như cặp 0010/0011 và 0014/0015).

-- Tài xế bấm nút CSKH/SOS (sheet 4 F-I2 — Must P1.0)
ALTER TYPE alert_type ADD VALUE 'sos';
-- Ticket quá hạn SLA mà chưa ai nhận → leo thang
ALTER TYPE alert_type ADD VALUE 'sla_breach';
