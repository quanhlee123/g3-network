-- F-G4 · Migration 0001 — thực thể lõi sheet 8 PRD: customers, users, drivers, vehicles, devices, batteries.
-- NF-06 (định danh thiết bị mTLS, thu hồi được) · Nghị định 13/2023 (consent tài xế).
-- Dữ liệu GIẢ 100% (quy tắc 12): VIN/SĐT/ICCID đều là chuỗi mô phỏng.

CREATE TYPE user_role AS ENUM (
  'driver',          -- Tài xế
  'fleet_manager',   -- Chủ xe / Quản lý đội
  'energy_ops',      -- Vận hành G3 Energy
  'warranty_admin',  -- Bảo hành G3 Mobility
  'cskh',            -- CSKH Holding
  'admin',           -- Admin G3 Network
  'sale'             -- Sale Holding
);
CREATE TYPE vehicle_model AS ENUM ('EVT-262', 'EVT-400', 'EVT-825');
CREATE TYPE warranty_state AS ENUM ('active', 'at_risk', 'void');
CREATE TYPE service_plan AS ENUM ('basic', 'standard');
CREATE TYPE device_power_status AS ENUM ('normal', 'low', 'lost');

-- Khách hàng / đơn vị sở hữu đội xe (sheet 8: customer_id + hợp đồng + gói)
CREATE TABLE customers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  contract_no  text UNIQUE,
  service_plan service_plan NOT NULL DEFAULT 'standard',
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Tài khoản người dùng (sheet 8: user_id + vai trò; RBAC sheet 9)
CREATE TABLE users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL UNIQUE,
  full_name   text NOT NULL,
  role        user_role NOT NULL,
  customer_id uuid REFERENCES customers (id), -- NULL với vai trò nội bộ G3/Holding
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Tài xế (sheet 8: driver_id + xe gán + consent dữ liệu — Nghị định 13/2023)
CREATE TABLE drivers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL UNIQUE REFERENCES users (id),
  phone           text, -- SĐT GIẢ
  license_no      text,
  consent_at      timestamptz, -- thời điểm tài xế đồng ý xử lý dữ liệu cá nhân (vị trí…)
  consent_version text,        -- phiên bản văn bản đồng ý đã ký
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Xe (sheet 8: VIN; dòng EVT-262/400/825; chủ xe; ngày bàn giao; bảo hành; gói)
CREATE TABLE vehicles (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vin                text NOT NULL UNIQUE, -- VIN GIẢ, tiền tố G3-SIM
  model              vehicle_model NOT NULL,
  customer_id        uuid NOT NULL REFERENCES customers (id),
  assigned_driver_id uuid REFERENCES drivers (id),
  handover_date      date,
  warranty_state     warranty_state NOT NULL DEFAULT 'active',
  service_plan       service_plan NOT NULL DEFAULT 'standard',
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_vehicles_customer ON vehicles (customer_id);

-- Thiết bị telematics (sheet 8 — MỚI v2.0: firmware, SIM/ICCID, last_seen, nguồn, mTLS)
CREATE TABLE devices (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_serial    text NOT NULL UNIQUE,
  vehicle_id       uuid UNIQUE REFERENCES vehicles (id), -- 1 thiết bị gắn tối đa 1 xe
  firmware_version text,
  sim_iccid        text, -- ICCID GIẢ
  mtls_identity    text UNIQUE, -- NF-06: định danh mTLS/token duy nhất theo thiết bị
  revoked_at       timestamptz, -- NF-06: thu hồi định danh khi mất thiết bị
  last_seen_at     timestamptz,
  power_status     device_power_status NOT NULL DEFAULT 'normal',
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Pack pin (sheet 8: pack_id; hóa chất; dung lượng; SOH; chu kỳ — SOC/điện áp/nhiệt độ
-- là dữ liệu thời gian thực nằm ở telematics_readings)
CREATE TABLE batteries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id      text NOT NULL UNIQUE,
  vehicle_id   uuid NOT NULL REFERENCES vehicles (id),
  chemistry    text NOT NULL DEFAULT 'LFP', -- vd LFP (CATL)
  capacity_kwh numeric(7, 2) NOT NULL CHECK (capacity_kwh > 0),
  soh_pct      numeric(5, 2) CHECK (soh_pct BETWEEN 0 AND 100),
  cycle_count  integer NOT NULL DEFAULT 0 CHECK (cycle_count >= 0),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_batteries_vehicle ON batteries (vehicle_id);
