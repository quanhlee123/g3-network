# Mô hình dữ liệu Phase 1 (F-G4)

> Nguồn yêu cầu: `docs/prd/08-du-lieu-tich-hop.md` (sheet 8, PRD v2.0).
> Schema nằm ở `packages/db/migrations/` (đánh số 0001–0012, quy tắc 9).
> Types TypeScript sinh từ schema: `npm run db:types` → `packages/shared/src/db-types.ts`.

## Nguyên tắc thiết kế

- **Append-only (NF-11):** `charging_sessions` và `violations` có trigger DB
  (`forbid_update_delete`) chặn mọi UPDATE/DELETE — bằng chứng pháp lý bảo hành bất biến.
  Vì vậy liên kết thanh toán đi theo chiều `payment_transactions.session_id`
  (phiên sạc không bao giờ phải sửa sau khi ghi).
- **Schema versioning (NF-16):** `telematics_readings.schema_version` có từ ngày 1,
  khớp hằng `TELEMETRY_SCHEMA_VERSION` ở `@g3/shared`. Đổi schema = migration mới + tăng version.
- **Retention (NF-16):** `telematics_readings` là hypertable TimescaleDB, retention hot
  mặc định 12 tháng, cấu hình qua `TELEMETRY_RETENTION_MONTHS` (áp khi `npm run db:migrate`).
  Cold 5 năm sẽ xử lý ở pipeline ETL (F-G3, giai đoạn sau).
- **Nghị định 13/2023:** `drivers.consent_at` + `drivers.consent_version` ghi nhận đồng ý
  xử lý dữ liệu cá nhân; `audit_logs` ghi mọi truy cập vị trí xe (ai, lúc nào, xe nào, lý do;
  CSKH bắt buộc kèm `ticket_id` đang mở — NF-06, sheet 9).
- **PostGIS:** `geography(Point, 4326)` cho vị trí trạm (`charging_stations.location`)
  và GPS telematics (`telematics_readings.position`).
- **Chống trùng/trễ:** khóa chính `(vehicle_id, time)` của telematics chặn bản ghi trùng
  (ingest dùng `ON CONFLICT DO NOTHING`); dữ liệu đến trễ (timestamp quá khứ) ghi bình thường.
  `payment_transactions.gateway_webhook_id UNIQUE` chống webhook đến 2 lần.

## Đối chiếu thực thể sheet 8 → bảng

