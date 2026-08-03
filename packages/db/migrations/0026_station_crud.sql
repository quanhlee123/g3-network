-- F-C1 · Migration 0026 — hỗ trợ CRUD danh mục trạm sạc (Vận hành G3 Energy).
--
-- charging_stations trước đây chỉ được ghi bởi seed, nên không cần dấu vết sửa đổi.
-- Từ khi Vận hành sửa được qua API thì hai câu hỏi vận hành xuất hiện ngay:
-- "trạm này sửa lần cuối lúc nào" và "ai sửa" — nếu không có thì mỗi lần trạm biến mất
-- khỏi bản đồ app lại phải đi hỏi vòng quanh.

ALTER TABLE charging_stations
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN updated_by uuid REFERENCES users (id),
  -- Ghi chú vận hành: lý do đưa trạm vào bảo trì, số điện thoại kỹ thuật tại chỗ…
  ADD COLUMN note       text;

COMMENT ON COLUMN charging_stations.status IS
  'active = phục vụ · maintenance = đang bảo trì · inactive = ngừng khai thác. KHÔNG xoá trạm: phiên sạc cũ trỏ tới nó (NF-11).';

-- Bản đồ trạm (F-C2) lọc theo trạng thái trước rồi mới lọc không gian.
CREATE INDEX idx_stations_status ON charging_stations (status);

-- Báo cáo kWh theo khách hàng (F-C6): gom phiên sạc theo đội xe trong một khoảng thời gian.
-- Không có index này thì báo cáo tháng phải quét toàn bảng phiên sạc.
CREATE INDEX idx_sessions_ended ON charging_sessions (ended_at DESC) WHERE ended_at IS NOT NULL;
