# 2 · PERSONA & HÀNH TRÌNH NGƯỜI DÙNG (MỚI trong v2.0)

> Nguồn: sheet "2. Persona & Hành trình" — PRD v2.0. Chuyển đổi trung thực, không diễn giải lại.

Thiết kế cho người dùng thật, không chỉ cho vai trò hệ thống · 5 persona chính + 2 hành trình then chốt

## 5 Persona chính

| Persona | Bối cảnh & nỗi đau | Việc cần làm (Jobs-to-be-done) | Tính năng then chốt | Khoảnh khắc thành công |
|---|---|---|---|---|
| Tài xế đầu kéo | Lần đầu lái xe điện; sợ hết pin giữa đèo; điện thoại Android tầm trung; sóng yếu vùng biên; không quen app phức tạp | Biết còn chạy được bao xa; tìm trạm còn trống trên tuyến; sạc & trả tiền nhanh để chạy tiếp; gọi CSKH khi sự cố | Cảnh báo pin phân cấp (F-A2) · bản đồ + điều hướng trạm (D1–D3) · thanh toán QR (H1) · CSKH (I2) · chế độ offline (D5) | Hoàn thành chuyến biên giới đầu tiên không lo lắng về pin; sạc & thanh toán dưới 2 phút thao tác |
| Quản lý đội xe | Quen Excel & Zalo; lo xe mất bảo hành do tài xế sạc sai; cần báo cáo chi phí/km cho sếp mỗi tuần | Nhìn toàn đội 1 màn hình; biết xe/tài xế nào vi phạm sạc; xuất báo cáo nhanh; phân công xe–tài xế | Portal đội xe (E1–E2) · bảng bảo hành theo xe (B4) · báo cáo file CSV/PDF (E3) · quản lý tài xế (E4) · điểm an toàn lái (K1) | Báo cáo tuần tự động thay 3 giờ làm Excel; bắt được vi phạm sạc trước khi thành chuyện bảo hành |
| Vận hành G3 Energy | Chịu KPI doanh thu điện & uptime trụ; đau đầu đối soát kWh cuối tháng; trụ lỗi mà không biết realtime | Thấy trạng thái mọi trụ/súng; được báo khi trụ Faulted; đối soát kWh khớp với telematics xe; báo cáo sản lượng theo trạm | Trạng thái trụ realtime (C2) · sản lượng theo trạm (C5) · đối soát kWh (C6, NF-15) · cảnh báo thiết bị (J3) | Đối soát cuối tháng khớp >99%, phát hiện trụ lỗi trong vòng vài phút thay vì khi khách phàn nàn |
| Bảo hành G3 Mobility | Xử lý yêu cầu bảo hành pin trị giá lớn; cần bằng chứng dữ liệu khi từ chối/chấp nhận bảo hành theo hợp đồng | Cấu hình chính sách sạc theo dòng xe; xem lịch sử vi phạm kèm bằng chứng; xuất hồ sơ cho quyết định bảo hành | Chính sách sạc (B1) · gắn cờ vi phạm + bằng chứng (B3) · báo cáo vi phạm (B6) · toàn vẹn dữ liệu (NF-15) | Ra quyết định bảo hành có hồ sơ dữ liệu đầy đủ, giảm tranh cãi với khách |
| Chủ hàng (nhà máy, 40 chuyến/tháng) | Giá cước mờ ám qua môi giới; không biết hàng đang ở đâu; ngại xe lạ không xác minh | Đăng lô hàng & nhận báo giá minh bạch; theo dõi đơn realtime; đối tác được xác minh; e-POD làm bằng chứng | Đăng hàng (L1) · KYC & xếp hạng (L6, L5) · theo dõi đơn + e-POD (N1) · tranh chấp (L7) | Chuyến đầu tiên: giá rõ trước khi chốt, thấy xe realtime, nhận e-POD trong ngày |

## Hành trình 1 — Tài xế: từ bàn giao xe đến chuyến đi hằng ngày (P1)

| Bước | Hành động | Tính năng liên quan | Điểm rơi rớt (drop-off) cần đo | Yêu cầu thiết kế |
|---|---|---|---|---|
| 1. Bàn giao & kích hoạt | Nhân viên G3 kích hoạt thiết bị theo VIN; tài xế cài app, đăng nhập bằng SĐT, xe hiện trong app ngay | F-F2 provisioning · F-F1 tài khoản | % kích hoạt thành công tại chỗ (mục tiêu ≥98%) | Onboarding ≤5 phút, có nhân viên hỗ trợ; hướng dẫn bằng video tiếng Việt |
| 2. Chuyến đầu tiên | Xem SOC & quãng đường còn lại; nhận cảnh báo 30% khi đến gần ngưỡng; app gợi ý trạm trên tuyến | F-A2 · F-D3 range-aware | % tài xế mở app trong 7 ngày đầu | Màn hình chính: 3 con số lớn (SOC, km còn lại, trạm gần nhất) — dùng được với găng tay, ngoài nắng |
| 3. Sạc & thanh toán | Đến trạm còn trống theo điều hướng; quét QR trụ; sạc; thanh toán VNPay/Momo/ví; nhận biên nhận kWh | F-D2 · F-H1 · F-H2 | Thời gian từ đỗ xe đến bắt đầu sạc (mục tiêu ≤3 phút) | Luồng quét-sạc-trả tối đa 3 bước; hoạt động khi sóng yếu (giữ phiên, đồng bộ sau) |
| 4. Sự cố dọc đường | Nhấn CSKH → hệ thống gửi vị trí + mã lỗi cho CSKH; nhân viên G3 liên hệ | F-I2 CSKH · F-A4 bất thường | Thời gian phản hồi (mục tiêu ≤5 phút gọi lại) | Nút CSKH khắc phục lỗi luôn hiển thị |
| 5. Hằng ngày | Nhận nhắc bảo dưỡng; xem lịch sử chuyến & chi phí; giữ điểm tuân thủ sạc tốt | F-F4 · F-A6 · F-B5 | DAU/MAU tài xế; % cảnh báo pin được xử lý | Thông báo đúng lúc, không spam (giới hạn tần suất) |

## Hành trình 2 — Quản lý đội xe: tuần vận hành điển hình (P1)

| Bước | Hành động | Tính năng liên quan | Điểm rơi rớt cần đo | Yêu cầu thiết kế |
|---|---|---|---|---|
| 1. Sáng thứ 2 | Mở portal: bản đồ toàn đội, xe offline, cảnh báo qua đêm | F-E1 · F-J3 | % quản lý đăng nhập hàng tuần | Trang chủ = 1 màn hình tổng quan, không cần click sâu |
| 2. Trong tuần | Nhận cảnh báo vi phạm sạc → nhắc tài xế; theo dõi xe có SOH giảm bất thường | F-B3 · F-B5 · F-A3 | Thời gian từ vi phạm → xử lý | Cảnh báo kèm hành động gợi ý (gọi tài xế, xem bằng chứng) |
| 3. Cuối tuần | Xuất báo cáo: km, kWh, chi phí/km, tuân thủ sạc, điểm an toàn lái theo xe/tài xế | F-E2 · F-E3 · F-K1 | % báo cáo được xuất/đội/tháng | Xuất 1 click CSV/PDF; mẫu báo cáo cho sếp duyệt |
| 4. Cuối tháng | Đối chiếu hóa đơn kWh tổng hợp với chi phí sạc từng xe; thanh toán thuê bao Standard | F-H3 · F-H4 | Sai lệch đối soát (mục tiêu <1%) | Hóa đơn điện tử hợp lệ theo quy định VN |
