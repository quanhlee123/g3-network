# G3 Network — Phase 1 (khung chạy trên simulator)

Nền tảng vận hành xe tải điện: telematics xe–pin, cảnh báo pin phân cấp, kiểm soát chính
sách sạc & bằng chứng bảo hành, quản lý trạm sạc (OCPP 1.6J), thanh toán phiên sạc
(sandbox), app tài xế + portal đội xe.

> Phase 1 chạy 100% trên **simulator** và **dữ liệu giả**: không phần cứng thật, không VIN
> thật, không tiền thật. Đọc `CLAUDE.md` trước khi làm bất cứ việc gì.

## Chạy toàn hệ trong 4 lệnh

Yêu cầu máy: **Node.js ≥ 22**, **Docker Desktop** (đang chạy), **Git**.

```bash
npm install                                        # 1. Cài phụ thuộc + tự tạo infra/.env từ .env.example
docker compose -f infra/docker-compose.yml up -d   # 2. Bật PostgreSQL (Timescale+PostGIS) và EMQX
npm run db:migrate && npm run db:seed              # 3. Dựng schema DB + seed dữ liệu giả (Prompt 03)
npm run dev                                        # 4. Chạy API (cổng 3000) + Portal (cổng 3100)
```

Kiểm tra nhanh sau khi chạy:

| Địa chỉ | Là gì |
|---|---|
| http://localhost:3000/health | API trả `{"status":"ok",...}` |
| http://localhost:3000/docs | Tài liệu OpenAPI (tự sinh) |
| http://localhost:3100 | Portal đội xe (trang chào) |
| http://localhost:18083 | Dashboard EMQX (user `admin`, mật khẩu trong `infra/.env`) |

## Sơ đồ thư mục

```
g3-network/
├── CLAUDE.md            # Quy tắc dự án — ĐỌC TRƯỚC TIÊN, mọi PR phải tuân thủ
├── apps/
│   ├── api/             # API Fastify + TypeBox (OpenAPI tự sinh) — cổng 3000
│   ├── portal/          # Portal đội xe Next.js — cổng 3100
│   └── mobile/          # App tài xế Expo/React Native — KHUNG TRỐNG, build ở Prompt 09 (chờ D-01)
├── packages/
│   ├── shared/          # Hằng số & tiện ích dùng chung + db-types.ts sinh từ schema (F-G4)
│   ├── db/              # Migration SQL đánh số + runner + seed + sinh types (F-G4, Prompt 03)
│   └── contracts/       # Interface cho MỌI tích hợp ngoài + mocks (quy tắc 2 — cấm gọi thẳng SDK)
├── services/
│   ├── ingest/          # Nhận telemetry xe–pin từ MQTT (logic thật ở Prompt 05)
│   └── csms/            # CSMS tự xây — OCPP 1.6J qua WebSocket (logic thật ở Prompt 05)
├── simulators/
│   ├── vehicle-sim/     # Giả lập xe tải điện (logic thật ở Prompt 04)
│   └── ocpp-sim/        # Giả lập trụ sạc OCPP (logic thật ở Prompt 05)
├── infra/
│   ├── docker-compose.yml  # PostgreSQL 16 + TimescaleDB + PostGIS (1 container) + EMQX
│   ├── .env.example        # Mẫu biến môi trường — copy thành .env (npm install tự làm)
│   └── db/init/            # SQL chạy lần đầu: bật extension timescaledb + postgis
├── docs/
│   ├── prd/             # PRD 14 file (đưa vào ở Prompt 02 — giữ nguyên mã F-xx/NF-xx)
│   ├── adr/             # Quyết định kiến trúc (ADR-001: chọn Fastify)
│   ├── architecture/    # Sơ đồ kiến trúc Mermaid
│   ├── handover/        # Tài liệu bàn giao
│   └── DECISION-LOG.md  # Nhật ký quyết định — mục MỞ thì KHÔNG tự quyết
├── scripts/             # Script tiện ích của repo (setup-env)
└── .github/             # CI (lint + test + gitleaks) và mẫu Pull Request
```

## Lệnh thường dùng

| Lệnh | Việc |
|---|---|
| `docker compose -f infra/docker-compose.yml up -d` + `npm run dev` | Khởi động toàn hệ |
| `npm run db:migrate` | Chạy migration DB (packages/db/migrations) + áp retention NF-16 |
| `npm run db:seed` | Seed dữ liệu GIẢ: 20 xe, 3 trạm × 4 trụ, 5 tài khoản, 2 chính sách |
| `npm run db:types` | Sinh lại types TypeScript từ schema DB (packages/shared/src/db-types.ts) |
| `npm test` | Toàn bộ test |
| `npm test -w apps/api` | Test 1 workspace |
| `npm run lint` | ESLint + Prettier check |
| `npm run sim:vehicles -- --count 20` | Giả lập 20 xe |
| `npm run sim:ocpp -- --stations 3` | Giả lập 3 trụ sạc |
| `npm run openapi:generate` | Sinh lại `apps/api/openapi.json` |
| `npm run gitleaks` | Quét secret toàn thư mục |

## Biến môi trường (`infra/.env.example`)

| Biến | Ý nghĩa |
|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Tài khoản PostgreSQL container `g3-db` |
| `DATABASE_URL` | Chuỗi kết nối PostgreSQL cho ứng dụng |
| `MQTT_HOST` / `MQTT_PORT` / `MQTT_WS_PORT` / `MQTT_URL` | Kết nối EMQX (MQTT 1883, WebSocket 8083) |
| `EMQX_DASHBOARD__DEFAULT_PASSWORD` | Mật khẩu dashboard EMQX (http://localhost:18083) |
| `TELEMETRY_RETENTION_MONTHS` | Số tháng giữ dữ liệu telematics hot (NF-16, mặc định 12) — áp khi `npm run db:migrate` |
| `API_PORT` / `PORTAL_PORT` | Cổng API (3000) và Portal (3100) |
| `CSMS_WS_PORT` | Cổng WebSocket CSMS cho OCPP (dùng từ Prompt 05) |

Quy tắc: **không hardcode secret** — biến mới phải thêm vào `infra/.env.example`
(không kèm giá trị thật) và ghi chú vào bảng trên. `infra/.env` không được commit.

## Quy trình đóng góp

1. Nhánh theo mã PRD: `feature/F-A2-canh-bao-pin`. Mã F-xx xuất hiện trong commit,
   comment đầu file và mô tả PR (mẫu PR có sẵn khi tạo).
2. Pre-commit hook tự chạy lint-staged + gitleaks. CI chạy lint + test + gitleaks
   trên mọi push/PR — **test đỏ = không merge**.
3. Quyết định thiết kế mới → viết ADR nháp vào `docs/adr/` để con người duyệt.
   Mục đang MỞ trong `docs/DECISION-LOG.md` thì dừng lại hỏi, không tự quyết.

## Xử lý sự cố nhanh

- **`docker compose up` báo thiếu biến**: copy `infra/.env.example` → `infra/.env`
  (bình thường `npm install` tự làm).
- **Cổng bận (3000/3100/5432/1883)**: đổi cổng trong `infra/.env` hoặc tắt tiến trình
  đang chiếm cổng.
- **Container `g3-db` không healthy**: `docker logs g3-db`; xóa volume làm lại:
  `docker compose -f infra/docker-compose.yml down -v` (mất dữ liệu local).