| Thực thể sheet 8 | Bảng | Ghi chú |
|---|---|---|
| Xe (Vehicle) | `vehicles` | VIN giả, dòng `EVT-262/400/825`, chủ xe (`customer_id`), tài xế gán, bàn giao, bảo hành, gói |
| Thiết bị (Device) | `devices` | firmware, SIM/ICCID, `last_seen_at`, trạng thái nguồn, `mtls_identity` + `revoked_at` (NF-06) |
| Pin (Battery) | `batteries` | pack_id, hóa chất, dung lượng, SOH, chu kỳ (SOC/điện áp/nhiệt độ realtime nằm ở telematics) |
| Bản ghi telematics | `telematics_readings` | hypertable; `schema_version`; SOC, GPS, tốc độ, odometer, nhiệt độ, mã lỗi |
| Phiên sạc (ChargingSession) | `charging_sessions` | **append-only**; kWh, SOC đầu/cuối, công suất, chi phí VNĐ, `ocpp_transaction_id` |
| Giao dịch thanh toán | `payment_transactions` | VNPay/Momo/ví (sandbox), trạng thái, mã đối soát cổng, idempotency webhook |
| Trạm sạc (ChargingStation) | `charging_stations` | GPS PostGIS, khu vực, công suất, CCS2, giờ hoạt động, trạng thái |
| Trụ/Súng (Connector) | `connectors` | công suất, chuẩn, trạng thái `Available/Charging/Faulted/Unavailable` (OCPP) |
| Chính sách sạc (ChargingPolicy) | `charging_policies` | version + `(code, version)` unique; phạm vi xe/đội/dòng; ToU; SOC min–max; hiệu lực từ–đến |
| Vi phạm (Violation) | `violations` | **append-only**; `evidence` jsonb (snapshot phiên + ngưỡng chính sách), mức nguy cơ |
| Người dùng / Khách hàng / Tài xế | `users` / `customers` / `drivers` | vai trò sheet 9; hợp đồng + gói; consent Nghị định 13 |
| Cảnh báo (Alert) | `alerts` | loại phân cấp (F-A2/A4/J1/J3), `dedup_key` chống spam |
| Ticket | `tickets` | kênh (in-app/hotline/Zalo/SOS), SLA, ngữ cảnh xe jsonb |
| Audit log vị trí | `audit_logs` | NF-06 — không có trong sheet 8 nhưng bắt buộc theo sheet 9/quy tắc 5 |
| Bản tin telemetry hỏng | `telemetry_quarantine` | F-G1 — bản tin sai schema/VIN lạ cách ly kèm lý do, KHÔNG drop lặng lẽ (ADR-004); alert `data_quality` dedup 1 lần/giờ |
| Phiên OCPP đang mở | `ocpp_transactions` | F-G2 — bảng MUTABLE của CSMS (ADR-005): meter/SoC cập nhật theo MeterValues; StopTransaction mới tổng hợp thành 1 dòng `charging_sessions` bất biến |
| Thông báo đã gửi | `notifications` | F-F3 — vừa là hộp thư in-app vừa là lịch sử gửi mọi kênh; `status` gồm `suppressed` (bị rate-limit chặn, xem ADR-008) |
| Cấu hình kênh thông báo | `notification_prefs` | F-F3 — (loại alert × vai trò) → kênh + `min_severity`; chép từ sheet 9, có dòng mặc định cài sẵn trong migration |
| Token đẩy thiết bị | `push_tokens` | F-F3 — token FCM GIẢ ở Phase 1, thu hồi bằng `revoked_at` |
| Vùng geofence | `geofences` / `geofence_states` | F-A5 — đa giác `geography(Polygon,4326)` theo XE/ĐỘI/toàn hệ; bảng trạng thái giữ "đang trong hay ngoài" của từng (vùng, xe) để chỉ CHUYỂN TIẾP mới sinh cảnh báo, sống sót khi ingest restart |
| Luật bất thường pin | `anomaly_rules` | F-A4 — nhiệt độ / sụt áp / mã lỗi BMS, phạm vi XE > ĐỘI > mặc định; ⚠️ ba con số mặc định CHƯA được nhà sản xuất pin thẩm định (ADR-009, Q1 MỞ) |
| Ngưỡng cảnh báo pin | `battery_alert_thresholds` | F-A2 — ngưỡng 30/20/10 cấu hình theo XE > ĐỘI > mặc định toàn hệ; kèm biên trễ chống rung (ADR-006) |
| (P2) Lô hàng · Ghép nối · Đơn · Cước | — | ngoài phạm vi Phase 1, chưa dựng bảng |

## Sơ đồ ERD

