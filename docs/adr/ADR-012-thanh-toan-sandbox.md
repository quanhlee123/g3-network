# ADR-012: Luồng thanh toán phiên sạc — neo giao dịch vào phiên OCPP, không vào phiên sạc
Ngày: 2026-08-03 · Người đề xuất: Claude Code (Prompt 08.4) · Người duyệt: — · Trạng thái: **Nháp**

## Bối cảnh

F-H1 (sheet 4): "quét QR trên trụ, sạc, và thanh toán… nhận biên nhận kWh", tiêu chí chấp
nhận: "luồng quét→sạc→trả ≤3 bước; **không lưu thông tin thẻ** trên hệ thống (tokenization
qua cổng); **hoạt động khi sóng yếu (giữ phiên, thu sau)**".

Một sự thật về thứ tự thời gian phá vỡ thiết kế đơn giản nhất:

> **Tiền có thể về TRƯỚC khi phiên sạc được ghi vào `charging_sessions`.**

Trụ mất kết nối giữa phiên rồi gửi `StopTransaction` bù sau — chuyện thường (NF-09), và CSMS
đã **cố ý** giữ phiên mở trong tình huống đó (ADR-005). Trong khi ấy người dùng đã bấm trả
tiền xong và cổng thanh toán đã gọi webhook về.

Nếu `payment_transactions` bắt buộc phải có `session_id` ngay thì webhook đến sớm chỉ còn hai
lựa chọn, cả hai đều tồi:
- **Từ chối webhook** → tiền đã trừ của khách mà hệ thống không ghi nhận.
- **Tạo phiên sạc giả để có chỗ gắn tiền** → bịa bản ghi vào bảng append-only mang giá trị
  pháp lý bảo hành (NF-11). Không bao giờ.

## Quyết định

**1. Giao dịch neo vào `ocpp_transaction_id`, không neo vào `session_id`.**
Mã phiên OCPP có từ lúc trụ gửi `StartTransaction` — **trước** khi `charging_sessions` có
dòng. `session_id` được để NULL và **nối lại sau** bằng đúng mã đó, bởi webhook handler và
bởi một job quét định kỳ (`PAYMENT_LINK_INTERVAL_MS`).

Cần job quét riêng vì thứ tự có thể ngược lại: webhook đến 10:00 khi phiên chưa có, trụ gửi
`StopTransaction` lúc 14:00. Không có job thì giao dịch nằm mồ côi vĩnh viễn và đối soát 3
chiều (F-C6) không bao giờ khớp vì thiếu chiều thanh toán.

**2. Chống webhook trùng bằng RÀNG BUỘC DB, không bằng kiểm tra ở tầng ứng dụng.**
`gateway_webhook_id` là cột UNIQUE (đã có từ migration 0007). Câu `UPDATE … WHERE id = $1 AND
gateway_webhook_id IS NULL` chỉ ăn một lần; lần webhook thứ hai sửa 0 dòng và được trả lời
"đã xử lý".

**3. Webhook luôn trả HTTP 200; kết quả nằm trong body.**
Kể cả khi từ chối vì chữ ký sai. Trả 4xx/5xx bị cổng hiểu là "chưa nhận được" và retry mãi —
ta tự tạo vòng lặp vô hạn cho mỗi request giả mạo.

**4. Endpoint webhook CÔNG KHAI, xác thực bằng CHỮ KÝ HMAC.**
Cổng thanh toán không đăng nhập được vào hệ mình. Đây là ngoại lệ duy nhất của "mặc định TỪ
CHỐI" (quy tắc 6) ngoài health/docs/đăng nhập, và chữ ký là cơ chế xác thực **duy nhất** —
`docWebhook()` ném lỗi khi sai, không có nhánh "bỏ qua cho tiện".

**5. Tiền tính SAU khi biết số kWh, không tạm giữ trước.**
Bước quét QR chỉ gửi `RemoteStart`. Tạm giữ theo số ước lượng rồi hoàn phần thừa là bài toán
nghiệp vụ khác, cần quyết định chưa có.

**6. Rào chắn SANDBOX nằm trong MÃ, không nằm trong tài liệu.**
`VnpaySandboxGateway` **từ chối khởi động** nếu `VNPAY_PAY_URL` không trỏ tới host chứa
"sandbox". Hỏng lúc khởi động, không phải lúc có giao dịch đầu tiên.

