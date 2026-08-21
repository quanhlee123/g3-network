# Trạng thái từng tính năng P1 — bản đối chiếu với mã nguồn

> **Mục đích:** để nhà thầu báo giá trên sự thật, không trên slide.
> Mọi dòng trong bảng này đã được đối chiếu với mã nguồn và test **đang có trong repo**
> tại thời điểm rà soát. Không dòng nào dựa trên tài liệu tự khai.
>
> - **Ngày rà soát:** 2026-08-20
> - **Cách kiểm chứng:** `npm test` (kết quả: **622 test / 67 file, xanh toàn bộ, 0 fail**)
>   và quét mã F-xx ở đầu mọi file `.ts` / `.tsx` / `.sql` (quy tắc 1 của CLAUDE.md).
> - Nguồn yêu cầu gốc: [docs/prd/04-p1-chuc-nang.md](../prd/04-p1-chuc-nang.md) — **46 mã F-xx**, module A–K.

---

## Quy ước trạng thái

| Ký hiệu | Nghĩa |
|---|---|
| ✅ **Hoàn thành trên mock** | Nghiệp vụ chạy end-to-end với simulator/mock, có test khoá lại. Chuyển sang phần cứng/dịch vụ thật là việc còn lại. |
| 🟦 **Sandbox** | Như trên, nhưng chạy trên môi trường sandbox của nhà cung cấp bên ngoài (không phải production). |
| 🔌 **Interface-only** | Đã có interface + mock chạy được, hoặc khung có test; **chưa có** phần cài đặt thật hay giao diện. |
| 🟨 **Một phần** | Một số điều khoản acceptance đạt, số khác chưa. |
| ⬜ **Chưa làm** | Không có mã nào phục vụ tính năng này. |

> **Vì sao có nhãn 🟨 "Một phần"** — ngoài 4 nhãn mà đề bài nêu: ba tính năng (F-D1, F-G4,
> F-I1) có phần đã chạy được và phần chưa có. Nhét chúng vào "Hoàn thành trên mock" là
> khai vống, nhét vào "Chưa làm" là xoá công đã bỏ ra. Nhãn thứ năm giữ cho bảng nói đúng.

Cột **Acceptance** đối chiếu với đúng câu "Tiêu chí chấp nhận" của sheet 4:
✅ đạt trên mock · ⚠️ đạt một phần, ghi rõ phần chưa đạt · ❌ chưa đạt · — không áp dụng (chưa làm).

---

## Bảng tổng kết

| Trạng thái | Toàn bộ P1 (46) | Riêng P1.0 Day-1 (25) |
|---|---|---|
| ✅ Hoàn thành trên mock | 19 | 19 |
| 🟦 Sandbox | 1 | 1 |
| 🔌 Interface-only | 2 | 2 |
| 🟨 Một phần | 3 | 2 |
| ⬜ Chưa làm | 21 | 1 |

> **[CẦN LÀM RÕ] — sai lệch trong chính PRD.** Dòng tóm tắt cuối
> [04-p1-chuc-nang.md](../prd/04-p1-chuc-nang.md) ghi *"tổng 23 tính năng"* nhưng danh sách
> liệt kê ngay trước đó có **25 mã** (A1,A2,A4,A5 · B1,B2,B3,B5 · C1,C2,C6 · D1,D2,D4 · E1 ·
> F1,F2,F3 · G1,G2,G4 · H1 · I2 · J1,J3). Bảng này dùng **25** vì đó là phần liệt kê tường
> minh. Người viết PRD cần xác nhận con số đúng — nó là phạm vi hợp đồng của gói thầu.

---

## A. Telematics & Giám sát xe–pin

