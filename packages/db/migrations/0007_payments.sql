-- F-G4 · Migration 0007 — giao dịch thanh toán (sheet 8 — MỚI v2.0: PaymentTransaction; F-H1).
-- Phase 1: chỉ SANDBOX, không dữ liệu thẻ (tokenization ở cổng). gateway_webhook_id UNIQUE
-- để chống webhook đến 2 lần (quy tắc 7).

CREATE TYPE payment_method AS ENUM ('vnpay', 'momo', 'wallet');
CREATE TYPE payment_status AS ENUM ('pending', 'succeeded', 'failed', 'refunded');

CREATE TABLE payment_transactions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         uuid REFERENCES charging_sessions (id),
  subscription_ref   text, -- billing thuê bao (P1.5) — tham chiếu mềm
  method             payment_method NOT NULL,
  amount_vnd         numeric(12, 0) NOT NULL CHECK (amount_vnd >= 0), -- VNĐ (NF-17)
  status             payment_status NOT NULL DEFAULT 'pending',
  gateway_ref        text,        -- mã đối soát phía cổng thanh toán (sandbox)
  gateway_webhook_id text UNIQUE, -- idempotency: webhook trùng bị từ chối ở DB
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (session_id IS NOT NULL OR subscription_ref IS NOT NULL)
);
CREATE INDEX idx_payments_session ON payment_transactions (session_id);
