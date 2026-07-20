# 10 · KPI & CÂY CHỈ SỐ (METRIC TREE)

> Nguồn: sheet "10. KPI & Metric Tree" — PRD v2.0. Chuyển đổi trung thực, không diễn giải lại.

v2.0: phân tầng North Star → Kết quả → Dẫn dắt; mỗi KPI có owner & tần suất đo — thay cho danh sách phẳng của v1.0

| Tầng | KPI | Định nghĩa | Mục tiêu Phase 1 | Mục tiêu Phase 2 | Tần suất | Owner |
|---|---|---|---|---|---|---|
| NORTH STAR (P1) | Xe hoạt động khỏe mạnh hàng tuần (WHAV) | Xe online ≥5 ngày/tuần VÀ không vi phạm chính sách sạc trong tuần | ≥85% đội xe (cuối 2026) | ≥90% | Tuần | PM G3 Network |
| Kết quả | Sự cố hết pin dọc đường | Số ca xe cạn pin giữa hành trình | Tiệm cận 0 | 0 | Tuần | Vận hành |
| Kết quả | Tuân thủ chính sách sạc | % phiên sạc đúng chính sách | ≥90% | ≥95% | Tuần | Bảo hành Mobility |
| Kết quả | Kích hoạt app (khách mua xe) | % khách kích hoạt gói Basic khi bàn giao | ≥80% | ≥90% | Tháng | Sale/CSKH |
| Kết quả | Đối soát kWh khớp 3 chiều | % kWh khớp trụ–xe–thanh toán | Sai lệch <1% | <0.5% | Tháng | G3 Energy |
| Kết quả | CSAT / NPS | Hài lòng người dùng | CSAT ≥80% | NPS dương & tăng | Quý | CSKH |
| Dẫn dắt | Provisioning thành công | % xe kết nối telematics thành công khi bàn giao | ≥98% | ≥99% | Tuần | Dev/Vận hành |
| Dẫn dắt | Độ trễ dữ liệu telematics (p95) | Xe → hệ thống | ≤30s | ≤10s | Ngày | Dev |
| Dẫn dắt | Cảnh báo pin được xử lý kịp | % cảnh báo tài xế xử lý trước khi cạn | ≥95% | ≥98% | Tuần | Vận hành |
| Dẫn dắt | Thiết bị khỏe mạnh (MỚI) | % thiết bị online & firmware chuẩn | ≥97% | ≥99% | Tuần | Dev/Vận hành |
| Dẫn dắt | Thanh toán sạc thành công (MỚI) | % giao dịch sạc hoàn tất không lỗi | ≥98% | ≥99% | Tuần | Dev |
| Dẫn dắt | Phản hồi SOS ≤5 phút (MỚI) | % ca SOS được gọi lại trong 5 phút | ≥95% | ≥98% | Tuần | CSKH |
| Dẫn dắt | Độ chính xác trạng thái trụ | % trạng thái đúng so thực tế | ≥99% | ≥99.5% | Tuần | G3 Energy |
| Dẫn dắt | DAU/MAU tài xế | Độ gắn kết app | Thiết lập mốc, mục tiêu ≥40% | Tăng | Tuần | PM |
| Nền tảng | Uptime (SLA) | % hệ thống sẵn sàng | ≥99.5% | ≥99.9% | Tháng | DevOps |
| Kinh doanh | Doanh thu (thuê bao + điện qua app) | SaaS theo xe/tháng + kWh thanh toán qua app | Theo kế hoạch | Tăng theo số xe | Tháng | Lãnh đạo |
| Kinh doanh | Số xe trên nền tảng | Tổng xe kết nối | ~300 (2026–27) | 1.200+ (2028–29) | Quý | Lãnh đạo |
| (P2) NORTH STAR | GMV ghép nối thành công + % km rỗng giảm | Cặp chỉ số bắt buộc đi cùng (bài học Convoy) | — | Tăng theo quý · km rỗng −15% | Tháng | PM P2 |
| (P2) Kết quả | Tỷ lệ ghép nối thành công | % nhu cầu được ghép | — | ≥70% | Tuần | PM P2 |
| (P2) Kết quả | Tỷ lệ tranh chấp (MỚI) | % đơn phát sinh khiếu nại | — | <2% | Tháng | Trust & Safety |
| (P2) Kinh doanh | Take rate / biên đóng góp | % phí trên GMV & unit economics dương | — | Theo mô hình KD được duyệt | Quý | Lãnh đạo |
