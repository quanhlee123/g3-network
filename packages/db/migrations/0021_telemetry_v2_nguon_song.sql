-- F-J1/F-J3 · Migration 0021 — thêm ĐIỆN ÁP NGUỒN và CƯỜNG ĐỘ SÓNG vào bản ghi telemetry.
-- NF-16 / quy tắc 8: đây là thay đổi schema → migration MỚI + tăng TELEMETRY_SCHEMA_VERSION
-- lên 2 (packages/shared). KHÔNG sửa migration 0003 đã merge.
--
-- VÌ SAO CẦN: F-J3 phải phân biệt "mất nguồn đột ngột / bị tháo thiết bị" với "mất sóng".
-- Dữ liệu hiện có KHÔNG đủ để phân biệt:
--   · battery_voltage_v là điện áp PACK PIN KÉO XE (320–690V), không phải nguồn nuôi
--     thiết bị telematics. Pin kéo còn đầy mà ai đó rút dây nguồn hộp telematics thì
--     battery_voltage_v vẫn đẹp — không nói lên điều gì về việc thiết bị bị tháo.
--   · Không có trường nào cho chất lượng sóng, nên "mất sóng" không có bằng chứng.
--
-- Hai cột dưới đây NULLABLE vì bản ghi schema v1 (đã nằm trong bảng) không có chúng.

-- Điện áp nguồn nuôi hộp telematics: acquy phụ 12V/24V hoặc bộ hạ áp từ pack.
-- Bình thường ~12–14V (hệ 12V) hoặc ~24–28V (hệ 24V); tụt sâu = sắp mất nguồn.
ALTER TABLE telematics_readings ADD COLUMN supply_voltage_v numeric(5, 2);

-- Cường độ sóng di động (dBm, luôn âm): -60 khoẻ · -100 yếu · -113 gần như mất sóng.
ALTER TABLE telematics_readings ADD COLUMN signal_dbm smallint
  CHECK (signal_dbm IS NULL OR signal_dbm BETWEEN -140 AND 0);

COMMENT ON COLUMN telematics_readings.supply_voltage_v IS
  'Điện áp NGUỒN NUÔI thiết bị telematics (V) — khác battery_voltage_v là điện áp pack kéo xe. F-J3.';
COMMENT ON COLUMN telematics_readings.signal_dbm IS
  'Cường độ sóng di động (dBm, âm). Dùng để phân biệt mất sóng với mất nguồn. F-J3.';
