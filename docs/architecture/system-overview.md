# Kiến trúc tổng quan Phase 1 — giải thích sơ đồ

> Sơ đồ: [system-overview.mmd](system-overview.mmd) (mở bằng VS Code Mermaid preview hoặc mermaid.live).
> Nguồn gốc: ảnh trong sheet "4b. P1 Thiết kế" của `update by Duc.xlsx`, vẽ lại bằng Mermaid và
> HIỆU CHỈNH theo kiến trúc đã chốt trong [CLAUDE.md](../../CLAUDE.md).

## Hiệu chỉnh so với bản vẽ gốc của Đức

| Bản vẽ gốc | Bản hiệu chỉnh | Lý do |
|---|---|---|
| Hàng đợi thông điệp Kafka/RabbitMQ ở giữa hệ thống | BỎ — module gọi nhau trực tiếp trong monolith; telemetry đi qua EMQX (MQTT) | CLAUDE.md: modular monolith, KHÔNG Kafka/RabbitMQ ở Phase 1 |
| Đầu đọc RFID trên trụ + "Thẻ RFID" trong Identity & Access Service | BỎ | D-02 đang MỞ (RFID có trong bản vẽ, không có trong PRD) — không tự quyết |
| Các "Service" tách rời (microservices-style) | Các MODULE nghiệp vụ bên trong `apps/api` + 2 service giao thức (`services/ingest`, `services/csms`) trong cùng monorepo | Modular monolith; ingest/CSMS tách riêng chỉ vì giao thức MQTT/WebSocket chạy dài, vẫn chung DB & contracts |
| Relational DB + Redis Cache + Time-Series DB (3 kho riêng) | 1 PostgreSQL duy nhất, bật extension TimescaleDB (time-series) + PostGIS (không gian) | CLAUDE.md: PostgreSQL duy nhất; giảm công nghệ vận hành |
| Fraud & Anomaly Service ("Đối chiếu dữ liệu chéo Xe & Trụ sạc") | Module "Đối soát 3 chiều trụ–xe–thanh toán" (NF-10) | PRD v2.0 thêm chiều thanh toán; sai lệch kWh >1% phải cảnh báo |
| Không có | THÊM Policy & Warranty engine (Module B) | Thiếu trong bản vẽ dù là giá trị lõi (F-B1..B6, NF-11) |
| Không có | THÊM Payment gateway adapter (VNPay/Momo sandbox) | F-H1..H4; Phase 1 chỉ SANDBOX |
| Không có | THÊM Notification (FCM/SMS mock) | F-F3, F-F4; SMS fallback pin ≤10% |
| Không có | THÊM Device management (Module F-J) | F-J1..J3: sức khỏe thiết bị, OTA config, cảnh báo tamper |
| Không có | THÊM E-invoice adapter (mock) | F-H3 hóa đơn điện tử kWh |

## Map khối → thư mục repo → mã F-xx

| Khối trên sơ đồ | Thư mục trong repo | Mã F-xx / NF-xx |
|---|---|---|
| Thiết bị telematics trên xe (giả lập) | `simulators/vehicle-sim` | F-G1 (mock), F-A1 |
| Trụ sạc OCPP (giả lập) | `simulators/ocpp-sim` | F-G2 (mock) |
| App tài xế | `apps/mobile` (React Native + Expo) | F-D1..D5, F-H1 (UI), F-I2 (nút SOS), NF-12, NF-13 |
| Portal đội xe & quản trị | `apps/portal` (Next.js) | F-E1..E4, F-B4 (dashboard bảo hành), F-C1 (CRUD trạm) |
| EMQX MQTT broker | `infra/docker-compose.yml` (service `emqx`) | NF-01, NF-04 |
| Telemetry ingest + đánh giá ngưỡng pin | `services/ingest` | F-G1, F-A1, **F-A2**, NF-01 |
| CSMS / OCPP Gateway | `services/csms` (OCPP 1.6J WebSocket, tham chiếu SteVe) | F-G2, F-C2, NF-02 |
| API REST + OpenAPI | `apps/api` (Fastify — D-04 đã chốt) | Tất cả module A–K, NF-18 |
| Module Telematics (đọc & phục vụ API) | `apps/api` (module A) — *sinh* cảnh báo pin nằm ở `services/ingest` để đạt "≤30s khi chạm ngưỡng" mà không cần job quét | F-A1..A6 |
| Policy & Warranty engine | `apps/api` (module B) | F-B1..B6, NF-11 |
| Module Quản lý trạm sạc | `apps/api` (module C) | F-C1..C6 |
| Module Phiên sạc & Billing | `apps/api` | F-B2, F-C6, F-H1..H4 |
| Module Đối soát 3 chiều | `apps/api` (`src/modules/reconciliation`, chạy định kỳ trong tiến trình API + chạy tay) | NF-10, F-C6 |
| Tài khoản & RBAC + audit log | `apps/api` | F-F1, F-F2, NF-06 (audit vị trí — xem [09-rbac.md](../prd/09-rbac.md)) |
| Notification (FCM/SMS mock) | `apps/api` + adapter trong `packages/contracts` | F-F3, F-F4 |
| Device management | `apps/api` (module F-J) | F-J1..J3 |
| CSKH & SOS | `apps/api` (module I) | F-I1..I3 |
| Payment gateway adapter | `packages/contracts` (interface + mock sandbox) | F-H1..H4 |
| E-invoice adapter | `packages/contracts` (interface + mock) | F-H3 |
| Map adapter | `packages/contracts` (interface + mock — nhà cung cấp chờ Q5) | F-D1..D3 |
| Push/SMS adapter | `packages/contracts` (interface + mock) | F-F3 |
| PostgreSQL + TimescaleDB + PostGIS | `infra/docker-compose.yml` (service `db`), migration tại `infra/db` | NF-10, NF-11, NF-16; bảng `charging_sessions`, `violations` APPEND-ONLY |

Nguyên tắc (CLAUDE.md quy tắc 2): mọi tích hợp ngoài (telematics, OCPP, thanh toán, bản đồ, SMS/push, hóa đơn điện tử) đi qua interface trong `packages/contracts/`, mỗi interface luôn có ít nhất 1 bản mock hoạt động được; logic nghiệp vụ không gọi thẳng SDK ngoài.
