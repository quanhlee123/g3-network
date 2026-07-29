# DECISION LOG — G3 Network Phase 1
Trạng thái: MỞ / ĐÃ CHỐT / HOÃN · Quyết định hợp lệ phải đủ 5 trường (xem INPUT-01)

| Mã | Câu hỏi | Phương án chọn | Lý do | Người quyết | Ngày | Ảnh hưởng (F-xx) | Trạng thái |
|---|---|---|---|---|---|---|---|
| D-01 | Có app tài xế ở P1 không? (thiết kế đề xuất cân nhắc bỏ; PRD để Must; Đức cũng ghi chú "cân nhắc app tài xế ở p1" tại F-D4, F-H1..H4, F-K1) | — | — | BLĐ | — | F-D1..D5, F-H1..H4, F-K1, F-I2, NSM | MỞ ⚠️ chặn Prompt 09 |
| D-02 | Dùng thẻ RFID ở trụ sạc? (có trong bản vẽ thiết kế, không có trong PRD) | — | — | BLĐ + G3 Energy | — | F-H1, F-F1, phần cứng trụ | MỞ |
| D-03 | Định nghĩa "chuyến" cho chống spam cảnh báo | — | — | PM + Vận hành | — | F-A2 | MỞ (ADR nháp khi build) |
| D-04 | Backend framework: Fastify hay NestJS | Fastify 5 + TypeBox | Nhẹ, OpenAPI tự sinh từ schema, hợp modular monolith — xem ADR-001 | PM (duyệt kế hoạch Prompt 01) | 2026-07-17 | apps/api | ĐÃ CHỐT |
| D-05 | F-A6 Hiệu suất vận hành: actor là ai? (ghi chú review của Đức: "Chưa rõ Actor") | — | — | PM | — | F-A6 | MỞ |
| D-06 | F-E3 Báo cáo sạc & bảo hành: cho đội xe hay cho admin tổng? (ghi chú review của Đức) | — | — | PM | — | F-E3 | MỞ |
| D-07 | F-E4 Quản lý tài xế & phân công: thống nhất mô hình quản lý (ghi chú review của Đức) | — | — | PM + BLĐ | — | F-E4, F-F1, 09-rbac | MỞ |
| D-08 | F-F2 Provisioning & F-J2 OTA config: làm rõ chức năng với người review (ghi chú của Đức: "Chưa hiểu chức năng") | — | — | PM + Dev | — | F-F2, F-J2 | MỞ |
| D-09 | Module I (CSKH & Dịch vụ): định hướng nghiệp vụ (ghi chú của Đức: "Chưa có ý tưởng" cho F-I1..I3; lưu ý F-I2 SOS là Must P1.0) | — | — | PM + CSKH Holding | — | F-I1, F-I2, F-I3 | MỞ |
| D-10 | Vùng địa lý của dữ liệu mô phỏng: seed đặt 3 trạm sạc quanh TP.HCM/Long An, còn vehicle-sim chạy tuyến Hà Nội – Lạng Sơn → "trạm gần nhất" trong cảnh báo pin ra 1.130 km (đúng về mặt tính toán, vô nghĩa về mặt vận hành) | — | — | PM + G3 Energy | — | F-A2, F-D1, F-D2, F-C1, seed & simulator | MỞ ⚠️ ảnh hưởng demo Gate 0 |
| D-11 | Hiệu suất sạc dùng cho đối soát 3 chiều — hệ số toàn hệ hay theo dòng xe/trạm, và ai hiệu chuẩn trong pilot | Phase 1: hệ số toàn hệ `CHARGE_EFFICIENCY=1.0` (simulator lý tưởng) — xem ADR-007 | Không có hệ số thì phần cứng thật sẽ báo lệch 5–8% ở 100% số phiên | PM + G3 Energy | Trước Gate 1 | F-C6, NF-10 | MỞ ⚠️ chặn Gate 1 |

## Q1–Q12 — chép nguyên trạng từ PRD sheet 14 ([docs/prd/14-decisions.md](prd/14-decisions.md))