```mermaid
erDiagram
    customers ||--o{ users : "tai khoan thuoc don vi"
    customers ||--o{ vehicles : "so huu"
    customers ||--o{ charging_policies : "chinh sach theo doi (fleet)"
    users ||--o| drivers : "ho so tai xe"
    users ||--o{ audit_logs : "truy cap vi tri"
    users ||--o{ tickets : "tao / xu ly"
    drivers ||--o{ vehicles : "duoc gan xe"
    vehicles ||--o| devices : "gan thiet bi"
    vehicles ||--o{ batteries : "pack pin"
    vehicles ||--o{ telematics_readings : "du lieu realtime"
    vehicles ||--o{ charging_sessions : "phien sac"
    vehicles ||--o{ violations : "vi pham"
    vehicles ||--o{ alerts : "canh bao"
    vehicles ||--o{ charging_policies : "chinh sach theo xe"
    devices ||--o{ telematics_readings : "nguon gui"
    charging_stations ||--o{ connectors : "tru/sung"
    charging_stations ||--o{ charging_sessions : "dien ra tai"
    connectors ||--o{ charging_sessions : "sac qua"
    charging_policies ||--o{ violations : "bi vi pham (dung version)"
    charging_sessions ||--o{ violations : "bang chung"
    charging_sessions ||--o{ payment_transactions : "thanh toan"
    tickets ||--o{ audit_logs : "can cu CSKH xem vi tri"

    vehicles {
        uuid id PK
        text vin UK "VIN GIA"
        vehicle_model model "EVT-262/400/825"
        uuid customer_id FK
        uuid assigned_driver_id FK
        date handover_date
        warranty_state warranty_state
    }
    devices {
        uuid id PK
        text device_serial UK
        uuid vehicle_id FK
        text sim_iccid
        text mtls_identity UK "NF-06"
        timestamptz last_seen_at
        device_power_status power_status
    }
    batteries {
        uuid id PK
        text pack_id UK
        uuid vehicle_id FK
        text chemistry
        numeric capacity_kwh
        numeric soh_pct
        int cycle_count
    }
    telematics_readings {
        timestamptz time PK "hypertable"
        uuid vehicle_id PK, FK
        smallint schema_version "NF-16"
        numeric soc_pct
        geography position
        numeric odometer_km
        jsonb fault_codes
    }
    charging_sessions {
        uuid id PK "APPEND-ONLY NF-11"
        uuid vehicle_id FK
        uuid station_id FK
        uuid connector_id FK
        text ocpp_transaction_id UK
        timestamptz started_at
        numeric energy_kwh
        numeric cost_vnd
    }
    violations {
        uuid id PK "APPEND-ONLY NF-11"
        uuid vehicle_id FK
        uuid policy_id FK
        uuid session_id FK
        violation_type type
        jsonb evidence
        risk_level risk_level
    }
    charging_policies {
        uuid id PK
        text code UK "unique cung version"
        int version UK
        policy_scope scope_type "vehicle/fleet/model"
        numeric soc_min_pct
        numeric soc_max_pct
        jsonb allowed_hours "ToU"
        timestamptz effective_from
        timestamptz effective_to
    }
    payment_transactions {
        uuid id PK
        uuid session_id FK
        payment_method method "sandbox"
        numeric amount_vnd
        payment_status status
        text gateway_webhook_id UK "chong webhook trung"
    }
    charging_stations {
        uuid id PK
        text code UK
        geography location "PostGIS"
        station_status status
    }
    connectors {
        uuid id PK
        uuid station_id FK
        int ocpp_connector_id "OCPP 1.6J"
        connector_status status
    }
    customers {
        uuid id PK
        text contract_no UK
        service_plan service_plan
    }
    users {
        uuid id PK
        text email UK
        user_role role "sheet 9"
        uuid customer_id FK
    }
    drivers {
        uuid id PK
        uuid user_id FK, UK
        timestamptz consent_at "Nghi dinh 13"
        text consent_version
    }
    alerts {
        uuid id PK
        alert_type type
        uuid vehicle_id FK
        smallint severity "1 som - 3 nguy cap"
        text dedup_key "chong spam F-A2"
    }
    tickets {
        uuid id PK
        ticket_channel channel
        ticket_status status
        uuid vehicle_id FK
        jsonb vehicle_context
        timestamptz sla_due_at
    }
    audit_logs {
        bigint id PK
        uuid user_id FK "ai"
        text action
        uuid vehicle_id FK "xe nao"
        text reason "ly do"
        uuid ticket_id FK "bat buoc voi CSKH"
        timestamptz occurred_at "luc nao"
    }
```

## Lệnh vận hành

| Việc | Lệnh |
|---|---|
| Chạy migration (+ áp retention từ env) | `npm run db:migrate` |
| Seed dữ liệu giả (20 xe, 6 trạm × 4 trụ, 7 tài khoản, 2 chính sách) | `npm run db:seed` |
| Sinh lại types sau migration mới | `npm run db:types` |
| Test DB (tự tạo database `g3_test` riêng) | `npm test -w packages/db` |
