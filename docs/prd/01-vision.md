# 1 · TẦM NHÌN, ĐỊNH VỊ & NORTH STAR

> Nguồn: sheet "1. Tầm nhìn & North Star" — PRD v2.0. Chuyển đổi trung thực, không diễn giải lại.

G3 Network là "bộ não" phần mềm & dữ liệu kết nối G3 Mobility (xe) và G3 Energy (trạm sạc) thành hệ sinh thái vận tải điện khép kín

## Tầm nhìn · Sứ mệnh · Định vị

| Mục | Nội dung |
|---|---|
| TẦM NHÌN | Nền tảng vận hành & dữ liệu số 1 cho vận tải hàng hóa điện tại Việt Nam và khu vực GMS — từ quản lý xe–pin–trạm sạc đến điều phối logistics thông minh. |
| SỨ MỆNH | Giúp khách hàng vận hành xe điện an toàn, đúng bảo hành, tối ưu chi phí/km; giúp G3 Mobility & Energy ra quyết định bằng dữ liệu; kết nối chủ xe – chủ hàng để giảm chạy rỗng. |
| ĐỊNH VỊ 1 CÂU | "Hệ điều hành cho vận tải hàng hóa điện" — phần mềm duy nhất hiểu đồng thời: pin của xe, trạm sạc trên tuyến, và (P2) hàng hóa cần chở. |

## Khác biệt cốt lõi (Moat) — vì sao G3 Network thắng

| Lợi thế | Nội dung | Vì sao khó sao chép | Điều kiện để giữ lợi thế |
|---|---|---|---|
| Khép kín Xe–Sạc–Dữ liệu | Đội xe điện + mạng trạm sạc riêng (G3 Energy) + telematics riêng trên cùng một nền dữ liệu | Sàn nhiên liệu (Manbang…) không có trạm sạc; hãng sạc không có xe; hãng xe không có sàn | Dữ liệu Mobility & Energy phải liên thông từ ngày 1 (không xây 2 hệ tách rời) |
| Lập tuyến EV-aware (P2) | Tuyến vận tải tính sẵn điểm sạc theo SOC thực & trạng thái trạm realtime | Cần đồng thời telematics pin + trạng thái trụ realtime — đối thủ thiếu 1 trong 2 | Độ chính xác trạng thái trụ ≥99% và mô hình tiêu hao pin theo tải trọng |
| Thực thi bảo hành bằng dữ liệu | Chính sách sạc, gắn cờ vi phạm, điểm tuân thủ — gắn mô hình bán/cho thuê & tài trợ của G3 | Yêu cầu quyền truy cập BMS gốc theo hợp đồng phân phối Tri-Ring | Dữ liệu phiên sạc phải đủ giá trị pháp lý (toàn vẹn, có đối soát chéo) |
| Cold-start marketplace (P2) | Cung/cầu "mồi": đội xe G3 + InterLOG (VLA/FIATA) + HS Logistics (200+ đầu kéo) | Đối thủ mới phải đốt tiền mua 2 phía; G3 có sẵn cả cung lẫn cầu nội bộ | MOU với đối tác mồi ký trước khi build sàn (xem sheet 14) |
| Dữ liệu vận hành độc quyền | BMS/telematics + trạm sạc → nền cho AI: dự đoán bảo trì, tuổi thọ pin, quy hoạch trạm | Dữ liệu tích lũy theo thời gian, không mua được | Chất lượng & chuẩn hóa dữ liệu (data governance) từ P1 |

## Gói dịch vụ (SaaS) — đã bổ sung nội dung thanh toán & billing

| Gói | Đối tượng · Giá | Tính năng chính | Ghi chú v2.0 |
|---|---|---|---|
| Basic — miễn phí | Khách mua xe G3 (kích hoạt khi bàn giao) · 0đ | Theo dõi pin/xe cơ bản; cảnh báo pin phân cấp; tìm & điều hướng trạm; THANH TOÁN SẠC trong app; CSKH chữa lỗi; nhắc bảo dưỡng | Thanh toán sạc & SOS đưa vào Basic — vì phục vụ vận hành an toàn ngày 1, không phải tính năng bán thêm |
| Standard | Đội xe cần quản lý & báo cáo · thuê bao/xe/tháng (chốt giá: sheet 14) | Thêm: portal & KPI đội xe; báo cáo sạc–bảo hành; quản lý tài xế; điểm an toàn lái; hóa đơn kWh tổng hợp | Billing tự động theo xe/tháng (F-H4) — v1.0 chưa có cơ chế thu tiền gói này |
| Premium — Fleet & Logistics (P2) | Đội xe lớn & nhu cầu logistics · thuê bao + phí giao dịch (take rate) | Thêm: lập tuyến EV-aware; sàn ghép nối; tối ưu chạy rỗng; VAS (tài chính, năng lượng, ETC) | Chỉ mở khi qua Gate 3 (sheet 3) |

## North Star Metric (chi tiết cây chỉ số: sheet 10)

| Mục | Định nghĩa | Vì sao chọn | Mục tiêu |
|---|---|---|---|
| NSM Phase 1 | SỐ XE HOẠT ĐỘNG KHỎE MẠNH HÀNG TUẦN (Weekly Healthy Active Vehicles): xe có dữ liệu online ≥5 ngày/tuần VÀ không vi phạm chính sách sạc trong tuần. | Gộp được cả 3 mục tiêu P1: xe online (dữ liệu), tuân thủ sạc (bảo hành), đang được khai thác (giá trị khách hàng). | Mục tiêu: ≥85% đội xe vào cuối 2026 |
| NSM Phase 2 | GMV GHÉP NỐI THÀNH CÔNG/THÁNG kèm chỉ số sức khỏe: % km rỗng giảm. | GMV đơn thuần có thể đẹp mà lỗ; ghép với km rỗng giảm để bảo đảm sàn tạo giá trị thật (bài học Convoy). | Mục tiêu: tăng trưởng quý & km rỗng giảm ≥15% |