| Mã | Tính năng | Đợt | Trạng thái | Acceptance | Code | Test |
|---|---|---|---|---|---|---|
| F-A1 | Thu thập dữ liệu xe realtime | P1.0 Must | ✅ Hoàn thành trên mock | ✅ độ trễ đo được **0,66s p95** ở 300 xe (ngưỡng ≤30s) · cờ online/offline có · `schema_version` có từ migration đầu (đang ở v2). ⚠️ "lưu lịch sử ≥12 tháng hot" mới là **khai báo** `add_retention_policy(12 months)`, chưa chạy đủ chu kỳ để chứng minh | [vehicle-sim](../../simulators/vehicle-sim/src/) · [ingest/pipeline.ts](../../services/ingest/src/pipeline.ts) · [0003_telematics.sql](../../packages/db/migrations/0003_telematics.sql) · [routes/vehicles.ts](../../apps/api/src/routes/vehicles.ts) | [vehicle.test.ts](../../simulators/vehicle-sim/src/vehicle.test.ts) · [pipeline.test.ts](../../services/ingest/src/pipeline.test.ts) · [validate.test.ts](../../services/ingest/src/validate.test.ts) |
| F-A2 | Cảnh báo pin phân cấp | P1.0 Must | ✅ Hoàn thành trên mock | ✅ ba ngưỡng 30/20/10% · chống spam theo vòng đời cảnh báo (ADR-006). ⚠️ "gợi ý trạm gần nhất" tính bằng **đường chim bay** (PostGIS), không phải quãng đường thật — chờ Q5. ❌ "hoạt động khi app chạy nền" **chưa kiểm chứng được** vì chưa có app | [battery-alerts.ts](../../services/ingest/src/battery-alerts.ts) · [0018_battery_alert_thresholds.sql](../../packages/db/migrations/0018_battery_alert_thresholds.sql) | [battery-alerts.test.ts](../../services/ingest/src/battery-alerts.test.ts) + [pipeline.test.ts](../../services/ingest/src/pipeline.test.ts) — **36 test** |
| F-A3 | Sức khỏe pin (SOH) & chu kỳ | P1.1 Should | ⬜ Chưa làm | — | — | — |
| F-A4 | Phát hiện bất thường | P1.0 Must | ✅ Hoàn thành trên mock | ✅ ngưỡng cấu hình được trong bảng `anomaly_rules` · log kèm snapshot dữ liệu (demo Gate 0 bước 4b: nóng pin 60°C → CRITICAL + snapshot 5 phút) | [anomaly.ts](../../services/ingest/src/anomaly.ts) · [0019_anomaly_rules.sql](../../packages/db/migrations/0019_anomaly_rules.sql) | [anomaly.test.ts](../../services/ingest/src/anomaly.test.ts) |
| F-A5 | Vị trí, hành trình & geofence | P1.0 Must | ✅ Hoàn thành trên mock | ✅ vị trí ≤30s · geofence theo xe/đội. ⚠️ "lịch sử lộ trình ≥6 tháng" chưa kiểm chứng (DB mới chạy vài tuần). ⚠️ **N-01**: `GET /alerts` trả vị trí mà không ghi audit | [geofence.ts](../../services/ingest/src/geofence.ts) · [routes/geofences.ts](../../apps/api/src/routes/geofences.ts) · [0020_geofences.sql](../../packages/db/migrations/0020_geofences.sql) | [geofence.test.ts](../../services/ingest/src/geofence.test.ts) · [route-geofence.test.ts](../../apps/api/src/routes/route-geofence.test.ts) |
| F-A6 | Hiệu suất vận hành | P1.1 Must | ⬜ Chưa làm | — | — | — · **D-05 MỞ** (chưa rõ actor) |

## B. Kiểm soát sạc & Bảo hành

