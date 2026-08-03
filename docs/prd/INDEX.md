# INDEX — Tra cứu mã F-xx → file → trạng thái build

> Cập nhật cột "Trạng thái build" sau mỗi tính năng hoàn thành (Definition of Done trong CLAUDE.md).
> Trạng thái: ⬜ chưa build · 🔨 đang build · ✅ xong (test xanh + OpenAPI + docs) · ⏸ chặn bởi quyết định MỞ · 🔶 một phần (backend xong, thiếu mặt tiền — xem cột Ghi chú).
> Cảnh báo phụ thuộc: các mã có ghi chú D-xx đang chờ [DECISION-LOG](../DECISION-LOG.md).

## Danh sách file PRD

| File | Nguồn (sheet Excel PRD v2.0) |
|---|---|
| [00-tom-tat.md](00-tom-tat.md) | 0. Tóm tắt |
| [01-vision.md](01-vision.md) | 1. Tầm nhìn & North Star |
| [02-persona-hanh-trinh.md](02-persona-hanh-trinh.md) | 2. Persona & Hành trình |
| [03-muc-tieu-release-gates.md](03-muc-tieu-release-gates.md) | 3. Mục tiêu & Release Gates |
| [04-p1-chuc-nang.md](04-p1-chuc-nang.md) | 4. P1 - Chức năng |
| [05-phi-chuc-nang.md](05-phi-chuc-nang.md) | 5. P1 - Phi chức năng |
| [06-p2-chuc-nang.md](06-p2-chuc-nang.md) | 6. P2 - Chức năng |
| [07-benchmark-bai-hoc.md](07-benchmark-bai-hoc.md) | 7. Benchmark & Bài học |
| [08-du-lieu-tich-hop.md](08-du-lieu-tich-hop.md) | 8. Dữ liệu & Tích hợp |
| [09-rbac.md](09-rbac.md) | 9. Vai trò & Phân quyền |
| [10-kpi-metric-tree.md](10-kpi-metric-tree.md) | 10. KPI & Metric Tree |
| [11-lo-trinh.md](11-lo-trinh.md) | 11. Lộ trình |
| [12-tech-cach-build.md](12-tech-cach-build.md) | 12. Tech & Cách build |
| [13-rui-ro-gia-dinh.md](13-rui-ro-gia-dinh.md) | 13. Rủi ro & Giả định |
| [14-decisions.md](14-decisions.md) | 14. Quyết định cần chốt |
| [review-notes-duc.md](review-notes-duc.md) | update by Duc.xlsx — cột review sheet 4 |

## Phase 1 — Module A–K (chi tiết: [04-p1-chuc-nang.md](04-p1-chuc-nang.md))

