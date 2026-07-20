# 14 · CÂU HỎI MỞ & QUYẾT ĐỊNH CẦN CHỐT (MỚI trong v2.0)

> Nguồn: sheet "14. Quyết định cần chốt" — PRD v2.0. Chuyển đổi trung thực, không diễn giải lại.
> Trạng thái theo dõi trực tiếp tại [docs/DECISION-LOG.md](../DECISION-LOG.md) — Q1–Q12 đã được chép sang đó ở trạng thái MỞ.

Những điểm PRD chưa thể tự quyết — cần Ban lãnh đạo/đối tác chốt để không chặn tiến độ · Cập nhật trạng thái tại đây sau mỗi buổi review

| # | Quyết định cần chốt | Phương án / Khuyến nghị | Người quyết | Deadline |
|---|---|---|---|---|
| Q1 | Đặc tả telematics Tri-Ring: trường dữ liệu, tần suất, giao thức, quyền truy cập BMS, môi trường test | Khuyến nghị: đưa thành phụ lục hợp đồng phân phối; yêu cầu môi trường mock từ Tri-Ring; nếu trễ → phương án B gateway OBD (sheet 13) | BLĐ G3 + Tri-Ring | 20/07/2026 (Gate 0) |
| Q2 | Ai vận hành CSMS trạm sạc: G3 Network xây/vận hành hay G3 Energy thuê ngoài rồi tích hợp? | Khuyến nghị: G3 Network sở hữu CSMS (dựa SteVe) — vì đối soát 3 chiều & thanh toán QR cần kiểm soát sâu | BLĐ G3 Energy + Network | Q1/2026 |
| Q3 | Giá gói Standard (VNĐ/xe/tháng) & chính sách gói năm | Cần mô hình giá dựa chi phí vận hành/xe (hạ tầng + bản đồ + SMS) đo từ pilot + khảo sát mức sẵn sàng chi trả | BLĐ + Sale | Trước Gate 2 |
| Q4 | Chính sách xử lý vi phạm sạc: chỉ cảnh báo hay có chế tài (giảm quyền lợi, tính phí)? | Khuyến nghị P1: cảnh báo + hồ sơ; chế tài để hợp đồng quyết — phần mềm chỉ cung cấp bằng chứng | Legal + Bảo hành Mobility | Trước roll-out |
| Q5 | Chọn nhà cung cấp bản đồ: VietMap vs Google vs Mapbox | Đo trong pilot: chi phí/xe/tháng, chất lượng bản đồ tuyến vận tải & vùng biên; khuyến nghị nghiêng VietMap nếu đạt chất lượng | PM + Dev | Cuối pilot (Gate 1) |
| Q6 | Đơn vị chịu trách nhiệm CSKH & cứu hộ 24/7: Holding tự vận hành hay thuê ngoài? | SOS ≤5 phút đòi hỏi trực 24/7 — cần quyết ngân sách & quy trình trước pilot (diễn tập là điều kiện Gate 2) | BLĐ Holding | Trước pilot |
| Q7 | Consent & chính sách dữ liệu tài xế (Nghị định 13/2023): văn bản pháp lý, luồng đồng ý khi kích hoạt | Legal soạn; tích hợp vào onboarding F-F2; đặc biệt với tài xế làm thuê (không phải chủ xe) | Legal | Trước pilot |
| Q8 | Phiên bản OCPP: chỉ 1.6J hay yêu cầu 2.0.1 ngay từ mua sắm đợt đầu? | Khuyến nghị: vận hành 1.6J, điều khoản mua sắm yêu cầu trụ nâng cấp được 2.0.1 (bảo mật & Plug&Charge tương lai) | G3 Energy + Dev | Cùng hồ sơ mua sắm trụ |
| Q9 | Nhà cung cấp hóa đơn điện tử & luồng kế toán doanh thu điện | Chọn 1 trong các nhà cung cấp HĐĐT phổ biến; khớp quy trình kế toán Holding | Kế toán Holding | Trước Gate 2 |
| Q10 | Cấu trúc pháp lý & giấy phép cho sàn vận tải P2 (điều kiện KD, e-contract) | Legal nghiên cứu từ 2026 để không chặn Gate 3 | Legal | Trước Gate 3 (2027) |
| Q11 | MOU nguồn cung/cầu 'mồi' P2 với InterLOG & HS Logistics: phạm vi, cam kết khối lượng | Đàm phán 2026–2027; là điều kiện cứng của Gate 3 | BLĐ | Trước Gate 3 |
| Q12 | Chính sách giữ/khóa xe từ xa phục vụ thu hồi: ranh giới pháp lý & an toàn | Chỉ thao tác khi xe dừng & theo quy trình pháp lý; tuyệt đối không can thiệp khi xe đang chạy; Legal xác nhận | Legal + Vận hành | Trước roll-out |

> Ghi chú chuyển đổi [CẦN LÀM RÕ]: deadline Q1 trong Excel ghi "20/07/2026 (Gate 0)" trong khi Gate 0 ở sheet 3 và Q2 đặt tại Q1/2026 — có thể là ô định dạng ngày bị lệch. Giữ nguyên văn, cần người review xác nhận.