| Mã | Tính năng | Đợt | Trạng thái | Acceptance | Code | Test |
|---|---|---|---|---|---|---|
| F-B1 | Thiết lập chính sách sạc | P1.0 Must | ✅ Hoàn thành trên mock | ✅ cấu hình theo xe/đội · hiệu lực ngay · **lưu phiên bản, không sửa đè** (ADR-010) — demo tuần 8 chứng minh phiên cũ vẫn chiếu theo v1 sau khi ban hành v2 | [policy.ts](../../apps/api/src/modules/policies/policy.ts) · [charging-policies.ts](../../apps/api/src/routes/charging-policies.ts) · [0024_charging_policy_versions.sql](../../packages/db/migrations/0024_charging_policy_versions.sql) | [policy.test.ts](../../apps/api/src/modules/policies/policy.test.ts) · [charging-policies.test.ts](../../apps/api/src/routes/charging-policies.test.ts) |
| F-B2 | Ghi nhận phiên sạc | P1.0 Must | ✅ Hoàn thành trên mock | ✅ log đủ trường · đối soát chéo với telematics xe · bảng **APPEND-ONLY chặn bằng trigger DB**. ⚠️ "100% phiên qua mạng G3 Energy" mới đúng với trụ **giả lập** | [csms/session.ts](../../services/csms/src/session.ts) · [0005_sessions.sql](../../packages/db/migrations/0005_sessions.sql) · [routes/sessions.ts](../../apps/api/src/routes/sessions.ts) | [session.test.ts](../../services/csms/src/session.test.ts) · [append-only.test.ts](../../packages/db/src/append-only.test.ts) |
| F-B3 | Đối chiếu & gắn cờ vi phạm | P1.0 Must | ✅ Hoàn thành trên mock | ✅ tự phát hiện & phân loại (ngoài khung giờ, SOC >90%/<20%, sạc nhanh quá mức) · bằng chứng bất biến | [violations/detect.ts](../../apps/api/src/modules/violations/detect.ts) · [0025_violation_checks.sql](../../packages/db/migrations/0025_violation_checks.sql) | [detect.test.ts](../../apps/api/src/modules/violations/detect.test.ts) + [violations.test.ts](../../apps/api/src/routes/violations.test.ts) — **27 test** |
| F-B4 | Bảng trạng thái bảo hành | P1.1 Must | ⬜ Chưa làm | — | — | — |
| F-B5 | Cảnh báo nguy cơ mất bảo hành | P1.0 Must | ✅ Hoàn thành trên mock | ✅ realtime · **nêu rõ hành vi & cách khắc phục** (`mota.ts` sinh câu tiếng Việt). ⚠️ "tổng hợp định kỳ" chưa có | [violations/mota.ts](../../apps/api/src/modules/violations/mota.ts) · [packages/notify](../../packages/notify/src/) | [detect.test.ts](../../apps/api/src/modules/violations/detect.test.ts) · [notifier.test.ts](../../packages/notify/src/notifier.test.ts) |
| F-B6 | Báo cáo vi phạm cho đội Bảo hành | P1.1 Should | ⬜ Chưa làm | — | — | — · **Q4 MỞ** (chế tài vi phạm) |

## C. Quản lý trạm sạc

| Mã | Tính năng | Đợt | Trạng thái | Acceptance | Code | Test |
|---|---|---|---|---|---|---|
| F-C1 | Danh mục trạm sạc | P1.0 Must | ✅ Hoàn thành trên mock | ✅ CRUD trạm · hiển thị bản đồ · trạng thái hoạt động/bảo trì | [routes/stations.ts](../../apps/api/src/routes/stations.ts) · [0026_station_crud.sql](../../packages/db/migrations/0026_station_crud.sql) | [stations-crud.test.ts](../../apps/api/src/routes/stations-crud.test.ts) |
| F-C2 | Trạng thái trụ realtime | P1.0 Must | ✅ Hoàn thành trên mock | ⚠️ trạng thái Available/Charging/Faulted chạy đúng với trụ giả lập, nhưng **NF-02 CHƯA từng đo dưới tải** (mục N-09): `ocpp-sim` chỉ chạy một phiên mỗi trụ rồi chuyển sang heartbeat, nên 30 mẫu dồn vào phút đầu. ❌ "chính xác ≥99%" chưa đo | [csms/session.ts](../../services/csms/src/session.ts) · [routes/stations.ts](../../apps/api/src/routes/stations.ts) | [csms/index.test.ts](../../services/csms/src/index.test.ts) · [station-sim.test.ts](../../simulators/ocpp-sim/src/station-sim.test.ts) |
| F-C3 | Hàng đợi & thời gian chờ | P1.5 Should | ⬜ Chưa làm | — | — | — |
| F-C4 | Đặt chỗ trụ sạc | P1.5 Could | ⬜ Chưa làm | — | — | — |
| F-C5 | Sản lượng điện theo trạm | P1.1 Should | ⬜ Chưa làm | — | Dữ liệu **đã đủ** (mọi phiên có `station_id`, [bao-cao.ts](../../apps/api/src/modules/reconciliation/bao-cao.ts) đã trả `ma_tram` ở mức phiên) nhưng tầng tổng hợp gộp theo **khách hàng**, chưa có báo cáo kWh theo trạm/ngày | — |
| F-C6 | Điện sử dụng theo khách hàng | P1.0 Must | ✅ Hoàn thành trên mock | ✅ chính xác theo phiên · **khớp 3 chiều trụ–xe–thanh toán** trong ngưỡng 1% (NF-10). ⚠️ hệ số `CHARGE_EFFICIENCY` đang để **1.0** (simulator lý tưởng); **phải hiệu chuẩn bằng dữ liệu pilot trước Gate 1** — D-11, ADR-007 | [modules/reconciliation/](../../apps/api/src/modules/reconciliation/) · [0015](../../packages/db/migrations/0015_reconciliation_results.sql), [0016](../../packages/db/migrations/0016_reconciliation_bat_thuong.sql) | [reconcile.test.ts](../../apps/api/src/modules/reconciliation/reconcile.test.ts) · [soc.test.ts](../../apps/api/src/modules/reconciliation/soc.test.ts) · [bao-cao.test.ts](../../apps/api/src/modules/reconciliation/bao-cao.test.ts) — **42 test** |

