# G3 Network — Phase 1 (khung chạy trên simulator)

Nền tảng vận hành xe tải điện: telematics xe–pin, cảnh báo pin phân cấp, kiểm soát chính
sách sạc & bằng chứng bảo hành, quản lý trạm sạc (OCPP 1.6J), thanh toán phiên sạc
(sandbox), app tài xế + portal đội xe.

> Phase 1 chạy 100% trên **simulator** và **dữ liệu giả**: không phần cứng thật, không VIN
> thật, không tiền thật. Đọc `CLAUDE.md` trước khi làm bất cứ việc gì.

## DEMO GATE 0 — máy sạch, 3 lệnh

Yêu cầu máy: **Node.js ≥ 22**, **Docker Desktop** (đang chạy), **Git**.

```bash
npm install
```

```bash
docker compose -f infra/docker-compose.yml up -d
```

```bash
npm run demo:gate0
```

Lệnh thứ ba tự chạy migration + seed rồi diễn toàn bộ luồng **tiêu chí Gate 0 ③** trong
khoảng 3 phút, in kết quả từng bước ra console:

| Bước | Nội dung |
|---|---|
| 1–2 | Dựng DB (migration + dữ liệu giả) · khởi động ingest, CSMS, API |
| 3 | 20 xe: 17 xe chạy bình thường + **3 kịch bản nguy hiểm chạy đồng thời** (tụt pin · nóng pin · mất nguồn) |
| 4 | 1 xe tụt pin → **cảnh báo phân cấp 30% / 20% / 10%** kèm gợi ý trạm (F-A2) |
| 4b | Xe khác nóng pin lên 60°C → **cảnh báo CRITICAL kèm snapshot 5 phút** dữ liệu (F-A4) |
| 5 | Xe cắm sạc → **phiên sạc qua OCPP 1.6J** ghi vào bảng append-only (F-B2, NF-11) |
| 6 | Giao dịch thanh toán (bản ghi GIẢ do simulator sinh) |
| 7 | **Đối soát 3 chiều trụ ↔ xe ↔ thanh toán → KHỚP** trong ngưỡng 1% (F-C6, NF-10) |
| 8 | Bơm sai 5% có chủ ý → hệ thống **phát hiện và cảnh báo**; thử sửa bảng append-only → DB từ chối |
| 9 | Vận hành G3 Energy gọi API vị trí xe → **403**, mọi lần truy cập đều vào audit log (quy tắc 5) |
| 9b | Xe bị cắt nguồn → job quét **phân biệt "nghi tháo thiết bị" với "mất sóng"** (F-J1/F-J3) |
| 10 | Kiểm tra **không trùng / không sót** trên cả 3 luồng cảnh báo + bảng tóm tắt số liệu |

Demo giữ API sống sau khi xong để trình bày thêm tại <http://localhost:3000/docs>; `Ctrl+C` để tắt sạch.

## NGHIỆM THU TUẦN 8 — vòng tiền & bảo hành (demo thứ 2)

```bash
npm run demo:tuan8
```

Kịch bản: **xe sạc sai khung giờ rồi trả tiền qua cổng sandbox**. Chạy ~2 phút, tự migrate +
seed, in bảng kết quả từng tiêu chí:

| Bước | Nội dung |
|---|---|
| 1–2 | Dựng DB · khởi động ingest, CSMS, API, cổng thanh toán **sandbox** |
| 3 | Ban hành chính sách sạc có version, khung giờ ToU (F-B1) |
| 4 | Xe sạc **ngoài khung giờ** → phiên qua OCPP 1.6J vào bảng append-only (F-B2) |
| 5 | Thu tiền qua cổng sandbox · **webhook gửi 2 lần → đúng 1 giao dịch** (F-H1) |
| 6 | Gắn cờ vi phạm + **bảng bằng chứng** + cảnh báo nêu cách khắc phục (F-B3, F-B5) |
| 7 | Đổi chính sách sang v2 → phiên cũ **vẫn đối chiếu theo v1** (F-B1); thử sửa bảng bất biến → DB từ chối (NF-11) |
| 8 | Đối soát 3 chiều trụ ↔ xe ↔ thanh toán (F-C6, NF-10) |
| 9 | Báo cáo sản lượng theo khách + báo cáo lệch **theo ngày** (F-C6) |
| 10 | Bảng tổng kết ĐẠT/CHƯA ĐẠT từng tiêu chí |

