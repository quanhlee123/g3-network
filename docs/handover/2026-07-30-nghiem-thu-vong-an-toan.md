# Nghiệm thu Vòng an toàn (Prompt 07 — tuần 4–5)

Ngày chạy: **2026-07-30** · Người chạy: Claude Code · Môi trường: máy local, Docker Desktop
(PostgreSQL 16 + TimescaleDB + PostGIS, EMQX), Node.js 24.

Phạm vi: **F-F3 · F-A2 · F-A4 · F-A5 · F-J1 · F-J3 · F-I2**.
Mỗi tính năng một nhánh + một PR riêng (quy tắc 1).

---

## 1. Kết quả nghiệm thu

Lệnh: `npm run demo:gate0` (đã mở rộng cho Prompt 07).

Kịch bản: **20 xe chạy đồng thời** — 17 xe bình thường + 3 kịch bản nguy hiểm chạy
**song song, không tuần tự**:

| Xe | Kịch bản | Tính năng kiểm chứng |
|---|---|---|
| `G3-SIM-VIN-0001` | tụt pin 100% → 5% trong 1 phút | F-A2 cảnh báo phân cấp |
| `G3-SIM-VIN-0002` | nhiệt độ pin leo 32°C → 60°C | F-A4 bất thường (an toàn cháy nổ) |
| `G3-SIM-VIN-0003` | cắt nguồn đột ngột (huỷ socket, không DISCONNECT) | F-J3 nghi tháo thiết bị |

### Kết quả (lần chạy sạch, 3 phút 5 giây)

| Hạng mục | Kết quả |
|---|---|
| Xe đã gửi telemetry | **20 / 20** |
| Bản ghi telemetry đã nhận (F-A1, NF-01) | 1.847 |
| Bản tin bị cách ly vì dữ liệu bẩn (F-G1) | 0 |
| **Cảnh báo pin phân cấp (F-A2)** | **3** — đúng 3 mức, mỗi mức 1 lần |
| **Cảnh báo bất thường pin (F-A4)** | **2** — `nhiet_do_cao` (55,1°C) + `ma_loi_bms` (P0A80), mỗi cái kèm snapshot 51 bản ghi |
| **Cảnh báo nghi tháo thiết bị (F-J3)** | **1** — đúng trên xe bị cắt nguồn, không phải "mất sóng" |
| **Thông báo tới người dùng (F-F3)** | **31, 0 lỗi kênh** |
| Phiên sạc qua OCPP (F-B2, NF-11) | 1 |
| Đối soát lượt 1 (dữ liệu nguyên vẹn) | 1 khớp / 0 lệch |
| Đối soát lượt 2 (sau khi bơm sai 5%) | 0 khớp / 1 lệch — **phát hiện đúng** |
| Audit log truy cập vị trí (quy tắc 5) | 2 |

**Hai phép kiểm chéo bắt buộc của nghiệm thu:**

- ✅ **KHÔNG TRÙNG** — không có hai cảnh báo đang mở nào dùng chung một khoá chống trùng,
  dù ba luồng cảnh báo chạy đồng thời trên cùng dòng telemetry.
- ✅ **KHÔNG SÓT** — cả 3 xe kịch bản đều có đúng loại cảnh báo của mình.

### Ba lỗi chỉ lộ ra khi CHẠY THẬT, không test nào bắt được

| # | Lỗi | Vì sao test không bắt |
|---|---|---|
| 1 | Demo báo **2** cảnh báo tamper trong khi chỉ 1 xe bị cắt nguồn | Xe thứ hai là xe mà **chính demo tắt simulator** ở bước trước. Với hệ thống, "simulator bị tắt" trông y hệt "thiết bị bị tháo": im bặt trong khi điện áp nguồn và sóng đều bình thường |
| 2 | Chạy demo **lần thứ hai** gãy ngay bước 1: xoá `alerts` trong khi `notifications` đang tham chiếu | Lần chạy đầu luôn ở trên DB sạch, chưa có thông báo nào tồn tại |
| 3 | Mọi thông báo kênh `push` đều `failed` (`chua_dang_ky_thiet_bi_nhan_push`) | Seed không tạo `push_tokens`. Test dùng world riêng nên vẫn xanh |

