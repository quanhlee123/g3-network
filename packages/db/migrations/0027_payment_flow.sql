-- F-H1 · Migration 0027 — luồng thanh toán phiên sạc (SANDBOX).
--
-- Migration 0007 đã có payment_transactions với gateway_webhook_id UNIQUE (chống webhook
-- trùng). Migration này bổ sung đúng những gì luồng QR thật sự cần, và tất cả đều xuất phát
-- từ MỘT sự thật khó chịu về thứ tự thời gian:
--
--   Tiền có thể về TRƯỚC khi phiên sạc được ghi.
--
-- Trụ mất kết nối giữa phiên rồi gửi StopTransaction bù sau (chuyện thường, NF-09) trong khi
-- người dùng đã bấm trả tiền xong. Nếu payment_transactions bắt buộc phải có session_id ngay
-- thì webhook đến sớm chỉ còn hai lựa chọn tồi: từ chối (mất tiền đã thu) hoặc tạo phiên giả
-- (bịa bản ghi vào bảng append-only có giá trị pháp lý). Cả hai đều không chấp nhận được.
--
-- Cách giải: giao dịch neo vào `ocpp_transaction_id` — thứ có từ lúc trụ mở phiên, TRƯỚC khi
-- charging_sessions có dòng. Khi phiên đóng thì nối lại bằng đúng mã đó.

ALTER TABLE payment_transactions
  -- Mã tham chiếu của G3 gửi sang cổng; cổng trả lại nguyên vẹn trong webhook.
  -- UNIQUE: một mã chỉ ứng với một lần thu tiền.
  ADD COLUMN reference           text UNIQUE,
  -- Neo vào phiên OCPP. Có giá trị từ lúc trụ StartTransaction, sống sót qua việc
  -- charging_sessions chưa kịp có dòng.
  ADD COLUMN ocpp_transaction_id text,
  ADD COLUMN vehicle_id          uuid REFERENCES vehicles (id),
  ADD COLUMN station_id          uuid REFERENCES charging_stations (id),
  -- kWh dùng để tính tiền, ghi lại để đối chiếu khi khách thắc mắc hoá đơn
  ADD COLUMN energy_kwh          numeric(9, 3) CHECK (energy_kwh >= 0),
  ADD COLUMN gia_vnd_moi_kwh     numeric(12, 2) CHECK (gia_vnd_moi_kwh > 0),
  ADD COLUMN pay_url             text,
  ADD COLUMN expires_at          timestamptz,
  ADD COLUMN paid_at             timestamptz,
  -- Toàn bộ payload webhook đã xác thực chữ ký — bằng chứng đối soát với sao kê của cổng.
  -- KHÔNG chứa dữ liệu thẻ: cổng không gửi và hệ mình không nhận (quy tắc: không lưu thẻ).
  ADD COLUMN webhook_payload     jsonb;

COMMENT ON COLUMN payment_transactions.ocpp_transaction_id IS
  'Neo giao dịch vào phiên OCPP để webhook đến TRƯỚC khi charging_sessions có dòng vẫn ghi nhận được (F-H1)';
COMMENT ON COLUMN payment_transactions.webhook_payload IS
  'Payload webhook đã xác thực chữ ký. TUYỆT ĐỐI không chứa dữ liệu thẻ (tokenization ở cổng).';

-- Ràng buộc cũ đòi phải có session_id hoặc subscription_ref. Giờ `reference` cũng là một
-- neo hợp lệ — đó chính là trường hợp giao dịch tạo ra trước khi phiên sạc được ghi.
ALTER TABLE payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_check;
ALTER TABLE payment_transactions
  ADD CONSTRAINT payment_transactions_co_neo
  CHECK (session_id IS NOT NULL OR subscription_ref IS NOT NULL OR reference IS NOT NULL);

CREATE INDEX idx_payments_reference ON payment_transactions (reference);
-- Tìm giao dịch mồ côi (đã thu tiền, chưa nối được phiên) để nối lại khi phiên về muộn
CREATE INDEX idx_payments_cho_noi_phien ON payment_transactions (ocpp_transaction_id)
  WHERE session_id IS NULL AND ocpp_transaction_id IS NOT NULL;
CREATE INDEX idx_payments_status_time ON payment_transactions (status, created_at DESC);
