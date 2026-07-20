# 11 · LỘ TRÌNH 2026–2029 (gắn kế hoạch xe & trạm sạc, chèn Pilot & Gates)

> Nguồn: sheet "11. Lộ trình" — PRD v2.0. Chuyển đổi trung thực, không diễn giải lại.

Nguyên tắc: tích hợp sớm 2 phụ thuộc cứng (Tri-Ring & OCPP); không roll-out khi chưa qua gate; nền dữ liệu P1 mở rộng được sang P2

| Giai đoạn | Mốc kinh doanh (xe & trạm) | Hạng mục phần mềm (deliverables) | Phase / Gate |
|---|---|---|---|
| Q1/2026 | CHỐT đặc tả telematics Tri-Ring & điều khoản OCPP trong mua sắm trụ | Thiết lập nền tảng; mô hình dữ liệu; mock telematics + OCPP; luồng e2e giả lập (xe → cảnh báo → phiên sạc → đối soát) | GATE 0 |
| Q2/2026 | Lắp đặt trạm đầu tiên; nhận xe mẫu | Build P1.0 (23 tính năng — sheet 4): app tài xế, portal, cảnh báo pin, kiểm soát sạc, trạng thái trạm, thanh toán sạc, SOS, thiết bị; tích hợp phần cứng thật; pen-test | P1.0 |
| Đầu H2/2026 | PILOT: 20–30 xe + 2–3 trạm, 4–6 tuần | Vận hành thật quy mô nhỏ; đo 6 tiêu chí Gate 1; sửa lỗi; diễn tập SOS/cứu hộ & khôi phục dữ liệu | GATE 1 |
| H2/2026 | Lô đầu: 150 EVT-262 + 150 EVT-400 · Trạm: 40 trụ 240kW + 15 trụ 400kW (110 súng) | Roll-out đại trà P1.0; kích hoạt Basic khi bàn giao; theo dõi NSM hàng tuần | GATE 2 → P1 |
| Q4/2026 – Q2/2027 | Mở rộng vận hành; nâng 220 súng | P1.1: SOH, range-aware, offline mode, dashboard KPI, báo cáo, ví, hóa đơn điện tử, ticket CSKH, OTA config, điểm an toàn lái | P1.1 |
| 2027 | Chuẩn bị P2 | P1.5: đặt chỗ trụ, hàng đợi, billing SaaS, đặt lịch bảo dưỡng; AI cơ bản (SOH/bảo trì); báo cáo liên công ty; đánh giá Gate 3 | P1.5 → GATE 3 |
| 2027–2028 | 600 xe (200 mỗi dòng 262/400/825) · Trạm: 70 trụ 240kW + 40 trụ 400kW | P2 MVP: sàn ghép nối có KYC (L1–L3, L6) + e-contract/e-POD (N1) → escrow & tranh chấp (L7, N2) → lập tuyến EV-aware & backhaul (M1, M3) | P2 (MVP) |
| 2028–2029 | 1.200 xe · Trạm: 150 trụ 240kW + 80 trụ 400kW (460 súng) | P2 scale: sàn đầy đủ + VAS (tài chính, năng lượng, ETC); xuyên biên GMS; BESS & ToU; AI định giá/dự báo | P2 (Scale) |
