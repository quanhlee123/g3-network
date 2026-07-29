-- F-F1 · Migration 0013 — đăng nhập bằng OTP qua SĐT (sheet 9: tài khoản & RBAC).
-- Tài xế Việt Nam dùng SĐT chứ không dùng email → users cần cột phone.
-- Phase 1: OTP do bản mock ISmsSender in ra console, KHÔNG gửi SMS thật (quy tắc 12).
-- Bảng thách thức OTP lưu BĂM của mã (không lưu mã thô — nếu lộ DB vẫn không đăng nhập được),
-- có hạn dùng + đếm số lần sai để chống dò mã (6 chữ số = 1 triệu tổ hợp).

-- SĐT GIẢ 100% ở Phase 1, tiền tố 09000000xx (dải không được cấp phát thật)
ALTER TABLE users ADD COLUMN phone text UNIQUE;
CREATE INDEX idx_users_phone_active ON users (phone) WHERE is_active;

CREATE TABLE auth_otp_challenges (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone        text NOT NULL,
  -- sha256(phone + ':' + code + ':' + OTP_PEPPER) dạng hex — xem apps/api/src/auth/otp.ts
  code_hash    text NOT NULL,
  user_id      uuid REFERENCES users (id), -- NULL khi SĐT không tồn tại (vẫn ghi để chống dò SĐT)
  attempts     smallint NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz, -- mã đã dùng: không cho dùng lại
  created_at   timestamptz NOT NULL DEFAULT now()
);
-- Truy vấn chủ đạo: lấy thách thức mới nhất còn hiệu lực của 1 SĐT
CREATE INDEX idx_otp_phone_time ON auth_otp_challenges (phone, created_at DESC);