Khung giờ cho phép được dựng **lùi về quá khứ so với lúc chạy**, nên phiên sạc luôn nằm ngoài
khung dù demo chạy vào giờ nào trong ngày (có test quét cả 24 giờ khoá lại điều này).
Demo giữ API sống sau khi xong; `Ctrl+C` để tắt sạch.

## Chạy để phát triển

```bash
npm install                                        # 1. Cài phụ thuộc + tự tạo infra/.env từ .env.example
docker compose -f infra/docker-compose.yml up -d   # 2. Bật PostgreSQL (Timescale+PostGIS) và EMQX
npm run db:migrate && npm run db:seed              # 3. Dựng schema DB + seed dữ liệu giả
npm run dev                                        # 4. Chạy API (cổng 3000) + Portal (cổng 3100)
```

Kiểm tra nhanh sau khi chạy:

| Địa chỉ | Là gì |
|---|---|
| http://localhost:3000/health | API trả `{"status":"ok",...}` |
| http://localhost:3000/docs | Tài liệu OpenAPI (tự sinh) — bấm **Authorize** để dán token |
| http://localhost:3100 | Portal đội xe (trang chào) |
| http://localhost:18083 | Dashboard EMQX (user `admin`, mật khẩu trong `infra/.env`) |

## Đăng nhập API (F-F1)

Mọi endpoint nghiệp vụ đều cần token; **mặc định là TỪ CHỐI** (quy tắc 6). Phase 1 đăng nhập
bằng OTP qua SĐT — mã **in ra console của `apps/api`**, không gửi SMS thật.

```bash
curl -X POST http://localhost:3000/auth/otp/request -H 'content-type: application/json' -d '{"phone":"0900000010"}'
```

Xem console `apps/api` để lấy mã 6 chữ số, rồi đổi lấy token:

```bash
curl -X POST http://localhost:3000/auth/otp/verify -H 'content-type: application/json' -d '{"phone":"0900000010","code":"123456"}'
```

SĐT GIẢ có sẵn sau `npm run db:seed` (mỗi số là một vai trò trong sheet 9):

| SĐT | Vai trò | Thấy được gì |
|---|---|---|
| `0900000010` | Admin G3 Network | tất cả |
| `0900000001` | Tài xế | chỉ xe được gán |
| `0900000002` | Chủ xe / QL đội | chỉ xe đội Sao Mai |
| `0900000003` | Vận hành G3 Energy | trạm, phiên sạc, đối soát — **không** xem được vị trí xe |
| `0900000004` | Bảo hành G3 Mobility | xe, vị trí, phiên sạc |
| `0900000005` | CSKH Holding | vị trí xe **chỉ khi** có ticket đang mở |
| `0900000006` | Sale Holding | xe, vị trí |

Ma trận quyền đầy đủ + các điểm cần review: [docs/architecture/rbac-matrix.md](docs/architecture/rbac-matrix.md).
Mọi lần truy cập `GET /vehicles/{id}/location` (kể cả bị từ chối) đều ghi `audit_logs`
— quy tắc 5, NF-06, Nghị định 13/2023.

## Sơ đồ thư mục

