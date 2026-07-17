# DECISION LOG — G3 Network Phase 1
Trạng thái: MỞ / ĐÃ CHỐT / HOÃN · Quyết định hợp lệ phải đủ 5 trường (xem INPUT-01)

| Mã | Câu hỏi | Phương án chọn | Lý do | Người quyết | Ngày | Ảnh hưởng (F-xx) | Trạng thái |
|---|---|---|---|---|---|---|---|
| D-01 | Có app tài xế ở P1 không? (thiết kế đề xuất cân nhắc bỏ; PRD để Must) | — | — | BLĐ | — | F-D1..D5, F-H1, F-I2, NSM | MỞ ⚠️ chặn Prompt 09 |
| D-02 | Dùng thẻ RFID ở trụ sạc? (có trong bản vẽ thiết kế, không có trong PRD) | — | — | BLĐ + G3 Energy | — | F-H1, F-F1, phần cứng trụ | MỞ |
| D-03 | Định nghĩa "chuyến" cho chống spam cảnh báo | — | — | PM + Vận hành | — | F-A2 | MỞ (ADR nháp khi build) |
| D-04 | Backend framework: Fastify hay NestJS | Fastify 5 + TypeBox | Nhẹ, OpenAPI tự sinh từ schema, hợp modular monolith — xem ADR-001 | PM (duyệt kế hoạch Prompt 01) | 2026-07-17 | apps/api | ĐÃ CHỐT |
| Q1..Q12 | 12 quyết định PRD sheet 14 — chép nguyên trạng vào đây khi khởi tạo repo | | | theo sheet 14 | theo sheet 14 | | MỞ ⚠️ chờ PRD vào repo (Prompt 02) |

## Nhật ký thay đổi
- 2026-07-17 · Claude Code (Prompt 01) · Chốt D-04 = Fastify theo kế hoạch Prompt 01 được PM duyệt; chi tiết tại docs/adr/ADR-001-chon-fastify.md.
- 2026-07-17 · Claude Code (Prompt 01) · Q1..Q12 chưa chép được vì PRD chưa có trong repo (docs/prd/ trống, chờ Prompt 02).
