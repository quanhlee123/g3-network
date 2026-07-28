# Mocks cho interface tích hợp ngoài

Mỗi interface trong `packages/contracts/src/` phải có ít nhất 1 bản mock hoạt động được
đặt tại đây (quy tắc 2, CLAUDE.md). Mock được thêm cùng lúc với interface ở các prompt sau:

- Telematics xe (gửi) → ĐÃ CÓ: `telemetry.ts` (`MockTelemetryPublisher`, Prompt 04 — F-A1)
- Telematics xe (nhận) → ĐÃ CÓ: `telematics-source.ts` (`MockTelematicsSource`, Prompt 05 — F-G1)
- OCPP / trụ sạc → ĐÃ CÓ: `ocpp.ts` (`MockChargePointTransport`, Prompt 05 — F-G2)
- SMS → ĐÃ CÓ: `sms.ts` (`ConsoleSmsSender`, Prompt 06 — F-F1, OTP in ra console)
- Thanh toán sandbox, push, bản đồ, hóa đơn điện tử → Prompt 08+
