-- F-G1 · Migration 0011 — cho phép alert 'data_quality' không gắn xe/thiết bị.
-- Bản tin vào quarantine vì VIN lạ / payload hỏng thì KHÔNG có vehicle_id/device_id hợp lệ,
-- nhưng vẫn phải sinh alert (không drop lặng lẽ). Phải tách file riêng khỏi 0010 vì
-- PostgreSQL cấm DÙNG giá trị enum mới trong cùng transaction với ALTER TYPE ADD VALUE.

ALTER TABLE alerts DROP CONSTRAINT alerts_check;
ALTER TABLE alerts ADD CONSTRAINT alerts_target_check
  CHECK (type = 'data_quality' OR vehicle_id IS NOT NULL OR device_id IS NOT NULL);