## D. App tài xế & Điều hướng

| Mã | Tính năng | Đợt | Trạng thái | Acceptance | Code | Test |
|---|---|---|---|---|---|---|
| F-D1 | Bản đồ trạm sạc | P1.0 Must | 🟨 Một phần | ⚠️ **backend sẵn sàng** (`GET /stations/map` lọc theo trạng thái, trả toạ độ) nhưng **app tài xế chưa có màn hình nào** — mới có ô `ban-do-tram` trong bảng điều hướng | [routes/stations.ts](../../apps/api/src/routes/stations.ts) · [mobile/navigation/routes.ts](../../apps/mobile/src/navigation/routes.ts) | [stations-crud.test.ts](../../apps/api/src/routes/stations-crud.test.ts) · [routes.test.ts](../../apps/mobile/src/navigation/routes.test.ts) |
| F-D2 | Điều hướng tới trạm | P1.0 Must | ⬜ Chưa làm | ❌ **KHÔNG có Map adapter** trong `packages/contracts` (xem "Đính chính" bên dưới). **Q5 MỞ** — chưa chọn VietMap / Google / Mapbox | — | — |
| F-D3 | Range-aware | P1.1 Should | ⬜ Chưa làm | — | — | — |
| F-D4 | App tài xế (iOS & Android) | P1.0 Must | 🔌 Interface-only | ⚠️ **mới có KHUNG**: cấu hình, tầng API, đăng nhập OTP, i18n tiếng Việt, bảng 10 màn hình + luật điều hướng (mặc định từ chối khi chưa đăng nhập). **Chưa vẽ màn hình nào** → NF-12 (chữ lớn, tương phản cao, ≤3 chạm) và NF-13 chưa kiểm chứng được. Chờ wireframe: [YEU-CAU-WIREFRAME.md](../design/YEU-CAU-WIREFRAME.md) | [apps/mobile/src/](../../apps/mobile/src/) | 8 file test — **69 test** ([otp-flow](../../apps/mobile/src/auth/otp-flow.test.ts), [client](../../apps/mobile/src/api/client.test.ts), [routes](../../apps/mobile/src/navigation/routes.test.ts)…) |
| F-D5 | Chế độ offline | P1.1 Should | ⬜ Chưa làm | Buffer store-and-forward mới có ở phía **thiết bị giả lập**, không phải app. ⚠️ **N-08**: buffer không có giới hạn dung lượng, mốc 48h (NF-09) chưa test | [vehicle-sim/buffer.ts](../../simulators/vehicle-sim/src/buffer.ts) | — |

## E. Portal đội xe

| Mã | Tính năng | Đợt | Trạng thái | Acceptance | Code | Test |
|---|---|---|---|---|---|---|
| F-E1 | Danh sách & bản đồ đội xe | P1.0 Must | ✅ Hoàn thành trên mock | ✅ xem toàn đội, lọc/tìm kiếm, một màn hình tổng quan · **quản lý đội chỉ thấy đội mình** · một lần xem bản đồ = đúng một dòng nhật ký truy cập vị trí (demo tuần 11) | [apps/portal/app/tong-quan/](../../apps/portal/app/tong-quan/) · [components/](../../apps/portal/components/) · [routes/vehicles.ts](../../apps/api/src/routes/vehicles.ts) | [fleet-overview.test.ts](../../apps/api/src/routes/fleet-overview.test.ts) · [ban-do.test.ts](../../apps/portal/lib/ban-do.test.ts) · [dinh-dang.test.ts](../../apps/portal/lib/dinh-dang.test.ts) |
| F-E2 | Dashboard KPI đội xe | P1.1 Must | ⬜ Chưa làm | — | — | — |
| F-E3 | Báo cáo sạc & bảo hành | P1.1 Must | ⬜ Chưa làm | — | — | — · **D-06 MỞ** (cho đội xe hay admin tổng) |
| F-E4 | Quản lý tài xế & phân công | P1.1 Should | ⬜ Chưa làm | — | — | — · **D-07 MỞ** (mô hình quản lý) |