Điểm 1 là **phát hiện vận hành thật, không phải lỗi code**: F-J3 không có cách nào phân biệt
"tắt thiết bị hợp pháp" với "tháo trộm". → **Vận hành cần quy trình báo trước khi tháo thiết bị
hợp pháp** (bảo dưỡng, thay xe), nếu không đội rủi ro sẽ chạy theo báo động giả.
Điểm 2 và 3 đã sửa trong nhánh nghiệm thu.

---

## 2. Những gì đã làm

| Mã | Nội dung | Nhánh |
|---|---|---|
| **F-F3** | Khung thông báo đa kênh: `INotifier` + `IPushSender` (contracts), package `@g3/notify`, bảng `notifications` / `notification_prefs` / `push_tokens`, hộp thư in-app + lịch sử gửi, rate-limit | `feature/F-F3-khung-thong-bao` |
| **F-A2** | Ngưỡng pin cấu hình theo **XE > ĐỘI > mặc định** (bảng `battery_alert_thresholds`), nối vào `INotifier`, đổi `dedup_key` sang theo MỨC | `feature/F-A2-nguong-cau-hinh` |
| **F-A4** | Rule engine bất thường: nhiệt độ / sụt áp / mã lỗi BMS → alert CRITICAL + snapshot 5 phút (jsonb), ngưỡng trong bảng `anomaly_rules` | `feature/F-A4-phat-hien-bat-thuong` |
| **F-A5** | `GET /vehicles/{id}/route` (downsample + audit), geofence đa giác PostGIS + cảnh báo ra/vào vùng | `feature/F-A5-lo-trinh-geofence` |
| **F-J1/J3** | Telemetry **schema v2** (điện áp nguồn nuôi + cường độ sóng), job quét thiết bị im lặng, phân biệt tháo thiết bị với mất sóng | `feature/F-J1-J3-suc-khoe-tamper` |
| **F-I2** | `POST /sos` (tự đính kèm ngữ cảnh xe), ticket ưu tiên CAO, đồng hồ SLA 5 phút + leo thang | `feature/F-I2-nut-sos` |

Các nhánh xếp chồng theo đúng thứ tự trên (F-A2 dựa trên F-F3, v.v.).

---

## 3. Quyết định phát sinh — CẦN NGƯỜI DUYỆT

### 3.1 ADR mới (đều đang NHÁP)

| ADR | Nội dung | Vì sao cần duyệt |
|---|---|---|
| [ADR-008](../adr/ADR-008-rate-limit-thong-bao.md) | Rate-limit thông báo: chỉ chặn kênh chen ngang, **không** chặn in-app, **không bao giờ** chặn severity 3 | Đánh đổi giữa "không spam" (sheet 2) và "không bỏ lọt cảnh báo an toàn". Hạn mức 3 tin/15 phút chưa có dữ liệu thật để hiệu chuẩn |
| [ADR-009](../adr/ADR-009-nguong-bat-thuong-pin.md) | Ngưỡng bất thường pin để trong bảng; **ba con số mặc định chưa được thẩm định** | ⚠️ Đây là ngưỡng AN TOÀN. PRD không cho con số, đặc tả BMS Tri-Ring vẫn ở Q1 (MỞ) |

**[ADR-003](../adr/ADR-003-mqtt-lwt-phat-hien-mat-nguon.md) vẫn ở trạng thái NHÁP** dù code F-J3
đã dựa vào nó từ Prompt 04 — đề nghị duyệt cùng đợt này.

### 3.2 Mục MỞ mới trong DECISION-LOG

- **D-12**: F-J3 yêu cầu báo tamper cho *"Quản lý rủi ro"*, nhưng vai trò đó **không tồn tại**
  trong sheet 9 lẫn enum `user_role`. Tạm cấu hình cho `admin`/`fleet_manager`/`cskh`.
  Không tự thêm vai trò mới (quy tắc 6).

### 3.3 Suy luận phân quyền cần xác nhận (docs/architecture/rbac-matrix.md)

