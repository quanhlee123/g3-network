-- F-G1/F-G4 · Migration 0029 — Ghi HỆ TOẠ ĐỘ mà mỗi thiết bị báo về.
--
-- NGUỒN: "Tổng hợp kỹ thuật Tri-Ring — FMS Việt Nam" (trao đổi 21–31/07/2026), mục 9 và 10.
-- Tri-Ring xác nhận T-BOX có GPS kinh độ/vĩ độ, nhưng câu "WGS-84 hay GCJ-02?" được đánh dấu
-- ✖ CHƯA TRẢ LỜI và xếp vào nhóm ƯU TIÊN CAO ĐANG CHẶN THIẾT KẾ, kèm ghi chú:
-- "Nếu là GCJ-02, vị trí sẽ lệch khoảng 100–700 m khi hiển thị trên bản đồ tại Việt Nam."
--
-- VÌ SAO PHẢI GHI NGAY, KHÔNG ĐỢI CÓ CÂU TRẢ LỜI:
-- `telematics_readings.position` là geography(Point, 4326) — tức đã ngầm khẳng định WGS-84.
-- Nếu thiết bị thật gửi GCJ-02 mà ta cứ ghi vào cột đó thì:
--   · dữ liệu KHÔNG sai lệch một cách nhìn thấy được — chỉ lệch đều 100–700 m;
--   · geofence (F-A5) ra/vào sai vùng, gợi ý trạm gần nhất (F-D2) sai, bản đồ đội (F-E1) sai;
--   · và quan trọng nhất: TRỘN LẪN rồi thì KHÔNG CÒN CÁCH NÀO tách lại, vì trong bảng không
--     có gì phân biệt hàng nào theo hệ nào.
-- Đây là hỏng dữ liệu KHÔNG THỂ CỨU. Một cột ghi nguồn gốc là giá rẻ nhất để mua lại
-- khả năng sửa sau. Cùng tinh thần với consent_documents.la_ban_nhap của migration 0028:
-- khi chưa biết câu trả lời thì ghi sự-chưa-biết vào chính dữ liệu.
--
-- ⚠️ Migration này KHÔNG quyết định Q-TriRing-01 (hệ toạ độ là gì) — đó là việc của Tri-Ring
-- trả lời. Nó chỉ bảo đảm khi có câu trả lời thì ta chuyển đổi được.

CREATE TYPE he_toa_do AS ENUM (
  'wgs84',   -- chuẩn quốc tế, cũng là SRID 4326 mà PostGIS đang dùng
  'gcj02',   -- "Mars coordinates" — bắt buộc với bản đồ dân dụng tại Trung Quốc
  'chua_ro' -- thiết bị thật chưa xác nhận: KHÔNG được coi mặc định là wgs84
);

ALTER TABLE devices
  -- Hệ toạ độ mà THIẾT BỊ NÀY báo về. Phase 1 mọi thiết bị đều do simulator sinh và
  -- simulator phát WGS-84 thật, nên mặc định 'wgs84' là đúng với dữ liệu đang có.
  -- Thiết bị Tri-Ring K4-E thật khi nhập kho phải được đặt 'chua_ro' cho tới khi có
  -- văn bản xác nhận — xem docs/integrations/tri-ring-tbox.md.
  ADD COLUMN he_toa_do he_toa_do NOT NULL DEFAULT 'wgs84';

COMMENT ON COLUMN devices.he_toa_do IS
  'Hệ toạ độ thiết bị báo về. gcj02 lệch 100-700m so với wgs84 tại VN — phải chuyển đổi '
  'trước khi dùng cho geofence/bản đồ. chua_ro = chưa xác nhận, không được giả định wgs84. '
  'Nguồn: tài liệu kỹ thuật Tri-Ring 07/2026, câu hỏi ưu tiên cao chưa trả lời.';

-- Đánh dấu để truy vấn nhanh những thiết bị chưa xác nhận hệ toạ độ (báo cáo tiền pilot).
CREATE INDEX idx_devices_he_toa_do_chua_ro ON devices (he_toa_do) WHERE he_toa_do = 'chua_ro';
