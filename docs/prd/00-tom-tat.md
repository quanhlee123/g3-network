# 0 · G3 NETWORK · TÓM TẮT

> Nguồn: sheet "0. Tóm tắt" — PRD v2.0 (`G3 Network Định hướng và Yêu cầu sản phẩm app (PRD).xlsx`).
> Chuyển đổi trung thực, không diễn giải lại. Sheet này là sheet phụ (ngoài 14 sheet chính 1–14).

Nền tảng phần mềm & dữ liệu hệ sinh thái G3 · Phase 1 (Xe–Pin–Trạm sạc) · Phase 2 (Logistics) · Đầu vào cho Ban lãnh đạo review & Claude Code dựng khung

## Thông tin tài liệu

| Mục | Nội dung |
|---|---|
| Sản phẩm | G3 Network — nền tảng phần mềm & dữ liệu dùng chung của G3 Mobility · G3 Energy · G3 Network |
| Tuyên bố 1 câu (elevator pitch) | "Hệ điều hành cho vận tải hàng hóa điện": giúp xe G3 chạy an toàn – đúng bảo hành – rẻ hơn mỗi km ở Phase 1, và trở thành sàn logistics EV-aware duy nhất tại VN/GMS ở Phase 2. |
| Cách dùng tài liệu | Sheet 1–3: định hướng cho lãnh đạo · Sheet 4–9: đặc tả cho team sản phẩm/Dev/Claude Code · Sheet 10–14: quản trị (KPI, lộ trình, rủi ro, quyết định) |

## Hướng dẫn đọc các sheet

| Sheet | Nội dung | Dành cho |
|---|---|---|
| 1. Tầm nhìn & North Star | Vai trò hệ sinh thái, tầm nhìn/sứ mệnh, khác biệt cốt lõi, gói dịch vụ, North Star Metric | Lãnh đạo · Toàn team |
| 2. Persona & Hành trình | 5 persona (nỗi đau, việc cần làm, tính năng then chốt) + 2 hành trình người dùng chính | Sản phẩm · Thiết kế UX |
| 3. Mục tiêu & Release Gates | Mục tiêu theo phase, non-goals, cổng kiểm soát Gate 0–3 với tiêu chí go/no-go | Lãnh đạo · PM |
| 4. P1 - Chức năng | Module A–K với đợt phát hành (P1.0/P1.1/P1.5), MoSCoW, user story, tiêu chí chấp nhận | Dev · Claude Code |
| 5. P1 - Phi chức năng | Hiệu năng, SLA, bảo mật, riêng tư, tin cậy, vận hành — đã siết ngưỡng cụ thể | Dev · DevOps |
| 6. P2 - Chức năng | Module L–P: sàn ghép nối (kèm KYC & tranh chấp), lập tuyến EV-aware, đơn & thanh toán, VAS, AI | Sản phẩm · Dev |
| 7. Benchmark & Bài học | Tham chiếu P1/P2 rút gọn — mỗi nền tảng 1 bài học hành động được | Sản phẩm |
| 8. Dữ liệu & Tích hợp | Thực thể dữ liệu, tích hợp (thêm quản lý thiết bị, versioning, retention), luồng dữ liệu | Dev · Data |
| 9. Vai trò & Phân quyền | Ma trận RBAC — thêm vai trò CSKH và quyền thanh toán | Dev · Bảo mật |
| 10. KPI & Metric Tree | North Star + chỉ số kết quả + chỉ số dẫn dắt; owner & tần suất đo | Lãnh đạo · PM |
| 11. Lộ trình | 2026–2029 gắn kế hoạch xe & trạm; chèn giai đoạn Pilot + gates | Lãnh đạo · PM |
| 12. Tech & Cách build | Kiến trúc, stack, phạm vi từng đợt, hướng dẫn cho Claude Code (đã cập nhật theo module mới) | Dev · Claude Code |
| 13. Rủi ro & Giả định | Rủi ro mở rộng (thêm chi phí bản đồ, adoption tài xế, kịch bản Tri-Ring trễ có trigger) | Lãnh đạo · PM |
| 14. Quyết định cần chốt | 12 câu hỏi mở — phương án, người quyết, deadline | Lãnh đạo |

> Tra cứu mã F-xx → file → trạng thái build: xem [INDEX.md](INDEX.md).
