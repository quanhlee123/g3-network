-- F-A2 · Migration 0018 — ngưỡng cảnh báo pin CẤU HÌNH ĐƯỢC theo đội/xe.
-- Trước migration này ngưỡng 30/20/10 là hằng số cứng trong services/ingest/src/battery-alerts.ts.
-- Sheet 4 F-A2 nói ngưỡng là tham số vận hành: xe đường dài / xe nội đô / đội có trạm riêng
-- cần mốc khác nhau. Đổi ngưỡng KHÔNG được đòi deploy lại.
--
-- Thứ tự ưu tiên khi tra: XE cụ thể > ĐỘI (customer) > MẶC ĐỊNH toàn hệ.
-- Ba dòng mặc định dưới đây đúng bằng 30/20/10 của PRD nên hành vi hiện tại KHÔNG đổi.

CREATE TABLE battery_alert_thresholds (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Cả hai NULL = dòng MẶC ĐỊNH toàn hệ. Đúng một trong hai khác NULL = ngưỡng riêng.
  customer_id  uuid REFERENCES customers (id) ON DELETE CASCADE,
  vehicle_id   uuid REFERENCES vehicles (id) ON DELETE CASCADE,
  -- 'som' = 30% · 'chinh' = 20% · 'nguy_cap' = 10% (ba mức của F-A2, ánh xạ severity 1/2/3)
  muc          text NOT NULL CHECK (muc IN ('som', 'chinh', 'nguy_cap')),
  nguong_pct   numeric(5, 2) NOT NULL CHECK (nguong_pct > 0 AND nguong_pct <= 100),
  -- Biên trễ chống rung (ADR-006): SOC phải hồi lên trên nguong_pct + bien_tre_pct
  -- thì ngưỡng đó mới "nạp đạn" lại.
  bien_tre_pct numeric(5, 2) NOT NULL DEFAULT 5 CHECK (bien_tre_pct >= 0),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  -- Không cho vừa gắn xe vừa gắn đội: một dòng chỉ thuộc đúng một cấp phạm vi.
  CONSTRAINT battery_alert_thresholds_pham_vi_check
    CHECK (customer_id IS NULL OR vehicle_id IS NULL),
  -- NULLS NOT DISTINCT (PostgreSQL 15+): coi hai NULL là BẰNG NHAU, nhờ vậy ràng buộc này
  -- chặn được cả việc tạo hai dòng mặc định toàn hệ cho cùng một mức.
  UNIQUE NULLS NOT DISTINCT (customer_id, vehicle_id, muc)
);

CREATE INDEX idx_battery_thresholds_vehicle ON battery_alert_thresholds (vehicle_id)
  WHERE vehicle_id IS NOT NULL;
CREATE INDEX idx_battery_thresholds_customer ON battery_alert_thresholds (customer_id)
  WHERE customer_id IS NOT NULL;

-- Mặc định toàn hệ = đúng ba mức PRD (sheet 4 F-A2: 30% sớm / 20% chính / 10% nguy cấp).
INSERT INTO battery_alert_thresholds (customer_id, vehicle_id, muc, nguong_pct) VALUES
  (NULL, NULL, 'som',      30),
  (NULL, NULL, 'chinh',    20),
  (NULL, NULL, 'nguy_cap', 10);

-- ---------------------------------------------------------------------------
-- Đổi dạng dedup_key của cảnh báo pin: 'F-A2:<xe>:20' → 'F-A2:<xe>:chinh'
--
-- VÌ SAO PHẢI ĐỔI: khoá cũ nhúng CON SỐ ngưỡng. Khi ngưỡng còn là hằng số cứng thì vô hại,
-- nhưng giờ vận hành đổi được ngưỡng — đổi 20 → 25 thì cảnh báo đang mở mang khoá ...:20
-- KHÔNG BAO GIỜ được đóng nữa (không còn ngưỡng 20 để so), đồng thời bắn thêm một cảnh
-- báo mới mang khoá ...:25. Khoá theo MỨC ('chinh') thì đổi ngưỡng bao nhiêu cũng đúng.
--
-- An toàn với dữ liệu đang có: tới trước migration này mọi cảnh báo F-A2 đều sinh từ hằng
-- số 30/20/10, nên ánh xạ số → mức là xác định. Cảnh báo đã resolved cũng đổi để lịch sử
-- đọc được nhất quán.
-- ---------------------------------------------------------------------------
UPDATE alerts SET dedup_key = regexp_replace(dedup_key, ':30$', ':som')
  WHERE dedup_key LIKE 'F-A2:%:30';
UPDATE alerts SET dedup_key = regexp_replace(dedup_key, ':20$', ':chinh')
  WHERE dedup_key LIKE 'F-A2:%:20';
UPDATE alerts SET dedup_key = regexp_replace(dedup_key, ':10$', ':nguy_cap')
  WHERE dedup_key LIKE 'F-A2:%:10';