**7. Mặc định là cổng GIẢ nội bộ.** Máy sạch chưa cấu hình gì vẫn chạy được toàn bộ luồng —
demo cho Ban lãnh đạo không phụ thuộc tài khoản VNPay.

## Lý do & các phương án đã loại

**Về (1).** Phương án "chờ phiên rồi mới nhận webhook" đã loại: webhook có timeout, chờ là
cổng retry, và bài toán trùng lặp nặng hơn bài toán ban đầu. Phương án "cho phép sửa
`charging_sessions` để gắn payment_id" đã loại vì phá append-only (NF-11) — cũng chính là lý
do migration 0005 đặt liên kết theo chiều `payment_transactions.session_id` ngay từ đầu.

**Về (2).** Kiểm tra "đã xử lý chưa" bằng `SELECT` rồi mới `UPDATE` có khoảng trống giữa hai
câu lệnh; hai webhook đến song song (cổng retry đúng lúc mạng phục hồi) lọt qua cả hai. Ràng
buộc DB không có khoảng trống đó.

**Về (5).** Pre-authorization là chuẩn ngành cho sạc xe điện và sẽ cần ở giai đoạn sau, nhưng
nó kéo theo chính sách hoàn tiền, hạn mức tạm giữ, và xử lý khi khách không đủ số dư giữa
phiên — không có cái nào được quyết. Ghi nhận là việc phát sinh, không làm ở Phase 1.

## Hệ quả

- Có thể tồn tại giao dịch `succeeded` mà `session_id` NULL trong khoảng thời gian phiên chưa
  về. Đây là trạng thái **hợp lệ**, không phải lỗi dữ liệu. `GET /payments?chua_noi_phien=true`
  liệt kê chúng cho vận hành.
- Báo cáo sản lượng (F-C6) chỉ tính phiên đã đóng, nên tiền của giao dịch mồ côi chưa vào báo
  cáo cho tới khi nối được phiên. Đúng ý: chưa có phiên thì chưa có kWh để đối chiếu.
- Nhà thầu tiếp nhận: thêm cổng mới = thêm một lớp cài `IPaymentGateway`, không sửa
  `apps/api/src/modules/payments/service.ts`.

## KHÔNG LÀM ở Phase 1 (và vì sao)

| Việc | Lý do |
|---|---|
| Cổng production | Quy tắc 12 + mục Ranh giới CLAUDE.md. Rào chắn kỹ thuật ở `kiemTraSandbox()`. |
| Lưu/xử lý dữ liệu thẻ | Mục Ranh giới CLAUDE.md. Interface cố tình không có trường nào nhận dữ liệu thẻ; có test quét cả OpenAPI lẫn schema DB để chốt chặn hồi quy. |
| Momo | Prompt 08.4 giao cho nhà thầu. Enum `PaymentMethod` trong contracts cố ý không có `'momo'` dù DB có, để không ai dựng nửa vời. |
| Hoàn tiền (refund) | `payment_status` có `'refunded'` nhưng chưa có luồng — cần chính sách hoàn tiền, chưa ai quyết. |
| Ví nội bộ (`wallet`) | Sheet 9 có nhắc "ví trong app" nhưng F-H2..H4 chưa tới lượt. |

## Còn MỞ — cần người quyết

- **D-01 (MỞ ⚠️)**: có app tài xế ở P1 không. Phần đã làm là **API backend**; màn hình quét
  QR và mở link thanh toán trên điện thoại là phần phụ thuộc D-01 (Prompt 09).
- **D-02 (MỞ)**: thẻ RFID ở trụ. Hiện `idTag = VIN` (Phase 1, ADR-005); có thẻ RFID thì thêm
  đường phân giải idTag, không đổi luồng tiền.
- **Q2 (MỞ)**: ai vận hành CSMS. `ICsmsCommander` là chỗ thay bản cài đặt nếu chuyển sang
  CSMS thuê ngoài.
- **Q3 / Q9 (MỞ)**: đơn giá điện thật và nhà cung cấp hoá đơn điện tử. Hiện dùng
  `CHARGING_PRICE_VND_PER_KWH` là giá **GIẢ**; biên nhận kWh mà F-H1 nhắc tới mới ở mức dữ
  liệu, chưa phải hoá đơn hợp lệ (F-H3).
