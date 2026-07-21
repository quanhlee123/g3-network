# ADR-003: Phân biệt mất nguồn với mất sóng bằng MQTT LWT + topic trạng thái retained
Ngày: 2026-07-21 · Người đề xuất: Claude Code (Prompt 04, F-A1/F-J3) · Người duyệt: (chờ duyệt) · Trạng thái: NHÁP

## Bối cảnh
F-J3 yêu cầu "phát hiện mất nguồn đột ngột ≠ mất sóng" (tamper/tháo thiết bị — kiểm soát
rủi ro thu hồi xe). Ở tầng dữ liệu thuần, hai trường hợp đều biểu hiện là "ngừng nhận
telemetry" — cần một tín hiệu tầng giao thức để phân biệt. NF-09 đồng thời yêu cầu thiết bị
đệm dữ liệu khi mất sóng và bù lại với timestamp gốc.

## Quyết định
1. Mỗi xe có topic trạng thái **retained** `g3/status/{vin}` bên cạnh topic dữ liệu
   `g3/telemetry/{vin}`. Payload `TelemetryStatus` (@g3/contracts): `online|offline` +
   `reason: boot|graceful|lwt` + ts thiết bị.
2. Thiết bị (simulator) khai báo **LWT (Last Will and Testament)** khi kết nối:
   `{"status":"offline","reason":"lwt"}` retained. Broker EMQX tự phát tin này khi client
   rớt **không gửi DISCONNECT** (sau ~1,5× keepalive; keepalive 15s ⇒ phát hiện ≤ ~25s).
   Tắt máy chủ động thì thiết bị tự phát `reason:"graceful"` rồi DISCONNECT sạch.
3. Suy ra ngữ nghĩa cho consumer (ingest/cảnh báo, Prompt 05+):
   - `offline/lwt` = mất nguồn/tháo thiết bị → cảnh báo F-J3 cho vận hành & rủi ro.
   - `offline/graceful` = tắt bình thường.
   - Không có tin offline nhưng telemetry ngừng rồi sau đó bù dữ liệu timestamp cũ =
     mất sóng tạm (NF-09) — không phải tamper.
4. Trong simulator: kết nối MQTT **dùng chung 1 client** cho mọi xe (chịu 300 xe — NF-04);
   riêng kịch bản `power-loss` dùng client riêng từng xe vì LWT gắn theo kết nối.

## Lý do & các phương án đã loại
- LWT là cơ chế chuẩn MQTT 3.1.1/5.0, EMQX hỗ trợ sẵn — không cần code phía server,
  hoạt động cả khi thiết bị chết đột ngột (đúng bản chất mất nguồn: không kịp gửi gì).
- Heartbeat riêng + timeout phía server (loại làm cơ chế chính): chỉ phát hiện "im lặng",
  không phân biệt được mất nguồn với mất sóng — chính là lỗ hổng F-J3 muốn bịt. Vẫn sẽ có
  ở tầng ingest như lớp bổ sung (cờ online/offline của F-A1).
- Gói "goodbye" do thiết bị tự gửi trước khi tắt (loại): thiết bị mất nguồn đột ngột
  không bao giờ kịp gửi — mâu thuẫn đề bài.

## Hệ quả
- Ingest (Prompt 05) phải subscribe thêm `g3/status/#` và map `reason` → sự kiện F-J3.
- Phần cứng thật sau này phải cấu hình LWT y hệt (ghi vào spec nhà thầu thiết bị —
  docs/simulators.md là tài liệu tham chiếu hành vi chuẩn).
- Keepalive 15s là tham số cân bằng tốc độ phát hiện vs tải kết nối; đổi giá trị cần đo lại
  thời gian phát hiện (~1,5× keepalive).
- Trạng thái retained nghĩa là subscriber mới vào luôn thấy trạng thái cuối cùng của mỗi xe.
