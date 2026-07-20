# 13 · RỦI RO, PHỤ THUỘC & GIẢ ĐỊNH

> Nguồn: sheet "13. Rủi ro & Giả định" — PRD v2.0. Chuyển đổi trung thực, không diễn giải lại.

v2.0 bổ sung: trigger kích hoạt phương án B cho Tri-Ring, chi phí bản đồ, adoption tài xế, rủi ro tập trung khách hàng

| Loại | Nội dung | Ảnh hưởng | Mức độ | Giảm thiểu / Hành động (kèm trigger nếu có) |
|---|---|---|---|---|
| Phụ thuộc | Tri-Ring cung cấp đặc tả/API telematics (xe 'chừa sẵn giao diện IoT') | Không có dữ liệu BMS → P1 không chạy | Cao | Chốt tại Gate 0, đưa vào hợp đồng phân phối. TRIGGER (v2.0): nếu chưa có spec ký xác nhận trước 31/3/2026 → kích hoạt phương án B: gateway OBD/CAN bên thứ ba (đặt mẫu & test song song từ Q1) |
| Phụ thuộc | Trụ sạc hỗ trợ OCPP & remote start/stop | Không có trạng thái realtime & không chạy được thanh toán QR | Cao | Điều khoản OCPP 1.6J + remote start/stop bắt buộc trong hồ sơ mua sắm; nghiệm thu theo kịch bản test chuẩn |
| Rủi ro | Adoption của tài xế thấp (MỚI) | App bị bỏ xó → mất dữ liệu hành vi, cảnh báo vô dụng, NSM sụp | Cao | Onboarding tại chỗ khi bàn giao; app đơn giản 3 con số; đo DAU/MAU tuần; gói Basic gắn giá trị thật (thanh toán sạc, SOS) để tài xế PHẢI mở app |
| Rủi ro | Chi phí API bản đồ tăng theo quy mô (MỚI) | Chi phí vận hành/xe/tháng vượt mô hình giá | Trung bình | Pilot đo cost thực tế; so VietMap vs Google; cache tile & ma trận khoảng cách; quyết định tại sheet 14 — Q5 |
| Rủi ro | Kết nối mạng dọc tuyến (vùng sâu/biên giới) | Mất realtime; cảnh báo trễ | Trung bình | Store-and-forward ≥48h; cảnh báo ngưỡng cục bộ trên thiết bị; SMS fallback cho pin ≤10% |
| Tuân thủ | Nghị định 13/2023 & quyền riêng tư tài xế khi giám sát | Rủi ro pháp lý & phản ứng tài xế | Cao | Consent khi kích hoạt; minh bạch mục đích (bảo hành/an toàn/đối soát); CSKH chỉ xem vị trí khi có ticket; audit mọi truy cập vị trí |
| Pháp lý | Điều kiện KD sàn vận tải & hợp đồng điện tử (P2) | Vướng pháp lý khi mở sàn | Trung bình | Legal Holding xác nhận trước Gate 3; giấy phép theo lộ trình |
| Rủi ro | Cold-start marketplace (P2) | Sàn 'trống' lúc đầu, network effect không hình thành | Cao | MOU với InterLOG/HS Logistics ký TRƯỚC khi build sàn (điều kiện Gate 3); khởi đầu bằng tuyến cố định mật độ cao |
| Rủi ro | Unit economics sàn âm — bài học Convoy (MỚI) | Đốt vốn, phải đóng sàn | Cao | Gate 3 duyệt unit economics; KPI P2 luôn ghép GMV với take rate & biên đóng góp; không trợ giá kéo dài |
| Rủi ro | Tập trung khách hàng giai đoạn đầu (MỚI) | Doanh thu SaaS phụ thuộc ít đội xe lớn | Trung bình | Đa dạng tệp qua gói Basic → Standard; theo dõi tỷ trọng doanh thu top-3 khách |
| Rủi ro | Chất lượng & chuẩn hóa dữ liệu đa nguồn | Báo cáo/AI sai; đối soát lệch | Trung bình | Data governance từ P1; quality check trong ETL; schema versioning (NF-16) |
| Rủi ro | Khung Claude Code cần Dev hoàn thiện | Lỗ hổng/nợ kỹ thuật nếu bỏ review | Trung bình | Review & pen-test bắt buộc (NF-07); test luồng trọng yếu; không hardcode secret |
| Giả định | Khách mua xe được tặng gói Basic; trụ sạc chuẩn CCS2; tài xế chủ yếu dùng Android | Nền hoạch định sản phẩm | — | Theo dõi tỷ lệ kích hoạt; duy trì chuẩn CCS2; tối ưu Android trước |
| Giả định | Mô hình Manbang phù hợp VN/GMS | Định hướng P2 đúng | — | Kiểm chứng qua pilot với đối tác 'mồi' trước khi scale |