## F. Tài khoản & Thông báo

| Mã | Tính năng | Đợt | Trạng thái | Acceptance | Code | Test |
|---|---|---|---|---|---|---|
| F-F1 | Tài khoản & RBAC | P1.0 Must | ✅ Hoàn thành trên mock | ✅ RBAC **mặc định TỪ CHỐI**, có test quét mọi route bắt route nào quên khai quyền · mời/khoá tài khoản (khoá hiệu lực ngay với token đang cầm) · audit log truy cập vị trí. ⚠️ **N-01, N-02**: hai chỗ trả vị trí xe mà chưa audit | [auth/](../../apps/api/src/auth/) · [audit.ts](../../apps/api/src/audit.ts) · [routes/users.ts](../../apps/api/src/routes/users.ts) · [routes/audit-logs.ts](../../apps/api/src/routes/audit-logs.ts) | [rbac.test.ts](../../apps/api/src/auth/rbac.test.ts) · [users-audit.test.ts](../../apps/api/src/routes/users-audit.test.ts) · [app.test.ts](../../apps/api/src/app.test.ts) — **33 test** |
| F-F2 | Provisioning thiết bị | P1.0 Must | ✅ Hoàn thành trên mock | ✅ quy trình theo VIN · checklist bàn giao in được · **không chốt được khi chưa có telemetry**. ❌ "tỷ lệ thành công ≥98%" **không đo được** vì chưa có thiết bị thật. ⚠️ văn bản đồng ý tự khai là **BẢN NHÁP** vì **Q7 MỞ** | [routes/provisioning.ts](../../apps/api/src/routes/provisioning.ts) · [0028_provisioning.sql](../../packages/db/migrations/0028_provisioning.sql) · [portal/kich-hoat/](../../apps/portal/app/kich-hoat/) | [provisioning.test.ts](../../apps/api/src/routes/provisioning.test.ts) |
| F-F3 | Thông báo đa kênh | P1.0 Must | ✅ Hoàn thành trên mock | ✅ cấu hình kênh & ngưỡng · lịch sử · rate-limit 3 tin/15 phút (ADR-008). ❌ push/SMS **đều là mock in ra console**; chưa có nhà cung cấp thật nên "SMS dự phòng cho pin ≤10%" chưa gửi được tin nào ra ngoài | [packages/notify/](../../packages/notify/src/) · [contracts/mocks/push.ts](../../packages/contracts/src/mocks/push.ts) · [contracts/mocks/sms.ts](../../packages/contracts/src/mocks/sms.ts) | [notifier.test.ts](../../packages/notify/src/notifier.test.ts) · [recipients.test.ts](../../packages/notify/src/recipients.test.ts) · [notifications.test.ts](../../apps/api/src/routes/notifications.test.ts) |
| F-F4 | Nhắc bảo dưỡng & ưu đãi | P1.1 Should | ⬜ Chưa làm | Chỉ có giá trị enum `maintenance` trong [0008_alerts_tickets.sql](../../packages/db/migrations/0008_alerts_tickets.sql) — không có logic | — | — |

## G. Tích hợp & Nền dữ liệu

