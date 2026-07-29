# ADR-004: Bản tin telemetry hỏng vào bảng quarantine + alert, không drop lặng lẽ

Ngày: 2026-07-28 · Người đề xuất: Claude Code (Prompt 05, F-G1) · Người duyệt: (chờ duyệt) · Trạng thái: NHÁP

## Bối cảnh

Ingest (F-G1) nhận bản tin MQTT từ thiết bị và ghi vào `telematics_readings`. Bản tin có thể
hỏng: JSON sai cú pháp, sai schema so với `schema_version` khai báo, version chưa hỗ trợ,
VIN không tồn tại trong hệ thống (nguy cơ thiết bị giả mạo bơm dữ liệu — NF-06). Dữ liệu
telematics dùng cho quyết định bảo hành nên "âm thầm bỏ bản ghi hỏng" là không chấp nhận
được: mất dấu vết điều tra và che giấu sự cố chất lượng dữ liệu (NF-14 yêu cầu alert khi
pipeline có vấn đề).

## Quyết định

1. Bảng **`telemetry_quarantine`** (migration 0010): mọi bản tin không qua được validate
   được lưu NGUYÊN VĂN (`raw_payload` text — kể cả khi không parse được JSON) kèm
   `received_at`, `topic`, `schema_version` (nếu đọc được) và `reason` mã hóa ngắn gọn
   (`json_khong_hop_le`, `sai_schema_v1: …`, `schema_version_khong_ho_tro`,
   `vin_khong_ton_tai`, `vin_khong_khop_topic`).
2. Mỗi lần có bản tin vào quarantine, ingest sinh **alert `data_quality`** (enum
   `alert_type` mở rộng ở migration 0010). Chống spam bằng `dedup_key`
   `F-G1:data_quality:{giờ-UTC}` — tối đa 1 alert/giờ dù hỏng hàng loạt.
3. Alert `data_quality` được phép **không gắn `vehicle_id`/`device_id`** (migration 0011
   nới CHECK của bảng `alerts`) vì bản tin VIN lạ không quy được về xe nào. Phải tách
   migration riêng: PostgreSQL cấm dùng giá trị enum mới trong cùng transaction với
   `ALTER TYPE … ADD VALUE`.
4. Bản ghi **trùng** (thiết bị gửi bù sau mất sóng — NF-09) KHÔNG phải lỗi: đi qua
   `ON CONFLICT DO NOTHING` trên khóa `(vehicle_id, time)`, đếm vào metric
   `g3_ingest_records_total{result="duplicate"}`, không vào quarantine.

## Lý do & các phương án đã loại

- **Drop + log console** (loại): log trôi mất, không truy vấn được, không alert — vi phạm
  tinh thần NF-14 và làm mất bằng chứng khi tranh chấp chất lượng dữ liệu bảo hành.
- **Ghi thẳng vào `telematics_readings` với cờ lỗi** (loại): bảng hypertable phục vụ truy
  vấn nghiệp vụ (cảnh báo pin, đối soát) — trộn dữ liệu hỏng vào buộc mọi truy vấn phải
  lọc, và bản tin không parse được thì không có cột nào để ghi.
- **Dead-letter queue trên EMQX** (loại ở Phase 1): thêm hạ tầng phải vận hành; bảng SQL
  đủ cho quy mô 300 xe (NF-04) và truy vấn điều tra tiện hơn cho đội vận hành.

## Hệ quả

- Đội vận hành có 1 nơi duy nhất để điều tra dữ liệu bẩn: `SELECT * FROM
  telemetry_quarantine ORDER BY received_at DESC` + alert `data_quality` trên dashboard.
- Bảng quarantine chưa có retention policy — nếu tỷ lệ hỏng cao bất thường sẽ phình;
  alert mỗi giờ chính là tín hiệu phải xử lý gốc rễ. Sẽ thêm retention khi có số liệu pilot.
- Khi lên `schema_version` mới, PHẢI thêm validator mới vào registry
  `services/ingest/src/validate.ts` TRƯỚC khi thiết bị bắt đầu gửi version đó, nếu không
  toàn bộ bản tin version mới sẽ dồn vào quarantine (tương thích ngược NF-16 giữ được:
  validator cũ không bị sửa).
