# Mocks cho interface tích hợp ngoài

Mỗi interface trong `packages/contracts/src/` phải có ít nhất 1 bản mock hoạt động được
đặt tại đây (quy tắc 2, CLAUDE.md). Mock được thêm cùng lúc với interface ở các prompt sau:

- Telematics xe → Prompt 04 (vehicle-sim)
- OCPP / trụ sạc → Prompt 05 (ocpp-sim)
- Thanh toán sandbox, SMS, push, hóa đơn điện tử → Prompt 08+