| Mã | Tính năng | Đợt | Trạng thái | Acceptance | Code | Test |
|---|---|---|---|---|---|---|
| F-G1 | Tích hợp telematics Tri-Ring | P1.0 Must | 🔌 Interface-only | ⚠️ **môi trường mock chạy đầy đủ** (đủ trường lõi, quarantine bản tin bẩn, phát hiện lệch đồng hồ, ép múi giờ tường minh). ❌ **chưa chốt đặc tả** — tiêu chí Gate 0 ① chưa đạt: **Q1 MỞ**, **TR-02** (GB/T 32960 hay MQTT/JSON), **TR-04** (gửi về server VN được không), **TR-05** (đệm 48h) đều MỞ. ✅ TR-01 (WGS-84) và TR-03 (GMT+7) **đã chốt** và đã phòng vệ trong mã | [contracts/telematics-source.ts](../../packages/contracts/src/telematics-source.ts) + [mock](../../packages/contracts/src/mocks/telematics-source.ts) · [ingest/mqtt-source.ts](../../services/ingest/src/mqtt-source.ts) | [telematics-source.test.ts](../../packages/contracts/src/mocks/telematics-source.test.ts) · [mui-gio.test.ts](../../services/ingest/src/mui-gio.test.ts) · [lech-dong-ho.test.ts](../../services/ingest/src/lech-dong-ho.test.ts) — ingest có **94 test** |
| F-G2 | Tích hợp trạm sạc (OCPP) | P1.0 Must | ✅ Hoàn thành trên mock | ✅ CSMS 1.6J tự xây (WebSocket), trạng thái & phiên realtime với trụ **giả lập**. ❌ "nghiệm thu trụ theo chuẩn khi mua sắm" chưa làm — chưa có trụ thật; **Q8 MỞ** (chỉ 1.6J hay bắt buộc nâng cấp được 2.0.1) | [services/csms/](../../services/csms/src/) · [contracts/ocpp.ts](../../packages/contracts/src/ocpp.ts) + [mock](../../packages/contracts/src/mocks/ocpp.ts) | [csms/session.test.ts](../../services/csms/src/session.test.ts) · [ocpp.test.ts](../../packages/contracts/src/ocpp.test.ts) · [ocpp-sim](../../simulators/ocpp-sim/src/) |
| F-G3 | Pipeline dữ liệu (ETL) | P1.1 Should | ⬜ Chưa làm | Có quarantine + metric chất lượng dữ liệu, **chưa có** Lake/Warehouse hay pipeline chuẩn hoá theo tuyến | [ingest/validate.ts](../../services/ingest/src/validate.ts) · [0011_alerts_data_quality.sql](../../packages/db/migrations/0011_alerts_data_quality.sql) | [validate.test.ts](../../services/ingest/src/validate.test.ts) |
| F-G4 | Quản trị & bảo mật dữ liệu | P1.0 Must | 🟨 Một phần | ✅ RBAC + audit log + append-only + 29 migration đánh số. ⚠️ retention **hot 12 tháng có khai báo**, **cold 5 năm chưa có gì**. ❌ **mã hoá truyền & lưu chưa có** (HTTP/MQTT trần, NF-05). ❌ consent tài xế mới là **bản nháp** — Q7 MỞ. ❌ chưa tuân thủ đủ Nghị định 13/2023 | [packages/db/](../../packages/db/src/) · [migrations/](../../packages/db/migrations/) · [auth/](../../apps/api/src/auth/) | [append-only.test.ts](../../packages/db/src/append-only.test.ts) · [telematics.test.ts](../../packages/db/src/telematics.test.ts) |

## H. Thanh toán & Gói dịch vụ

| Mã | Tính năng | Đợt | Trạng thái | Acceptance | Code | Test |
|---|---|---|---|---|---|---|
| F-H1 | Thanh toán phiên sạc in-app | P1.0 Must | 🟦 Sandbox | ✅ **không lưu thông tin thẻ** dưới bất kỳ hình thức nào (người dùng nhập thẳng trên trang VNPay) · webhook **đến 2 lần** hoặc **đến trước khi phiên đóng** đều ra đúng một giao dịch · có rào chắn kỹ thuật từ chối khởi động nếu URL không phải sandbox. ❌ "luồng quét→sạc→trả ≤3 bước" **chưa kiểm chứng được** vì chưa có màn hình app. ❌ "hoạt động khi sóng yếu (giữ phiên, thu sau)" chưa làm | [packages/payments/vnpay.ts](../../packages/payments/src/vnpay.ts) · [routes/payments.ts](../../apps/api/src/routes/payments.ts) · [modules/payments/](../../apps/api/src/modules/payments/) · [0027_payment_flow.sql](../../packages/db/migrations/0027_payment_flow.sql) | [vnpay.test.ts](../../packages/payments/src/vnpay.test.ts) + [payments.test.ts](../../apps/api/src/routes/payments.test.ts) — **32 test** |
| F-H2 | Ví & lịch sử giao dịch | P1.1 Should | ⬜ Chưa làm | — | — | — |
| F-H3 | Hóa đơn điện tử kWh | P1.1 Must | ⬜ Chưa làm | ❌ **KHÔNG có interface e-invoice** trong `packages/contracts` (xem "Đính chính" bên dưới). Dữ liệu sản lượng theo khách/phiên thì đã có. **Q9 MỞ** (nhà cung cấp HĐĐT) | [bao-cao.ts](../../apps/api/src/modules/reconciliation/bao-cao.ts) *(chỉ là nguồn dữ liệu)* | — |
| F-H4 | Billing thuê bao SaaS | P1.5 Should | ⬜ Chưa làm | — | — | — · **Q3 MỞ** (giá gói Standard) |

