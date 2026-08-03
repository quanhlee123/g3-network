-- F-B3 · Migration 0025 — hồ sơ ĐỐI CHIẾU phiên sạc với chính sách, và ngưỡng "thường xuyên".
--
-- Ba việc:
--   1. Bảng violation_checks: mỗi phiên sạc đã đối chiếu để lại ĐÚNG 1 dòng, kể cả khi
--      KHÔNG có vi phạm.
--   2. charging_policies thêm 2 ngưỡng cho tiêu chí "thường xuyên" của F-B3.
--   3. violations thêm khoá tự nhiên (session_id, type) để chạy lại job không nhân đôi.
--
-- Vì sao phải ghi cả phiên SẠCH: "không có dòng vi phạm" và "chưa từng được đối chiếu" là
-- hai chuyện hoàn toàn khác nhau khi tranh chấp bảo hành. Bên bảo hành cần chứng minh được
-- "phiên này ĐÃ được xét, theo chính sách version N, và kết luận là đạt" — không có bảng này
-- thì im lặng bị hiểu thành chưa kiểm tra, và cả hồ sơ mất sức thuyết phục (NF-11).

-- ---------------------------------------------------------------------------
-- 1) Ngưỡng "thường xuyên" (F-B3: "thường xuyên >90% hoặc <20%")
--
-- ⚠️ PRD KHÔNG cho con số. Hai cột này để NULL nghĩa là dùng mặc định toàn hệ
-- (VIOLATION_SOC_BREACH_COUNT / VIOLATION_SOC_BREACH_WINDOW_DAYS). Bản thân con số mặc định
-- CHƯA được Bảo hành Mobility hay Legal ký — xem docs/adr/ADR-011 và Q4 (MỞ).
-- ---------------------------------------------------------------------------
ALTER TABLE charging_policies
  ADD COLUMN soc_breach_count       integer CHECK (soc_breach_count > 0),
  ADD COLUMN soc_breach_window_days integer CHECK (soc_breach_window_days > 0);

COMMENT ON COLUMN charging_policies.soc_breach_count IS
  'Số lần chạm ngưỡng SOC trong cửa sổ thì coi là "thường xuyên" (F-B3). NULL = theo mặc định toàn hệ.';

-- ---------------------------------------------------------------------------
-- 2) Hồ sơ đối chiếu từng phiên
-- ---------------------------------------------------------------------------
CREATE TABLE violation_checks (
  session_id      uuid PRIMARY KEY REFERENCES charging_sessions (id),
  vehicle_id      uuid NOT NULL REFERENCES vehicles (id),
  -- Chính sách (ĐÚNG VERSION) đã dùng làm căn cứ; NULL = không có chính sách nào áp cho xe
  -- tại thời điểm sạc, và đó cũng là một kết luận cần ghi lại.
  policy_id       uuid REFERENCES charging_policies (id),
  started_at      timestamptz NOT NULL,
  so_vi_pham      integer NOT NULL DEFAULT 0 CHECK (so_vi_pham >= 0),
  -- Hai cờ SỰ KIỆN của riêng phiên này (chưa phải kết luận vi phạm). Tiêu chí "thường xuyên"
  -- đếm chính hai cột này trong cửa sổ thời gian — nhờ vậy mỗi phiên được xét theo ĐÚNG
  -- version chính sách của nó, rồi mới cộng lại.
  soc_tren_max    boolean NOT NULL DEFAULT false,
  soc_duoi_min    boolean NOT NULL DEFAULT false,
  ghi_chu         text,
  checked_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_violation_checks_xe_time ON violation_checks (vehicle_id, started_at DESC);
-- Đếm nhanh "bao nhiêu lần chạm ngưỡng SOC trong N ngày qua"
CREATE INDEX idx_violation_checks_soc ON violation_checks (vehicle_id, started_at DESC)
  WHERE soc_tren_max OR soc_duoi_min;

-- ---------------------------------------------------------------------------
-- 3) Chạy lại job KHÔNG được nhân đôi vi phạm
--
-- violations là append-only nên không sửa lại được: một dòng thừa là một dòng thừa VĨNH VIỄN
-- trong hồ sơ bảo hành. Khoá duy nhất ở tầng DB là chốt chặn cuối, không tin vào việc tầng
-- ứng dụng nhớ kiểm tra.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX idx_violations_phien_loai ON violations (session_id, type)
  WHERE session_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4) F-B5: TÀI XẾ phải nhận được cảnh báo vi phạm
--
-- Migration 0017 cấu hình 'charging_violation' cho QL đội / Bảo hành / Admin nhưng THIẾU
-- tài xế — trong khi F-B5 ghi rõ "cảnh báo TÀI XẾ/chủ xe … nêu rõ hành vi & cách khắc phục".
-- Người trực tiếp đổi được hành vi sạc là tài xế; báo cho mọi người trừ tài xế thì cảnh báo
-- không dẫn tới hành động nào. Sheet 9 dòng "Nhận cảnh báo pin / bất thường": Tài xế ✓.
-- Kênh push + in-app, KHÔNG SMS: đây là vi phạm hợp đồng, không phải nguy hiểm tính mạng.
-- ---------------------------------------------------------------------------
INSERT INTO notification_prefs (alert_type, role, channels, min_severity)
VALUES ('charging_violation', 'driver', '{push,in_app}', 1)
ON CONFLICT (alert_type, role) DO NOTHING;
