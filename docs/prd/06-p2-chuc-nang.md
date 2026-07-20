# 6 · PHASE 2 — YÊU CẦU CHỨC NĂNG (Module L–P)

> Nguồn: sheet "6. P2 - Chức năng" — PRD v2.0. Chuyển đổi trung thực, không diễn giải lại.

Mô hình lõi: Manbang · Khác biệt: EV-aware · v2.0 bổ sung KYC, tranh chấp & trust-and-safety (L6–L7) và đổi mã module để tránh trùng P1

| Mã | Module | Tính năng | Mô tả & giá trị | MoSCoW | Tham khảo |
|---|---|---|---|---|---|
| F-L1 | L. Sàn ghép nối vận tải | Đăng nhu cầu (chủ hàng) | Đăng lô hàng: loại hàng, tuyến, thời gian, khối lượng/tải trọng, yêu cầu đặc biệt. | Must | Manbang, Uber Freight |
| F-L2 | L. Sàn ghép nối vận tải | Đăng năng lực (chủ xe) | Xe khả dụng: loại xe, tuyến, thời gian rảnh, vị trí hiện tại (tự động từ telematics — lợi thế G3). | Must | Manbang, BlackBuck |
| F-L3 | L. Sàn ghép nối vận tải | Engine ghép nối | Ghép cung–cầu theo tuyến, tải trọng, thời gian, giá và đặc thù EV (SOC/điểm sạc trên tuyến). | Must | Manbang, Convoy |
| F-L4 | L. Sàn ghép nối vận tải | Báo giá & thương lượng | Giá gợi ý/đấu giá & thương lượng trong app. | Should | Manbang, Uber Freight |
| F-L5 | L. Sàn ghép nối vận tải | Xếp hạng & uy tín | Đánh giá 2 chiều & điểm tín nhiệm chủ hàng/chủ xe. | Should | Manbang, Convoy/DAT |
| F-L6 | L. Sàn ghép nối vận tải | KYC & xác minh (MỚI) | Xác minh danh tính/giấy phép KD, đăng kiểm & bảo hiểm xe, chứng từ chủ hàng trước khi giao dịch. | Must | Chuẩn marketplace; (v2.0) |
| F-L7 | L. Sàn ghép nối vận tải | Xử lý tranh chấp & Trust-and-Safety (MỚI) | Quy trình khiếu nại (hư hỏng hàng, trễ, hủy chuyến), giữ tiền (escrow) tới khi e-POD xác nhận, chế tài tài khoản vi phạm. | Must | Bài học chung các sàn; (v2.0) |
| F-M1 | M. Lập kế hoạch & Tối ưu EV-aware | Lập tuyến có điểm sạc | Lộ trình tính sẵn điểm sạc theo SOC thực, tải trọng & mạng trạm G3 (KHÁC BIỆT CỐT LÕI). | Must | Tesla trip planner (ý tưởng) |
| F-M2 | M. Lập kế hoạch & Tối ưu EV-aware | Gom chuyến & tối ưu tải | Gom hàng & tối ưu tải trọng/đầy xe. | Should | Cainiao, Sennder |
| F-M3 | M. Lập kế hoạch & Tối ưu EV-aware | Tối ưu chạy rỗng / backhaul | Ghép chiều về & toàn tuyến để giảm km rỗng (giá trị lõi Manbang/Sennder). | Must | Manbang, Sennder |
| F-M4 | M. Lập kế hoạch & Tối ưu EV-aware | Điều phối đội xe | Lập lịch & điều phối theo nhu cầu. | Should | G7易流, Cainiao |
| F-N1 | N. Đơn hàng & Thanh toán | E-contract, theo dõi đơn & e-POD | Hợp đồng điện tử, theo dõi realtime, bằng chứng giao hàng điện tử. | Must | Uber Freight, Sennder |
| F-N2 | N. Đơn hàng & Thanh toán | Ví, đối soát & thanh toán | Đối soát cước; giải ngân cho chủ xe (gắn escrow L7); phí nền tảng (take rate). | Must | Manbang, BlackBuck |
| F-N3 | N. Đơn hàng & Thanh toán | Hóa đơn & dòng tiền | Xuất hóa đơn; quản lý dòng tiền; kết nối kế toán. | Should | Manbang |
| F-O1 | O. Dịch vụ giá trị gia tăng | Tài chính & bảo hiểm | Vay/cho thuê (mô hình bán–cho thuê G3), bảo hiểm hàng hóa/xe; dùng điểm an toàn lái (K1) làm đầu vào định phí. | Should | Manbang, BlackBuck |
| F-O2 | O. Dịch vụ giá trị gia tăng | Gói năng lượng | Gói sạc ưu đãi, tối ưu ToU gắn G3 Energy. | Should | G7易流 |
| F-O3 | O. Dịch vụ giá trị gia tăng | Phí đường bộ / ETC (GMS) | Hỗ trợ ETC & phí xuyên biên VN–Lào–Trung. | Could | Manbang (ETC), BlackBuck (FASTag) |
| F-O4 | O. Dịch vụ giá trị gia tăng | Tích hợp cho thuê xe | Cho thuê xe điện G3 trên sàn — nhà xe nhỏ tiếp cận xe & vốn. | Could | Mô hình G3 |
| F-P1 | P. Phân tích & AI | Heatmap & dự báo nhu cầu | Bản đồ nhiệt & dự báo nhu cầu theo tuyến/khu vực. | Should | Manbang, Cainiao |
| F-P2 | P. Phân tích & AI | Định giá thông minh | Gợi ý giá cước theo cung–cầu & tuyến. | Should | Manbang, Uber Freight |
| F-P3 | P. Phân tích & AI | Bảo trì dự đoán & tuổi thọ pin | Nâng cấp từ P1: dự đoán bảo trì, ước tính tuổi thọ pin, phát hiện bất thường. | Should | Dữ liệu nội bộ G3 |
| F-P4 | P. Phân tích & AI | Báo cáo liên công ty | Hỗ trợ Mobility lập kế hoạch nhập xe & Energy quy hoạch trạm từ dữ liệu vận hành. | Must | Dữ liệu nội bộ G3 |

## Điều kiện khởi động P2

Điều kiện khởi động P2: qua GATE 3 (sheet 3) — ≥250 xe khỏe mạnh, 6 tháng dữ liệu tuyến, MOU nguồn 'mồi', pháp lý sàn & unit economics được duyệt. Trình tự build P2: L1–L3 + L6 + N1 (MVP sàn có xác minh & e-POD) → L7 + N2 (tiền & tranh chấp) → M1/M3 (EV-aware & backhaul) → phần còn lại.