## I. CSKH & Dịch vụ

| Mã | Tính năng | Đợt | Trạng thái | Acceptance | Code | Test |
|---|---|---|---|---|---|---|
| F-I1 | Ticket hỗ trợ in-app | P1.1 Should | 🟨 Một phần | ⚠️ hạ tầng dùng chung với SOS đã có: bảng `tickets` với `vehicle_context` (VIN, vị trí, mã lỗi), `GET /tickets` theo phạm vi người gọi, `POST /tickets/{id}/nhan`. ❌ **chưa có** tạo ticket từ app, phân loại, SLA phản hồi, kênh Zalo/hotline. **D-09 MỞ** | [routes/tickets.ts](../../apps/api/src/routes/tickets.ts) · [0008_alerts_tickets.sql](../../packages/db/migrations/0008_alerts_tickets.sql) | [tickets.test.ts](../../apps/api/src/routes/tickets.test.ts) |
| F-I2 | Hỗ trợ sự cố (SOS) | P1.0 Must | ✅ Hoàn thành trên mock | ✅ `POST /sos` gửi vị trí + SOC + mã lỗi, tự đính kèm ngữ cảnh xe · job theo dõi ticket quá hạn. ❌ "gọi lại ≤5 phút" là **quy trình người**, chưa ai trực — **Q6 MỞ**. ❌ "hoạt động khi app nền" và "fallback gọi hotline" chưa kiểm chứng vì chưa có app | [modules/tickets/sos.ts](../../apps/api/src/modules/tickets/sos.ts) · [0023_tickets_sos.sql](../../packages/db/migrations/0023_tickets_sos.sql) | [tickets.test.ts](../../apps/api/src/routes/tickets.test.ts) — **13 test** |
| F-I3 | Đặt lịch bảo dưỡng | P1.5 Could | ⬜ Chưa làm | — | — | — |

## J. Quản lý thiết bị & Kết nối

| Mã | Tính năng | Đợt | Trạng thái | Acceptance | Code | Test |
|---|---|---|---|---|---|---|
| F-J1 | Sức khỏe thiết bị telematics | P1.0 Must | ✅ Hoàn thành trên mock | ✅ dashboard thiết bị · last-seen · **xe "im lặng" sinh cảnh báo phân biệt lỗi thiết bị với xe tắt máy**. ⚠️ firmware/SIM/nguồn điện: cột dữ liệu có, giá trị do simulator sinh | [modules/devices/health-scan.ts](../../apps/api/src/modules/devices/health-scan.ts) · [routes/devices.ts](../../apps/api/src/routes/devices.ts) · [0021_telemetry_v2_nguon_song.sql](../../packages/db/migrations/0021_telemetry_v2_nguon_song.sql) | [health-scan.test.ts](../../apps/api/src/modules/devices/health-scan.test.ts) |
| F-J2 | Cấu hình từ xa (OTA config) | P1.1 Should | ⬜ Chưa làm | — | — | — · **D-08 MỞ** |
| F-J3 | Cảnh báo offline & tháo thiết bị | P1.0 Must | ✅ Hoàn thành trên mock | ✅ **phân biệt mất nguồn đột ngột với mất sóng** bằng MQTT LWT (ADR-003) — demo Gate 0 bước 9b. ⚠️ **D-12 MỞ**: PRD nói báo cho "Quản lý rủi ro" nhưng vai trò đó **không có** trong ma trận phân quyền; đang tạm cấu hình cho `admin` + `fleet_manager` + `cskh` | [health-scan.ts](../../apps/api/src/modules/devices/health-scan.ts) · [ingest/pipeline.ts](../../services/ingest/src/pipeline.ts) · [vehicle-sim/scheduler.ts](../../simulators/vehicle-sim/src/scheduler.ts) | [health-scan.test.ts](../../apps/api/src/modules/devices/health-scan.test.ts) · [scheduler.test.ts](../../simulators/vehicle-sim/src/scheduler.test.ts) · [app.test.ts](../../apps/api/src/app.test.ts) |

## K. An toàn lái xe

| Mã | Tính năng | Đợt | Trạng thái | Acceptance | Code | Test |
|---|---|---|---|---|---|---|
| F-K1 | Chấm điểm hành vi lái | P1.1 Should | ⬜ Chưa làm | — | — | — |

---

## Test theo 5 luồng trọng yếu (quy tắc 7)

Đếm bằng số hàm `it()` / `test()` trong các file liên quan, không phải ước lượng:

