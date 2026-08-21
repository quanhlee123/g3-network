# YÊU CẦU WIREFRAME — App tài xế (chặn Prompt 09)

> Gửi: anh Đức / designer · Người yêu cầu: PM · Ngày: 2026-08-03
> Căn cứ: **INPUT-03 §2** (chuẩn giao tài liệu thiết kế — nằm trong bộ prompt-kit, ngoài repo này):
> wireframe là đầu vào **bắt buộc trước Prompt 09**. Mẫu bắt buộc đã chép nguyên văn bên dưới nên
> tài liệu này dùng độc lập được, không cần mở prompt-kit.
> Nộp vào: `docs/design/screens/`, mỗi màn hình 1 file `.md`, qua Pull Request.

## Vì sao cần gấp

D-01 đã CHỐT ngày 2026-08-03: **CÓ app tài xế ở P1** (xem [DECISION-LOG](../DECISION-LOG.md)).
Chặn duy nhất còn lại của Prompt 09 là bộ wireframe này. Backend đã sẵn sàng — endpoint
`/stations/map`, `/payments/qr/start`, `/sos`, `/notifications` đều đã chạy và có test.

## Mẫu bắt buộc cho mỗi màn hình

```markdown
# SCR-{mã} {Tên màn hình} — phục vụ F-xx

Persona & bối cảnh:   (vd: tài xế, ngoài nắng, 1 tay, đeo găng)
Hình:                 sketch/Figma export PNG đặt CẠNH file .md
Thành phần:           liệt kê từng phần tử + hành vi khi bấm
Trạng thái:           loading / rỗng / lỗi / mất sóng   ← THIẾU MỤC NÀY = TRẢ LẠI
Điều hướng:           đến/đi màn hình nào
```

## Danh sách tối thiểu cho P1.0 — 10 màn hình

| # | Mã đề xuất | Màn hình | Phục vụ | Ghi chú ràng buộc |
|---|---|---|---|---|
| 1 | SCR-01 | Đăng nhập OTP | F-D4, F-F1 | Số điện thoại GIẢ khi demo (quy tắc 12) |
| 2 | SCR-02 | Màn hình chính **3 CON SỐ LỚN** | F-D4 | SOC · km còn lại · trạm gần nhất còn trống. Đọc được **ngoài nắng**, thao tác **1 tay** (NF-12) |
| 3 | SCR-03 | Bản đồ trạm sạc | F-D1 | Lọc theo trạng thái trụ; **ưu tiên hiện trạm còn trống** |
| 4 | SCR-04 | Chi tiết trạm | F-D1, F-C2 | Nút "Chỉ đường" → mở Google Maps app |
| 5 | SCR-05 | Luồng QR–sạc–trả (**đúng 3 bước**) | F-H1 | Acceptance F-H1 giới hạn ≤3 bước thao tác |
| 6 | SCR-06 | Phiên sạc realtime | F-H1, F-C2 | kWh + chi phí tạm tính, cập nhật liên tục |
| 7 | SCR-07 | Biên nhận kWh | F-H1, F-H3 | ⚠️ Q9 còn MỞ → đây **chưa phải hoá đơn hợp lệ**, đừng vẽ như hoá đơn VAT |
| 8 | SCR-08 | **SOS** | F-I2 | Luôn hiển thị ở mọi màn hình. ⚠️ D-09/Q6 còn MỞ |
| 9 | SCR-09 | Danh sách cảnh báo pin | F-A2, F-F3 | 3 mức cảnh báo phân cấp |
| 10 | SCR-10 | Consent khi kích hoạt | F-F2, F-G4 | ⚠️ Q7 còn MỞ — Legal soạn câu chữ (Nghị định 13/2023) |

## Ràng buộc thiết kế không được bỏ qua

- **NF-12**: tiếng Việt, chữ lớn, tương phản cao (dùng ngoài nắng), tác vụ chính **≤3 chạm**.
- **NF-13**: chạy mượt trên **Android tầm trung** — tránh hiệu ứng nặng, tránh ảnh độ phân giải cao.
- **NF-17**: đơn vị **VNĐ · km · kWh**.
- Thao tác **1 tay**: nút chính nằm trong tầm ngón cái, không đặt hành động quan trọng sát mép trên.
- Mục **Trạng thái** (loading / rỗng / lỗi / **mất sóng**) là bắt buộc — tài xế thường ở vùng sóng yếu,
  màn hình mất sóng không phải trường hợp hiếm mà là trường hợp **thường xuyên**.

## Ba màn hình xin ưu tiên nộp trước

Nếu chưa làm hết 10 màn hình, xin nộp trước **SCR-02 (3 con số)**, **SCR-05 (luồng QR 3 bước)**
và **SCR-08 (SOS)** — ba cái này đủ để bắt đầu Prompt 09 §9.1 và §9.3, phần bản đồ (§9.2) chờ sau.

## Câu hỏi thiết kế cần trả lời kèm wireframe

1. **km còn lại** tính đơn giản = SOC × km/% trung bình của xe. Hiển thị con số trần, hay kèm khoảng
   tin cậy (vd "≈120 km")? Con số trần dễ đọc nhưng dễ bị hiểu là cam kết.
2. Khi **mất sóng**, 3 con số nên hiện giá trị cache kèm nhãn "số liệu lúc HH:mm", hay ẩn hẳn?
3. Nút **SOS** đặt cố định (floating) hay nằm trong thanh dưới? Floating luôn thấy nhưng che nội dung.
4. Trạm gần nhất **còn trống** — nếu không trạm nào trống trong bán kính hợp lý thì hiện gì?
