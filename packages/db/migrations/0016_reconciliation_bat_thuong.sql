-- F-C6 · Migration 0016 — cho phép reconciliation_results ghi được các phiên BẤT THƯỜNG.
--
-- Phát hiện khi review: hai ràng buộc của 0015 làm chính job đối soát NÉM LỖI đúng vào
-- những phiên mà NF-10 sinh ra để bắt. Một phiên hỏng là cả lượt chạy dừng giữa chừng,
-- các phiên sau không được đối soát.
--
-- 1. CHECK (kwh_xe >= 0): SOC có thể GIẢM trong khoảng thời gian trụ báo đang sạc —
--    trụ tính tiền năng lượng pin không hề nhận, hoặc giờ thiết bị lệch. Giá trị âm ở đây
--    là THÔNG TIN CHẨN ĐOÁN, không phải dữ liệu rác: bỏ ràng buộc để ghi lại đúng con số.
--    Giữ nguyên CHECK cho kwh_tru và kwh_thanh_toan vì hai nguồn đó không thể âm
--    (công tơ và số tiền giao dịch đều >= 0 ngay từ bảng gốc).
-- 2. numeric(7,3) cho các cột phần trăm chỉ chứa tới 9999.999. Phiên công tơ hỏng
--    (vd 0,001 kWh) cho tỉ lệ lệch hàng triệu phần trăm → tràn cột. Nới lên numeric(12,3).

ALTER TABLE reconciliation_results DROP CONSTRAINT reconciliation_results_kwh_xe_check;

ALTER TABLE reconciliation_results
  ALTER COLUMN lech_xe_pct   TYPE numeric(12, 3),
  ALTER COLUMN lech_tien_pct TYPE numeric(12, 3),
  ALTER COLUMN lech_max_pct  TYPE numeric(12, 3);
