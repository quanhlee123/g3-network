-- F-I2 · Migration 0023 — ưu tiên ticket + đồng hồ SLA (nhận ticket / leo thang).
-- Sheet 4 F-I2: "gửi vị trí + mã lỗi cho CSKH; gọi lại ≤5 phút".
--
-- ⚠️ D-09 (định hướng nghiệp vụ Module I — CSKH & Dịch vụ) và Q6 (đơn vị nào trực 24/7)
-- vẫn ở trạng thái MỞ trong docs/DECISION-LOG.md. Phần dựng ở đây là KHUNG KỸ THUẬT:
-- nhận SOS, đính kèm ngữ cảnh xe, đếm giờ SLA, leo thang khi quá hạn. Quy trình gọi lại,
-- phân ca trực và cam kết dịch vụ thật là nội dung của D-09/Q6 — KHÔNG tự quyết ở đây.

CREATE TYPE ticket_priority AS ENUM ('thap', 'binh_thuong', 'cao', 'khan_cap');

ALTER TABLE tickets
  ADD COLUMN priority ticket_priority NOT NULL DEFAULT 'binh_thuong',
  -- Thời điểm CÓ NGƯỜI NHẬN xử lý. Khác resolved_at (đã xong). SLA "gọi lại ≤5 phút"
  -- đo tới mốc này chứ không tới lúc xong việc.
  ADD COLUMN acknowledged_at timestamptz,
  ADD COLUMN acknowledged_by uuid REFERENCES users (id),
  -- Đã leo thang lần nào chưa — để job chạy lại không bắn cảnh báo trùng.
  ADD COLUMN escalated_at timestamptz;

-- Truy vấn chủ đạo của job SLA: ticket đang mở, chưa ai nhận, đã quá hạn, chưa leo thang.
CREATE INDEX idx_tickets_sla_cho_nhan ON tickets (sla_due_at)
  WHERE acknowledged_at IS NULL AND escalated_at IS NULL;

-- Kênh nhận thông báo SOS và leo thang SLA (F-F3, migration 0017).
-- CSKH là vai trò XỬ LÝ (sheet 9, dòng "Ticket hỗ trợ & SOS" = ✓ xử lý) nên nhận đủ 3 kênh:
-- SOS là tình huống tài xế đang mắc kẹt, không được để lọt.
INSERT INTO notification_prefs (alert_type, role, channels, min_severity) VALUES
  ('sos',        'cskh',          '{push,in_app,sms}', 1),
  ('sos',        'admin',         '{push,in_app}',     1),
  ('sos',        'fleet_manager', '{push,in_app}',     1),
  -- Leo thang: chính vì CSKH đã KHÔNG phản hồi nên phải báo lên Admin, không chỉ báo lại CSKH.
  ('sla_breach', 'admin',         '{push,in_app,sms}', 1),
  ('sla_breach', 'cskh',          '{push,in_app}',     1);
