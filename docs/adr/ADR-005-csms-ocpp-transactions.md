# ADR-005: CSMS tách bảng ocpp_transactions (mutable) khỏi charging_sessions (append-only)

Ngày: 2026-07-28 · Người đề xuất: Claude Code (Prompt 05, F-G2) · Người duyệt: (chờ duyệt) · Trạng thái: NHÁP

## Bối cảnh

`charging_sessions` là bảng APPEND-ONLY có trigger chặn UPDATE/DELETE (NF-11 — bằng chứng
pháp lý bảo hành). Nhưng một phiên sạc OCPP là quá trình SỐNG: StartTransaction mở phiên,
MeterValues cập nhật liên tục (công tơ, SoC, công suất), StopTransaction đóng phiên — và
trụ có thể mất kết nối giữa chừng rồi gửi StopTransaction bù (kể cả gửi trùng 2 lần khi
retry). Không thể vừa "ghi một lần bất biến" vừa "cập nhật liên tục" trên cùng một bảng.

## Quyết định

1. Bảng **`ocpp_transactions`** (migration 0012, MUTABLE có chủ đích): trạng thái phiên
   đang mở phía CSMS — `transaction_id` (integer identity, chính là transactionId OCPP
   do CSMS cấp), meter_start/last_meter, SoC đầu/mới nhất, max_power, status open/closed.
   Nằm trong DB (không giữ trong RAM) để phiên **sống sót khi CSMS restart** và khi trụ
   mất kết nối lâu.
2. **`charging_sessions` chỉ được ghi ĐÚNG MỘT LẦN, tại StopTransaction** (F-B2), tổng
   hợp từ `ocpp_transactions`: kWh = (meterStop − meterStart)/1000, SOC đầu/cuối,
   avg/max power. `ocpp_transaction_id UNIQUE` + `ON CONFLICT DO NOTHING` bảo đảm
   StopTransaction gửi trùng không tạo dòng thứ hai.
3. **idTag = VIN xe GIẢ** ở Phase 1 (simulator): CSMS resolve idTag → `vehicles.vin`;
   idTag lạ bị từ chối (`Invalid`) vì `charging_sessions.vehicle_id NOT NULL` — phiên sạc
   phục vụ bảo hành phải quy được về xe. Khi luồng thanh toán QR (F-H1) vào, idTag sẽ do
   backend cấp sau khi tài xế quét QR; quy ước này chỉ là giàn giáo Phase 1.
4. Trạng thái trụ: StatusNotification ghi thẳng `connectors.status` (NF-02 ≤30s; enum DB
   4 giá trị — trạng thái OCPP trung gian quy về nhóm gần nhất trong `mapOcppStatus`).
   Trụ rớt kết nối → connectors về `Unavailable` (trừ `Faulted`), phiên open GIỮ NGUYÊN
   chờ Stop bù.
5. RemoteStartTransaction/RemoteStopTransaction expose qua HTTP nội bộ tối giản
   (`CSMS_HTTP_PORT`, không đưa vào OpenAPI của apps/api — chỉ backend nội bộ gọi,
   chuẩn bị F-H1).

## Lý do & các phương án đã loại

- **Ghi charging_sessions ngay tại Start rồi UPDATE dần** (loại): vi phạm trực diện NF-11
  (trigger chặn UPDATE); nếu nới trigger thì mất giá trị bằng chứng bất biến.
- **Giữ phiên đang mở trong RAM CSMS** (loại): CSMS restart hoặc trụ offline dài là mất
  phiên → sai kWh, mất bản ghi bảo hành — chính là kịch bản xấu Prompt 05 bắt test.
- **Dùng transactionId do trụ tự sinh** (loại): OCPP 1.6 quy định CSMS cấp transactionId
  trong StartTransaction.conf; identity sequence của DB cho id duy nhất, không đụng độ
  giữa các trạm.

## Hệ quả

- Đối soát 3 chiều (NF-10, prompt sau) đọc: trụ = `charging_sessions` (nguồn OCPP),
  xe = `telematics_readings` quanh khung giờ phiên, thanh toán = `payment_transactions`.
- `ocpp_transactions` là bảng vận hành: được phép dọn dẹp phiên `closed` cũ (không phải
  bằng chứng — bằng chứng nằm ở `charging_sessions`).
- Phiên 'open' mồ côi (trụ chết hẳn, không bao giờ gửi Stop) sẽ cần job quét timeout ở
  prompt vận hành sau — Phase 1 chấp nhận để mở.
- Đổi giờ trụ lệch làm avg_power vô nghĩa → CSMS bỏ trống avg thay vì ghi số ảo
  (numeric(8,2) tràn); max_power vẫn từ MeterValues thật.