```
g3-network/
├── CLAUDE.md            # Quy tắc dự án — ĐỌC TRƯỚC TIÊN, mọi PR phải tuân thủ
├── apps/
│   ├── api/             # API Fastify + TypeBox (OpenAPI tự sinh) — cổng 3000
│   ├── portal/          # Portal đội xe Next.js — cổng 3100
│   └── mobile/          # App tài xế Expo/React Native — KHUNG TRỐNG, build ở Prompt 09 (chờ D-01)
├── packages/
│   ├── payments/        # F-H1: cổng thanh toán VNPay SANDBOX (từ chối khởi động nếu không phải sandbox)
│   ├── shared/          # Hằng số & tiện ích dùng chung + db-types.ts sinh từ schema (F-G4)
│   ├── db/              # Migration SQL đánh số + runner + seed + sinh types (F-G4, Prompt 03)
│   └── contracts/       # Interface cho MỌI tích hợp ngoài + mocks (quy tắc 2 — cấm gọi thẳng SDK)
├── services/
│   ├── ingest/          # F-G1: MQTT → validate → telematics_readings + quarantine + metric NF-01 + cảnh báo pin F-A2
│   └── csms/            # F-G2: CSMS tự xây OCPP 1.6J — connectors NF-02, charging_sessions F-B2, RemoteStart F-H1
├── simulators/
│   ├── vehicle-sim/     # Giả lập xe tải điện — MQTT telemetry, 6 kịch bản (F-A1, docs/simulators.md)
│   └── ocpp-sim/        # F-G2: trụ sạc ảo OCPP 1.6J — 3 kịch bản normal/faulted/disconnect (docs/simulators.md)
├── tools/
│   ├── demo-gate0/      # Kịch bản demo end-to-end cho Gate 0 (npm run demo:gate0)
│   └── demo-tuan8/      # Nghiệm thu tuần 8: vòng tiền & bảo hành (npm run demo:tuan8)
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
| `npm run db:seed` | Seed dữ liệu GIẢ: 20 xe, **6 trạm × 4 trụ** (3 miền Nam + 3 miền Bắc — D-10), 7 tài khoản đủ 7 vai trò, 2 chính sách |
| `npm run db:types` | Sinh lại types TypeScript từ schema DB (packages/shared/src/db-types.ts) |
| `npm test` | Toàn bộ test |
| `npm test -w apps/api` | Test 1 workspace |
| `npm run lint` | ESLint + Prettier check |
| `npm run sim:vehicles -- --count 20` | Giả lập 20 xe gửi telemetry MQTT (kịch bản & flag: `docs/simulators.md`) |
| `npm run start -w services/ingest` | Chạy service ingest: MQTT → DB, metrics tại http://localhost:9464/metrics |
| `npm run start -w services/csms` | Chạy CSMS: OCPP WebSocket cổng 9220, HTTP nội bộ RemoteStart cổng 9221 |
| `npm run sim:ocpp -- --stations 3` | Giả lập 3 trụ sạc OCPP (kịch bản: `--scenario normal\|faulted\|disconnect`) |
| `npm run demo:gate0` | **Demo Gate 0 end-to-end** (tự migrate + seed, ~3 phút) |
| `npm run demo:tuan8` | **Nghiệm thu tuần 8** — vòng tiền & bảo hành (~2 phút) |
| `npm run reconcile` | Chạy tay job đối soát 3 chiều (thêm `-- --lam-lai-tat-ca` để soát lại từ đầu) |
| `GET /reports/kwh` | F-C6 — sản lượng kWh theo khách/phiên phục vụ hoá đơn & đối soát |
| `GET /reconciliation/report` | F-C6 — báo cáo lệch **theo ngày**: bắt cả sự cố đơn lẻ lẫn sai lệch hệ thống (mọi phiên dưới ngưỡng nhưng cùng chiều) |
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
| `CSMS_WS_PORT` | Cổng WebSocket CSMS cho OCPP 1.6J (trụ kết nối `ws://…/ocpp/{mãTrạm}`) |
| `CSMS_HTTP_PORT` | Cổng HTTP nội bộ CSMS: RemoteStart/RemoteStop (chuẩn bị F-H1, mặc định 9221) |
| `INGEST_METRICS_PORT` | Cổng HTTP `/metrics` Prometheus của service ingest (NF-01/NF-14, mặc định 9464) |
| `JWT_SECRET` | Khóa ký token API. **Để trống trong `.env.example`** — `npm install` sinh khóa ngẫu nhiên vào `infra/.env` |
| `JWT_EXPIRES_IN` | Hạn dùng token (mặc định `12h`) |
| `OTP_TTL_SECONDS` / `OTP_MAX_ATTEMPTS` | Hạn dùng mã OTP (300s) và số lần nhập sai tối đa (5) |
| `OTP_MAX_REQUESTS_PER_WINDOW` / `OTP_REQUEST_WINDOW_S` | Chống dò mã: tối đa 5 lần xin mã cho 1 SĐT mỗi 900s |
| `TELEMETRY_HISTORY_MAX_ROWS` | Trần bản ghi mỗi lần gọi lịch sử telemetry (mặc định 1000) |
| `VIOLATION_SCAN_INTERVAL_MS` | F-B3 — chu kỳ job đối chiếu phiên sạc với chính sách (mặc định 300000; `0` = chỉ chạy tay) |
| `VIOLATION_SOC_BREACH_COUNT` / `VIOLATION_SOC_BREACH_WINDOW_DAYS` | F-B3 — tiêu chí "thường xuyên" của sheet 4 (mặc định 3 lần / 30 ngày). ⚠️ **Chưa ai thẩm định hai con số này** — xem [ADR-011](docs/adr/ADR-011-tieu-chi-vi-pham-sac.md) và Q4 (MỞ) |
| `APP_TIMEZONE` | F-B1 — múi giờ IANA để hiểu khung giờ ToU của chính sách sạc (mặc định `Asia/Ho_Chi_Minh`). Khung giờ trong hợp đồng là giờ Việt Nam còn DB lưu UTC; sai chỗ này lệch 7 tiếng và gắn cờ vi phạm oan toàn bộ phiên sạc đêm ([ADR-010](docs/adr/ADR-010-version-chinh-sach-sac.md)) |
| `RECONCILE_INTERVAL_MS` | Chu kỳ job đối soát 3 chiều trong tiến trình API (mặc định 300000; `0` = chỉ chạy tay) |
| `RECONCILE_NGUONG_PCT` | Ngưỡng NF-10 — lệch hơn mức này (%) thì sinh cảnh báo (mặc định 1) |
| `CHARGE_EFFICIENCY` | Hiệu suất sạc lưới → pin. **1.0 chỉ đúng với simulator** — phải hiệu chuẩn trước Gate 1 ([ADR-007](docs/adr/ADR-007-hieu-suat-sac-doi-soat.md)) |
| `CHARGING_PRICE_VND_PER_KWH` | Đơn giá điện GIẢ để quy tiền về kWh (mặc định 3500) |
| `RECONCILE_SOC_WINDOW_S` | Telemetry xa mốc phiên quá số giây này → kết luận "thiếu dữ liệu" (mặc định 60) |
| `PAYMENT_GATEWAY` | F-H1 — cổng thanh toán: `mock` (mặc định, chạy trong tiến trình, không cần tài khoản) hoặc `vnpay` (**SANDBOX**) |
| `VNPAY_TMN_CODE` / `VNPAY_HASH_SECRET` | F-H1 — thông tin tài khoản VNPay **sandbox**. **Để trống trong `.env.example`**; tự đăng ký tại sandbox.vnpayment.vn rồi điền vào `infra/.env` (không commit) |
| `VNPAY_PAY_URL` / `VNPAY_RETURN_URL` / `VNPAY_EXPIRE_MINUTES` | F-H1 — endpoint sandbox, URL quay về, hạn link. **Hệ thống TỪ CHỐI KHỞI ĐỘNG nếu `VNPAY_PAY_URL` không phải host sandbox** ([ADR-012](docs/adr/ADR-012-thanh-toan-sandbox.md)) |
| `PAYMENT_LINK_INTERVAL_MS` | F-H1 — chu kỳ nối giao dịch đã thu tiền với phiên sạc về muộn (mặc định 120000; `0` = tắt) |
| `PAYMENT_RETURN_URL` / `CSMS_INTERNAL_URL` | F-H1 — URL app quay về sau khi trả tiền; gốc HTTP nội bộ của CSMS để gửi RemoteStart |
| `SLA_SCAN_INTERVAL_MS` | F-I2 — chu kỳ quét ticket quá hạn chưa ai nhận (mặc định 60000; `0` = tắt). SLA của SOS là 5 phút nên không nên quét thưa hơn |
| `DEVICE_SCAN_INTERVAL_MS` | F-J1 — chu kỳ job quét thiết bị im lặng trong tiến trình API (mặc định 600000; `0` = tắt) |
| `DEVICE_SILENCE_HOURS` | F-J1 — im lặng quá số giờ này thì sinh cảnh báo (mặc định 6) |
| `DEVICE_SUPPLY_VOLTAGE_LOW_V` / `DEVICE_SIGNAL_WEAK_DBM` | F-J3 — hai ngưỡng để phân biệt **bị tháo thiết bị** với **mất sóng**: nguồn nuôi dưới `..._LOW_V` = hết nguồn tự nhiên; sóng yếu hơn `..._WEAK_DBM` (dBm luôn âm) = mất sóng. Nguồn bình thường + sóng khoẻ rồi im bặt = nghi tháo |
| `NOTIFY_RATE_LIMIT_MAX` / `NOTIFY_RATE_LIMIT_WINDOW_S` | F-F3 — chống spam thông báo: tối đa 3 tin mỗi 900s cho mỗi (người × loại alert × kênh). **Chỉ áp cho push/SMS**; in-app không bị chặn và cảnh báo nguy cấp (severity 3) không bao giờ bị chặn ([ADR-008](docs/adr/ADR-008-rate-limit-thong-bao.md)) |

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