| Luồng trọng yếu | Số test | File |
|---|---|---|
| Cảnh báo pin (đúng ngưỡng, chống spam) | **36** | `battery-alerts.test.ts`, `pipeline.test.ts` |
| Ghi phiên sạc | **10** | `csms/session.test.ts`, `csms/index.test.ts` |
| Đối soát 3 chiều (lệch >1% phải cảnh báo) | **42** | `reconcile.test.ts`, `soc.test.ts`, `bao-cao.test.ts` |
| Thanh toán sandbox (webhook trễ / 2 lần) | **32** | `vnpay.test.ts`, `payments.test.ts` |
| SOS | **13** | `tickets.test.ts` |
| *(bổ sung)* Gắn cờ vi phạm sạc | **27** | `detect.test.ts`, `violations.test.ts` |
| *(bổ sung)* RBAC & audit | **33** | `rbac.test.ts`, `users-audit.test.ts` |
| *(bổ sung)* Bảng append-only (NF-11) | **6** | `append-only.test.ts` |

**Chỗ test KHÔNG phủ** — nhà thầu cần biết trước khi động vào:

- **5 job chạy nền không có test nào** (mục N-05): scheduler của devices, payments,
  reconciliation, tickets, violations. Logic bên trong thì có test, phần *lập lịch* thì không.
- **`HttpCsmsCommander`** — cầu nối thanh toán → trụ sạc — không có test (mục N-07).
- **Buffer store-and-forward** chưa test mốc 48 giờ của NF-09 (mục N-08).

---

## Đính chính tài liệu phát hiện khi rà soát

Bốn chỗ tài liệu nói khác mã nguồn hoặc khác `DECISION-LOG.md`. Đã đối chiếu trực tiếp,
ghi ra đây thay vì sửa lặng lẽ:

1. **`docs/architecture/system-overview.md` khai có "Map adapter" và "E-invoice adapter"
   trong `packages/contracts` (interface + mock).** Thực tế **không có cả hai**.
   `packages/contracts/src/` chỉ chứa: `telemetry`, `telematics-source`, `ocpp`, `sms`,
   `notifier`, `payment`, `csms-command`. Ảnh hưởng trực tiếp tới F-D1, F-D2, F-H3 —
   nhà thầu SOW-03 và SOW-04 phải tính công **viết interface từ đầu**, không phải "thay mock
   bằng thật".
2. **`docs/prd/04-p1-chuc-nang.md` ghi "tổng 23 tính năng" cho P1.0 nhưng liệt kê 25 mã.**
   Xem cảnh báo ở phần Bảng tổng kết.
3. **`debt-register.md` đếm thiếu số quyết định đang MỞ.** Mục 3 của file đó ghi *"còn 7 mục
   D-xx và **12 mục Q-xx**"*. Đếm trực tiếp trong `DECISION-LOG.md` ngày 2026-08-20 thì có
   **18 mục Q-xx MỞ** (Q1–Q18 — con số 12 có từ trước khi PRD v3.0 thêm Q13–Q18), cộng thêm
   **3 mã TR-xx MỞ** (TR-02, TR-04, TR-05). Tổng thực tế: **28 mục MỞ**, không phải 19.
   Quan trọng với nhà thầu vì Q13 (giá điện động) chạm SOW-03 và Q15 (chia sẻ bản đồ với
   đối tác) chạm SOW-04.
4. **`npm run lint` đang ĐỎ trên máy dev** vì Prettier quét cả thư mục worktree tạm
   `.claude/worktrees/` (thư mục này nằm trong `.git/info/exclude` — chỉ có ở máy local,
   nên **CI vẫn xanh** do checkout sạch không có nó). `.prettierignore` cần thêm một dòng.
   Khác nguyên nhân với mục N-10 của debt-register (file rác `90%` — file này **vẫn đang
   được git theo dõi**, mục N-12).

---

## Nguồn để tự kiểm chứng lại bảng này

```bash
npm test
```

```bash
npm run openapi:generate && git diff --stat apps/api/openapi.json
```

```bash
gitleaks git . --no-banner --redact
```

Lệnh thứ hai phải cho diff **rỗng** — nghĩa là đặc tả OpenAPI đang khớp mã nguồn
(61 operation trên 62 route đã đăng ký; route còn lại là `/metrics`, cố ý ẩn bằng
`schema: { hide: true }` vì là endpoint hạ tầng, không phải hợp đồng API).