- **R-06** `notification.read` — cấp cho cả 7 vai trò, phạm vi `own` cứng (hộp thư của chính mình).
- **R-07** `geofence.read` / `.manage` — sheet 9 không có dòng geofence; đặt ngang mức quyền xem
  vị trí xe. Chỉ Admin tạo được vùng áp dụng toàn hệ.
- **R-08** `ticket.read` — sheet 9 cho Vận hành/Bảo hành/Sale "V" kèm phạm vi trong ngoặc nhưng
  không nói lọc theo tiêu chí nào → chọn phương án chặt hơn, ba vai trò này **chưa** có quyền.

---

## 4. Ranh giới đã tôn trọng — việc CHƯA làm vì quyết định đang MỞ

| Quyết định | Trạng thái | Phần bị chặn |
|---|---|---|
| **D-09** — định hướng nghiệp vụ Module I (CSKH) | MỞ | Quy trình gọi lại, phân ca trực, cam kết dịch vụ thật của F-I2. **Đã làm** phần kỹ thuật: endpoint SOS, ticket, đồng hồ SLA, leo thang |
| **Q6** — đơn vị nào trực 24/7 | MỞ | Cùng phạm vi D-09; thêm: fallback gọi hotline khi app không có mạng (tiêu chí F-I2 có nhắc) |
| **Q1** — đặc tả BMS Tri-Ring | MỞ | Ba ngưỡng an toàn của F-A4 (xem ADR-009) |
| **Q5** — nhà cung cấp bản đồ | MỞ | Khoảng cách tới trạm vẫn là đường chim bay; lộ trình downsample đều chứ chưa theo hình học tuyến |
| **Q12** — ranh giới can thiệp từ xa | MỞ | Geofence và F-A4 chỉ BÁO TIN, chưa có hành động tự động nào (khoá xe, chặn sạc) |

**Câu chữ Prompt 7.1 về định nghĩa "chuyến" đã bị D-03 thay thế** (chốt 2026-07-29): F-A2 bỏ hẳn
khái niệm chuyến, chống spam theo SOC hồi phục + biên trễ. Người dùng xác nhận giữ nguyên D-03.

---

## 5. Lỗi có sẵn phát hiện được trong đợt này

| Lỗi | Ảnh hưởng | Đã sửa ở |
|---|---|---|
| Route khai `400: ErrorSchema` mà gặp lỗi validate của Fastify thì body mặc định không khớp schema → serialize hỏng → **400 biến thành 500**. `POST /auth/otp/request` (Prompt 06) đang dính | Lỗi nhập liệu của người gọi bị báo thành lỗi hệ thống | F-A5 — `setErrorHandler` chung trong `app.ts` |
| `generate-types.ts` chưa biết kiểu MẢNG của Postgres (`_notification_channel`) | `npm run db:types` gãy khi có cột mảng | F-F3 |
| `resetWorld` (test) xoá `users` trước `notifications`/`push_tokens` | Test apps/api gãy vì khoá ngoại | F-F3 |
| Seed không tạo `push_tokens` | Mọi thông báo kênh push ghi `failed` — demo trông như hệ thống hỏng trong khi chỉ thiếu dữ liệu seed | Nghiệm thu |

---

## 6. Việc tiếp theo

0. **Vận hành**: dựng quy trình **báo trước khi tháo thiết bị hợp pháp** — nếu không, mỗi lần
   bảo dưỡng/thay xe sẽ sinh một cảnh báo `device_tamper` giả và đội rủi ro chạy vô ích
   (xem mục 1, lỗi #1).
1. **Người duyệt**: ADR-003, ADR-008, ADR-009; các mục R-06/R-07/R-08; D-12.
2. **Trước Gate 1**: thay ba ngưỡng an toàn F-A4 bằng thông số nhà sản xuất pin (ADR-009);
   hiệu chuẩn `CHARGE_EFFICIENCY` (ADR-007, đã là điều kiện Gate 1 từ trước).
3. **Kỹ thuật còn nợ**: retention cho bảng `notifications` và kích thước `alerts.payload`
   (snapshot F-A4) ở quy mô 300 xe (NF-04) — chưa xử lý ở Phase 1.
