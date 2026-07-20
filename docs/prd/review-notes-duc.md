# Ghi chú review của Đức — sheet "4. P1 - Chức năng"

> Nguồn: file `update by Duc.xlsx`, sheet "4. P1 - Chức năng", cột I (cột bổ sung so với PRD gốc).
> File này còn 1 sheet "4b. P1 Thiết kế" chỉ chứa ảnh sơ đồ kiến trúc — đã vẽ lại tại
> [docs/architecture/system-overview.mmd](../architecture/system-overview.mmd).
> Chuyển đổi trung thực; cột "Xử lý" là phân loại khi chuyển đổi (không phải nội dung gốc).

| Mã | Tính năng | Ghi chú của Đức (nguyên văn) | Xử lý |
|---|---|---|---|
| F-A6 | Hiệu suất vận hành | Chưa rõ Actor | Câu hỏi → [DECISION-LOG](../DECISION-LOG.md) D-05 (MỞ) |
| F-B1 | Thiết lập chính sách sạc | Không phải chức năng | Nhận xét phân loại — giữ để PM xem xét |
| F-B6 | Báo cáo vi phạm cho đội Bảo hành | Should | Nhận xét mức ưu tiên (trùng MoSCoW hiện tại) |
| F-C3 | Hàng đợi & thời gian chờ | Should | Nhận xét mức ưu tiên (trùng MoSCoW hiện tại) |
| F-C4 | Đặt chỗ trụ sạc | Could | Nhận xét mức ưu tiên (trùng MoSCoW hiện tại) |
| F-D4 | App tài xế (iOS & Android) | Cân nhắc app tài xế ở p1 | Câu hỏi → DECISION-LOG D-01 (MỞ, đã có sẵn) |
| F-D5 | Chế độ offline | Yêu cầu phi chức năng/Logic nội bộ | Nhận xét phân loại — giữ để PM xem xét |
| F-E3 | Báo cáo sạc & bảo hành | Cho đội xe hay cho admin tổng | Câu hỏi → DECISION-LOG D-06 (MỞ) |
| F-E4 | Quản lý tài xế & phân công | Thống nhất mô hình quản lý | Câu hỏi → DECISION-LOG D-07 (MỞ) |
| F-F1 | Tài khoản & RBAC | Logic nội bộ | Nhận xét phân loại — giữ để PM xem xét |
| F-F2 | Provisioning thiết bị | Chưa hiểu chức năng | Câu hỏi → DECISION-LOG D-08 (MỞ) |
| F-F3 | Thông báo đa kênh | Logic nội bộ | Nhận xét phân loại — giữ để PM xem xét |
| F-G1 | Tích hợp telematics Tri-Ring | Yêu cầu phi chức năng/Logic nội bộ | Nhận xét phân loại — giữ để PM xem xét |
| F-G2 | Tích hợp trạm sạc (OCPP) | Yêu cầu phi chức năng/Logic nội bộ | Nhận xét phân loại — giữ để PM xem xét |
| F-G3 | Pipeline dữ liệu (ETL) | Yêu cầu phi chức năng/Logic nội bộ | Nhận xét phân loại — giữ để PM xem xét |
| F-G4 | Quản trị & bảo mật dữ liệu | Yêu cầu phi chức năng/Logic nội bộ | Nhận xét phân loại — giữ để PM xem xét |
| F-H1 | Thanh toán phiên sạc in-app | Cân nhắc app tài xế ở p1 | Câu hỏi → DECISION-LOG D-01 (MỞ, đã có sẵn) |
| F-H2 | Ví & lịch sử giao dịch | Cân nhắc app tài xế ở p1 | Câu hỏi → DECISION-LOG D-01 (MỞ, đã có sẵn) |
| F-H3 | Hóa đơn điện tử kWh | Cân nhắc app tài xế ở p1 | Câu hỏi → DECISION-LOG D-01 (MỞ, đã có sẵn) |
| F-H4 | Billing thuê bao SaaS | Cân nhắc app tài xế ở p1 | Câu hỏi → DECISION-LOG D-01 (MỞ, đã có sẵn) |
| F-I1 | Ticket hỗ trợ in-app | Chưa có ý tưởng | Câu hỏi → DECISION-LOG D-09 (MỞ) |
| F-I2 | Hỗ trợ sự cố | Chưa có ý tưởng | Câu hỏi → DECISION-LOG D-09 (MỞ) |
| F-I3 | Đặt lịch bảo dưỡng | Chưa có ý tưởng | Câu hỏi → DECISION-LOG D-09 (MỞ) |
| F-J2 | Cấu hình từ xa (OTA config) | Chưa hiểu chức năng | Câu hỏi → DECISION-LOG D-08 (MỞ) |
| F-K1 | Chấm điểm hành vi lái | Cân nhắc app tài xế ở p1 | Câu hỏi → DECISION-LOG D-01 (MỞ, đã có sẵn) |

Ghi chú: các dòng không xuất hiện trong bảng (F-A1…F-A5, F-B2…F-B5, F-C1/C2/C5/C6, F-D1/D2/D3, F-E1/E2, F-F4, F-J1, F-J3) không có ghi chú ở cột I trong file của Đức.