| Mã | Tính năng | Đợt | MoSCoW | Trạng thái build | Ghi chú |
|---|---|---|---|---|---|
| F-A1 | Thu thập dữ liệu xe realtime | P1.0 | Must | ⬜ | |
| F-A2 | Cảnh báo pin phân cấp | P1.0 | Must | ⬜ | D-03 (định nghĩa "chuyến") |
| F-A3 | Sức khỏe pin (SOH) & chu kỳ | P1.1 | Should | ⬜ | |
| F-A4 | Phát hiện bất thường | P1.0 | Must | ⬜ | |
| F-A5 | Vị trí, hành trình & geofence | P1.0 | Must | ⬜ | Q12 (khóa xe từ xa) |
| F-A6 | Hiệu suất vận hành | P1.1 | Must | ⬜ | D-05 (chưa rõ actor) |
| F-B1 | Thiết lập chính sách sạc | P1.0 | Must | ⬜ | |
| F-B2 | Ghi nhận phiên sạc | P1.0 | Must | ⬜ | Append-only (NF-11) |
| F-B3 | Đối chiếu & gắn cờ vi phạm | P1.0 | Must | ⬜ | Q4 (chế tài) |
| F-B4 | Bảng trạng thái bảo hành | P1.1 | Must | ⬜ | |
| F-B5 | Cảnh báo nguy cơ mất bảo hành | P1.0 | Must | ⬜ | |
| F-B6 | Báo cáo vi phạm cho đội Bảo hành | P1.1 | Should | ⬜ | |
| F-C1 | Danh mục trạm sạc | P1.0 | Must | ⬜ | |
| F-C2 | Trạng thái trụ realtime | P1.0 | Must | ⬜ | |
| F-C3 | Hàng đợi & thời gian chờ | P1.5 | Should | ⬜ | |
| F-C4 | Đặt chỗ trụ sạc | P1.5 | Could | ⬜ | |
| F-C5 | Sản lượng điện theo trạm | P1.1 | Should | ⬜ | |
| F-C6 | Điện sử dụng theo khách hàng | P1.0 | Must | ⬜ | Đối soát 3 chiều (NF-10) |
| F-D1 | Bản đồ trạm sạc | P1.0 | Must | ⬜ | D-01 ĐÃ CHỐT (CÓ) · Q5 vẫn MỞ → đi qua `IMapProvider` |
| F-D2 | Điều hướng tới trạm | P1.0 | Must | ⬜ | D-01 ĐÃ CHỐT (CÓ) · Q5 vẫn MỞ |
| F-D3 | Range-aware | P1.1 | Should | ⬜ | D-01 ĐÃ CHỐT (CÓ) · Q5 vẫn MỞ |
| F-D4 | App tài xế (iOS & Android) | P1.0 | Must | ⬜ | D-01 ĐÃ CHỐT (CÓ) — chờ wireframe (INPUT-03 §2) |
| F-D5 | Chế độ offline | P1.1 | Should | ⬜ | D-01 ĐÃ CHỐT (CÓ) |
| F-E1 | Danh sách & bản đồ đội xe | P1.0 | Must | ⬜ | |
| F-E2 | Dashboard KPI đội xe | P1.1 | Must | ⬜ | |
| F-E3 | Báo cáo sạc & bảo hành | P1.1 | Must | ⬜ | D-06 (đội xe hay admin tổng) |
| F-E4 | Quản lý tài xế & phân công | P1.1 | Should | ⬜ | D-07 (mô hình quản lý) |
| F-F1 | Tài khoản & RBAC | P1.0 | Must | ⬜ | |
| F-F2 | Provisioning thiết bị | P1.0 | Must | ⬜ | D-08, Q7 (consent) |
| F-F3 | Thông báo đa kênh | P1.0 | Must | ⬜ | |
| F-F4 | Nhắc bảo dưỡng & ưu đãi | P1.1 | Should | ⬜ | |
| F-G1 | Tích hợp telematics Tri-Ring | P1.0 | Must | ⬜ | Q1 (Gate 0) — Phase 1 dùng mock |
| F-G2 | Tích hợp trạm sạc (OCPP) | P1.0 | Must | ⬜ | Q2, Q8 — Phase 1 dùng simulator |
| F-G3 | Pipeline dữ liệu (ETL) | P1.1 | Should | ⬜ | |
| F-G4 | Quản trị & bảo mật dữ liệu | P1.0 | Must | ⬜ | Q7 |
| F-H1 | Thanh toán phiên sạc in-app | P1.0 | Must | 🔶 | Backend XONG · D-01 ĐÃ CHỐT (CÓ) → còn màn hình quét QR · D-02 (RFID) vẫn MỞ; SANDBOX |
| F-H2 | Ví & lịch sử giao dịch | P1.1 | Should | ⬜ | D-01 ĐÃ CHỐT (CÓ) |
| F-H3 | Hóa đơn điện tử kWh | P1.1 | Must | ⏸ | D-01 ĐÃ CHỐT (CÓ) · **Q9 vẫn MỞ** — biên nhận hiện chưa phải hoá đơn hợp lệ |
| F-H4 | Billing thuê bao SaaS | P1.5 | Should | ⏸ | D-01 ĐÃ CHỐT (CÓ) · **Q3 vẫn MỞ** (giá gói) |
| F-I1 | Ticket hỗ trợ in-app | P1.1 | Should | ⏸ | D-09, Q6 |
| F-I2 | Hỗ trợ sự cố (SOS) | P1.0 | Must | 🔶 | Backend XONG · D-01 ĐÃ CHỐT (CÓ) → còn nút SOS trên app · **D-09/Q6 vẫn MỞ** (chưa có người trực 24/7) ⚠️ |
| F-I3 | Đặt lịch bảo dưỡng | P1.5 | Could | ⏸ | D-09 |
| F-J1 | Sức khỏe thiết bị telematics | P1.0 | Must | ⬜ | |
| F-J2 | Cấu hình từ xa (OTA config) | P1.1 | Should | ⬜ | D-08 |
| F-J3 | Cảnh báo offline & tháo thiết bị | P1.0 | Must | ⬜ | |
| F-K1 | Chấm điểm hành vi lái | P1.1 | Should | ⬜ | D-01 ĐÃ CHỐT (CÓ) → có hiển thị ở app tài xế |

Phạm vi P1.0 (Day-1, 23 tính năng — theo sheet 4): A1, A2, A4, A5 · B1, B2, B3, B5 · C1, C2, C6 · D1, D2, D4 · E1 · F1, F2, F3 · G1, G2, G4 · H1 · I2 · J1, J3.

## Phase 2 — Module L–P (chi tiết: [06-p2-chuc-nang.md](06-p2-chuc-nang.md))

Các mã F-L1..L7, F-M1..M4, F-N1..N3, F-O1..O4, F-P1..P4 thuộc Phase 2 — NGOÀI phạm vi build hiện tại (chờ Gate 3). Không liệt kê trạng thái build.

## Yêu cầu phi chức năng

NF-01 … NF-18: xem [05-phi-chuc-nang.md](05-phi-chuc-nang.md) — áp dụng xuyên suốt, không có trạng thái build riêng.
