-- F-A4 · Migration 0019 — luật phát hiện bất thường pin (AN TOÀN CHÁY NỔ — Must).
-- Sheet 4 F-A4: "Nhiệt độ pin cao, sụt áp đột ngột, lỗi cell/module, lỗi motor → sinh cảnh
-- báo & log sự kiện", tiêu chí: "Cảnh báo realtime khi vượt ngưỡng an toàn; log kèm snapshot".
--
-- Ngưỡng nằm trong BẢNG, không hardcode: đây là con số an toàn, khi nhà sản xuất pin đưa
-- thông số thật thì vận hành phải sửa được ngay, không chờ deploy.
-- Phạm vi giống F-A2: XE > ĐỘI > MẶC ĐỊNH toàn hệ.

CREATE TYPE anomaly_kind AS ENUM (
  'nhiet_do_cao',     -- nhiệt độ pack pin vượt ngưỡng an toàn
  'sut_ap_dot_ngot',  -- điện áp pack rơi quá nhanh (nghi chập/hỏng cell)
  'ma_loi_bms'        -- BMS/motor báo mã lỗi nằm trong danh sách nghiêm trọng
);

CREATE TABLE anomaly_rules (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         anomaly_kind NOT NULL,
  -- Cả hai NULL = dòng MẶC ĐỊNH toàn hệ (giống battery_alert_thresholds — migration 0018)
  customer_id  uuid REFERENCES customers (id) ON DELETE CASCADE,
  vehicle_id   uuid REFERENCES vehicles (id) ON DELETE CASCADE,

  -- Ý nghĩa nguong_so theo từng kind:
  --   nhiet_do_cao    → °C, cảnh báo khi battery_temp_c >= nguong_so
  --   sut_ap_dot_ngot → VOLT, cảnh báo khi điện áp rơi >= nguong_so trong cua_so_giay
  --   ma_loi_bms      → không dùng (NULL)
  nguong_so    numeric(8, 2),
  -- Biên trễ để ĐÓNG cảnh báo: điều kiện phải hết hẳn (vượt ngược ngưỡng một khoảng)
  -- thì cảnh báo mới resolved — cùng nguyên lý chống rung của ADR-006.
  bien_tre_so  numeric(8, 2) NOT NULL DEFAULT 5,
  -- Chỉ dùng cho sut_ap_dot_ngot: khoảng thời gian tối đa giữa hai bản ghi đem so sánh.
  cua_so_giay  integer CHECK (cua_so_giay IS NULL OR cua_so_giay > 0),
  -- Chỉ dùng cho ma_loi_bms: danh sách mã lỗi coi là NGHIÊM TRỌNG.
  ma_loi       text[],

  severity     smallint NOT NULL DEFAULT 3 CHECK (severity BETWEEN 1 AND 3),
  enabled      boolean NOT NULL DEFAULT true,
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT anomaly_rules_pham_vi_check CHECK (customer_id IS NULL OR vehicle_id IS NULL),
  CONSTRAINT anomaly_rules_tham_so_check CHECK (
    (kind = 'nhiet_do_cao'    AND nguong_so IS NOT NULL) OR
    (kind = 'sut_ap_dot_ngot' AND nguong_so IS NOT NULL AND cua_so_giay IS NOT NULL) OR
    (kind = 'ma_loi_bms'      AND ma_loi IS NOT NULL AND cardinality(ma_loi) > 0)
  ),
  UNIQUE NULLS NOT DISTINCT (customer_id, vehicle_id, kind)
);

CREATE INDEX idx_anomaly_rules_vehicle ON anomaly_rules (vehicle_id) WHERE vehicle_id IS NOT NULL;
CREATE INDEX idx_anomaly_rules_customer ON anomaly_rules (customer_id) WHERE customer_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Giá trị MẶC ĐỊNH — ⚠️ CHƯA ĐƯỢC NHÀ SẢN XUẤT PIN XÁC NHẬN.
-- PRD không cho con số cụ thể, và đặc tả BMS của Tri-Ring vẫn nằm ở Q1 (docs/DECISION-LOG.md,
-- trạng thái MỞ). Ba con số dưới đây là mức kỹ thuật hợp lý để hệ thống chạy được trên
-- simulator, KHÔNG phải ngưỡng an toàn đã thẩm định:
--   · 55°C  — pack LFP vượt mức này là vùng phải can thiệp; simulator kịch bản (d) leo tới 60°C
--   · 30V/60s — pack 320–690V mà rơi 30V trong 1 phút là bất thường ở mọi dòng xe hiện có
--   · P0A80… — mã lỗi pack pin/điện áp cao; danh sách thật phải lấy từ tài liệu BMS
-- Trước Gate 1 phải thay bằng thông số nhà sản xuất (ghi trong ADR-009).
-- ---------------------------------------------------------------------------
INSERT INTO anomaly_rules (kind, nguong_so, bien_tre_so, cua_so_giay, ma_loi) VALUES
  ('nhiet_do_cao',    55, 5,  NULL, NULL),
  ('sut_ap_dot_ngot', 30, 10, 60,   NULL),
  ('ma_loi_bms',      NULL, 0, NULL, ARRAY['P0A80', 'P0A0D', 'P0AFA', 'P0A94']);