| Mã | Câu hỏi | Phương án / Khuyến nghị (từ PRD) | Lý do | Người quyết | Deadline | Ảnh hưởng (F-xx)¹ | Trạng thái |
|---|---|---|---|---|---|---|---|
| Q1 | Đặc tả telematics Tri-Ring: trường dữ liệu, tần suất, giao thức, quyền truy cập BMS, môi trường test | Khuyến nghị: đưa thành phụ lục hợp đồng phân phối; yêu cầu môi trường mock từ Tri-Ring; nếu trễ → phương án B gateway OBD (sheet 13) | — | BLĐ G3 + Tri-Ring | 20/07/2026 (Gate 0) | F-G1, F-A1..A6 | MỞ |
| Q2 | Ai vận hành CSMS trạm sạc: G3 Network xây/vận hành hay G3 Energy thuê ngoài rồi tích hợp? | Khuyến nghị: G3 Network sở hữu CSMS (dựa SteVe) — vì đối soát 3 chiều & thanh toán QR cần kiểm soát sâu | — | BLĐ G3 Energy + Network | Q1/2026 | F-G2, F-C2, F-H1 | MỞ |
| Q3 | Giá gói Standard (VNĐ/xe/tháng) & chính sách gói năm | Mô hình giá dựa chi phí vận hành/xe (hạ tầng + bản đồ + SMS) đo từ pilot + khảo sát mức sẵn sàng chi trả | — | BLĐ + Sale | Trước Gate 2 | F-H4 | MỞ |
| Q4 | Chính sách xử lý vi phạm sạc: chỉ cảnh báo hay có chế tài (giảm quyền lợi, tính phí)? | Khuyến nghị P1: cảnh báo + hồ sơ; chế tài để hợp đồng quyết — phần mềm chỉ cung cấp bằng chứng | — | Legal + Bảo hành Mobility | Trước roll-out | F-B3, F-B5, F-B6 | MỞ |
| Q5 | Chọn nhà cung cấp bản đồ: VietMap vs Google vs Mapbox | Đo trong pilot: chi phí/xe/tháng, chất lượng bản đồ tuyến vận tải & vùng biên; khuyến nghị nghiêng VietMap nếu đạt chất lượng | — | PM + Dev | Cuối pilot (Gate 1) | F-D1..D3 | MỞ |
| Q6 | Đơn vị chịu trách nhiệm CSKH & cứu hộ 24/7: Holding tự vận hành hay thuê ngoài? | SOS ≤5 phút đòi hỏi trực 24/7 — cần quyết ngân sách & quy trình trước pilot (diễn tập là điều kiện Gate 2) | — | BLĐ Holding | Trước pilot | F-I1, F-I2 | MỞ |
| Q7 | Consent & chính sách dữ liệu tài xế (Nghị định 13/2023): văn bản pháp lý, luồng đồng ý khi kích hoạt | Legal soạn; tích hợp vào onboarding F-F2; đặc biệt với tài xế làm thuê (không phải chủ xe) | — | Legal | Trước pilot | F-F2, F-G4, NF-08 | MỞ |
| Q8 | Phiên bản OCPP: chỉ 1.6J hay yêu cầu 2.0.1 ngay từ mua sắm đợt đầu? | Khuyến nghị: vận hành 1.6J, điều khoản mua sắm yêu cầu trụ nâng cấp được 2.0.1 (bảo mật & Plug&Charge tương lai) | — | G3 Energy + Dev | Cùng hồ sơ mua sắm trụ | F-G2 | MỞ |
| Q9 | Nhà cung cấp hóa đơn điện tử & luồng kế toán doanh thu điện | Chọn 1 trong các nhà cung cấp HĐĐT phổ biến; khớp quy trình kế toán Holding | — | Kế toán Holding | Trước Gate 2 | F-H3 | MỞ |
| Q10 | Cấu trúc pháp lý & giấy phép cho sàn vận tải P2 (điều kiện KD, e-contract) | Legal nghiên cứu từ 2026 để không chặn Gate 3 | — | Legal | Trước Gate 3 (2027) | Module L–N (P2) | MỞ |
| Q11 | MOU nguồn cung/cầu 'mồi' P2 với InterLOG & HS Logistics: phạm vi, cam kết khối lượng | Đàm phán 2026–2027; là điều kiện cứng của Gate 3 | — | BLĐ | Trước Gate 3 | Module L (P2) | MỞ |
| Q12 | Chính sách giữ/khóa xe từ xa phục vụ thu hồi: ranh giới pháp lý & an toàn | Chỉ thao tác khi xe dừng & theo quy trình pháp lý; tuyệt đối không can thiệp khi xe đang chạy; Legal xác nhận | — | Legal + Vận hành | Trước roll-out | F-A5, F-J3 | MỞ |

¹ Cột "Ảnh hưởng (F-xx)" của Q1–Q12 do người chuyển đổi suy ra từ ngữ cảnh PRD (sheet 14 không có cột này) — cần review xác nhận.

## Nhật ký thay đổi
- 2026-07-17 · Claude Code (Prompt 01) · Chốt D-04 = Fastify theo kế hoạch Prompt 01 được PM duyệt; chi tiết tại docs/adr/ADR-001-chon-fastify.md.
- 2026-07-17 · Claude Code (Prompt 01) · Q1..Q12 chưa chép được vì PRD chưa có trong repo (docs/prd/ trống, chờ Prompt 02).
- 2026-07-18 · Claude Code (Prompt 02) · Chép Q1–Q12 nguyên trạng từ PRD sheet 14 (trạng thái MỞ); thêm D-05..D-09 từ ghi chú review của Đức (docs/prd/review-notes-duc.md); bổ sung F-H2..H4, F-K1 vào phạm vi ảnh hưởng D-01 theo ghi chú của Đức.
- 2026-07-28 · Claude Code (Prompt 06) · D-03 vẫn MỞ nhưng Gate 0 ③ bắt buộc có cảnh báo pin: PM duyệt kế hoạch dùng **quy tắc tạm** không đụng định nghĩa "chuyến" (chống spam theo vòng đời cảnh báo + biên trễ 5% SOC) — chi tiết và các câu hỏi cần chốt ở [ADR-006](adr/ADR-006-chong-spam-canh-bao-pin.md). Khi D-03 chốt thì sửa `dedup_key` và hàm `quyetDinhCanhBao`.
- 2026-07-28 · Claude Code (Prompt 06) · Thêm D-10 (vùng địa lý dữ liệu mô phỏng) và D-11 (hiệu suất sạc trong đối soát) — cả hai phát hiện khi chạy thật demo Gate 0. D-11 có ADR nháp [ADR-007](adr/ADR-007-hieu-suat-sac-doi-soat.md) và là điều kiện của Gate 1.
