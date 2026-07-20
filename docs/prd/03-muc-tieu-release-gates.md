# 3 · MỤC TIÊU THEO PHASE & CỔNG KIỂM SOÁT (RELEASE GATES)

> Nguồn: sheet "3. Mục tiêu & Release Gates" — PRD v2.0. Chuyển đổi trung thực, không diễn giải lại.

Mỗi giai đoạn có tiêu chí go/no-go định lượng — KHÔNG roll-out diện rộng khi chưa qua gate (bổ sung mới v2.0)

## PHASE 1 — Nền tảng vận hành Xe · Pin · Trạm sạc (2026)

| Mục tiêu | Mô tả | Kết quả mong đợi (Outcome) | Mốc |
|---|---|---|---|
| Mọi xe bàn giao đều online | Thu thập telematics (SOC/SOH, GPS, km, motor, nhiệt độ pin) từ xe Tri-Ring; giám sát sức khỏe thiết bị | ≥98% provisioning thành công; nền móng cho cảnh báo, báo cáo, AI | H2/2026 |
| Không xe nào hết pin giữa hành trình | Cảnh báo pin phân cấp 30/20/10% + điều hướng trạm còn trống + range-aware + CSKH khi sự cố | Ca hết pin dọc đường tiệm cận 0; mọi sự cố đều có giải pháp | H2/2026 |
| Bảo vệ bảo hành bằng dữ liệu | Chính sách sạc (ToU, SOC min–max, công suất) + gắn cờ vi phạm + bằng chứng đủ giá trị đối chiếu hợp đồng | Tuân thủ ≥90%; hồ sơ bảo hành có dữ liệu; giảm tranh chấp | H2/2026 |
| Trạm sạc minh bạch & thu được tiền | Trạng thái trụ realtime; thanh toán phiên sạc in-app; đối soát kWh 3 chiều (trụ–xe–thanh toán) | Tài xế tìm trạm chính xác; doanh thu điện đối soát khớp >99% | H2/2026 |
| Kích hoạt & giữ chân khách mua xe | Gói Basic kích hoạt khi bàn giao; onboarding ≤5 phút; đo activation & retention | Kích hoạt ≥80%; tài xế dùng hàng tuần ≥70% | H2/2026 |
| Nền dữ liệu dùng chung sẵn sàng cho P2 | Pipeline thu thập–chuẩn hóa–lưu trữ; versioning schema; data governance; báo cáo liên công ty | Dữ liệu sạch liên thông Mobility–Energy; đủ 6 tháng dữ liệu tuyến trước khi build P2 | 2026–2027 |

## PHASE 2 — Logistics thông minh, mô hình lõi Manbang (2027–2029)

| Mục tiêu | Mô tả | Kết quả mong đợi | Mốc |
|---|---|---|---|
| Lập kế hoạch EV-aware | Tuyến tính sẵn điểm sạc theo SOC thực, tải trọng & mạng trạm G3 (khác biệt cốt lõi) | Loại bỏ rủi ro hết pin theo tuyến; tối ưu thời gian & chi phí | 2027–2028 |
| Sàn ghép nối có niềm tin | Marketplace 2 phía + KYC/xác minh + xếp hạng + xử lý tranh chấp + e-contract/e-POD | Tỷ lệ ghép ≥70%; tranh chấp <2% đơn; đối tác quay lại | 2027–2028 |
| Giảm chạy rỗng | Ghép chiều về & gom hàng | Km rỗng giảm ≥15% | 2027–2029 |
| Dịch vụ giá trị gia tăng | Tài chính/bảo hiểm, gói năng lượng ToU, ETC xuyên biên GMS, cho thuê xe | Doanh thu nền tảng đa dòng; khép kín hệ sinh thái | 2028–2029 |
| AI & dữ liệu nâng cao | Dự báo nhu cầu, định giá, bảo trì dự đoán/tuổi thọ pin; báo cáo nhập xe & quy hoạch trạm | Quyết định dựa dữ liệu toàn hệ sinh thái | 2028–2029 |

## NON-GOALS Phase 1 (chống mở rộng phạm vi)

KHÔNG làm ở P1: sàn ghép nối/marketplace · tối ưu lộ trình đa điểm & gom chuyến · dịch vụ tài chính/bảo hiểm/ETC · AI nâng cao (định giá, dự báo thị trường) — chỉ AI cơ bản SOH/bảo trì cuối P1 · điều khiển xe từ xa kiểu Tesla (khóa/mở, điều hòa) — chỉ hỗ trợ giám sát & khóa phục vụ thu hồi theo quy trình pháp lý · đặt chỗ trụ sạc là P1.5, không chặn roll-out.

## RELEASE GATES — tiêu chí go/no-go (MỚI v2.0)

| Gate | Thời điểm | Tiêu chí PHẢI đạt để đi tiếp | Nếu không đạt |
|---|---|---|---|
| GATE 0 — Sẵn sàng build | Q1/2026 | ① Thuần telematics Tri-Ring ký xác nhận (trường dữ liệu, tần suất, giao thức, môi trường test) ② Trụ sạc mua sắm có điều khoản OCPP 1.6J bắt buộc ③ Luồng mock end-to-end chạy: xe giả lập → cảnh báo pin → phiên sạc giả lập → đối soát | KHÔNG build tính năng phụ thuộc phần cứng; kích hoạt phương án B (gateway OBD bên thứ 3 — sheet 13) |
| GATE 1 — Pilot | Đầu H2/2026, trước bàn giao đại trà | PILOT 20–30 xe + 2–3 trạm trong 4–6 tuần: ① provisioning ≥95% ② độ trễ dữ liệu ≤30s (p95) ③ 100% phiên sạc ghi nhận & đối soát ④ thanh toán sạc end-to-end hoạt động ⑤ 0 sự cố mất dữ liệu nghiêm trọng ⑥ CSAT tài xế pilot ≥75% | Kéo dài pilot; KHÔNG bàn giao gói Basic đại trà khi chưa đạt |
| GATE 2 — Roll-out 300 xe | H2/2026 | ① Gate 1 pass ② uptime ≥99.5% trong pilot ③ quy trình CSKH & cứu hộ diễn tập thành công ④ pen-test hoàn tất, lỗi nghiêm trọng = 0 ⑤ tuân thủ Nghị định 13/2023 (consent, thông báo xử lý dữ liệu) | Roll-out theo lô nhỏ 50 xe/đợt cho tới khi ổn định |
| GATE 3 — Khởi động Phase 2 | 2027 | ① ≥250 xe hoạt động khỏe mạnh hàng tuần ② ≥6 tháng dữ liệu tuyến & tiêu hao pin theo tải ③ MOU nguồn hàng "mồi" ký với InterLOG/HS Logistics ④ pháp lý sàn vận tải & e-contract được Legal xác nhận ⑤ unit economics sàn được duyệt (tránh bài học Convoy) | Hoãn P2; tiếp tục khai thác SaaS P1 — KHÔNG build sàn khi thiếu cung/cầu mồi |

Ghi chú chuyển đổi: dòng gốc trong Excel ghi "Thuần telematics Tri-Ring ký xác nhận" tại Gate 0 — giữ nguyên văn [CẦN LÀM RÕ: có thể là "chuẩn/đặc tả telematics", đối chiếu Q1 sheet 14].
