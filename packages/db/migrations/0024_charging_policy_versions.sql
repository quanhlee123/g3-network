-- F-B1 · Migration 0024 — chính sách sạc CÓ VERSION, KHÔNG SỬA ĐÈ.
--
-- Bảng charging_policies đã có từ migration 0004 (F-G4) với cột version + hiệu lực từ–đến.
-- Migration này biến "có cột version" thành "không sửa đè được kể cả khi muốn".
--
-- MÔ HÌNH: tạo version mới là INSERT THUẦN, không đụng dòng cũ.
--   - version N+1 có effective_from muộn hơn version N → chính nó đóng hiệu lực version N.
--     Không cần UPDATE dòng cũ, nên lịch sử chính sách bất biến y như charging_sessions.
--   - effective_to CHỈ dùng khi NGỪNG HẲN một mã chính sách (không còn version kế tiếp),
--     và chỉ được đặt trên version mới nhất.
--   - "Version đang trị vì tại thời điểm T" = version có effective_from lớn nhất mà ≤ T
--     (xem apps/api/src/modules/policies/policy.ts).
--
-- Vì sao chặt tay đến vậy: phiên sạc quá khứ được đối chiếu với chính sách hiệu lực TẠI
-- THỜI ĐIỂM SẠC (F-B3). Nếu sửa đè được ngưỡng của một version cũ thì mọi kết luận vi phạm
-- đã ghi trước đó thành không kiểm chứng được — bằng chứng bảo hành mất giá trị pháp lý
-- (NF-11), đúng loại tranh chấp mà hợp đồng bảo hành 500.000km/5 năm sinh ra để giải quyết.

ALTER TABLE charging_policies
  ADD COLUMN created_by    uuid REFERENCES users (id),
  ADD COLUMN change_note   text,
  -- Version liền trước trong cùng mã chính sách (v1 thì NULL) — dựng lại được cả chuỗi
  ADD COLUMN supersedes_id uuid REFERENCES charging_policies (id);

COMMENT ON COLUMN charging_policies.change_note IS
  'Lý do tạo version này — người duyệt hợp đồng bảo hành đọc để hiểu vì sao ngưỡng đổi';
COMMENT ON COLUMN charging_policies.effective_to IS
  'CHỈ đặt khi ngừng hẳn mã chính sách. Version kế tiếp tự đóng version trước bằng effective_from.';

-- Tra chính sách áp cho 1 xe tại 1 thời điểm (F-B3 gọi mỗi lần đóng phiên sạc).
CREATE INDEX idx_policies_pham_vi_xe   ON charging_policies (vehicle_id)    WHERE scope_type = 'vehicle';
CREATE INDEX idx_policies_pham_vi_doi  ON charging_policies (customer_id)   WHERE scope_type = 'fleet';
CREATE INDEX idx_policies_pham_vi_dong ON charging_policies (vehicle_model) WHERE scope_type = 'model';
CREATE INDEX idx_policies_code_version ON charging_policies (code, version DESC);

-- ---------------------------------------------------------------------------
-- 1) Chuỗi version phải LIỀN MẠCH và tiến về phía trước.
--
-- Không có ràng buộc này thì chèn được version 5 có effective_from nằm TRƯỚC version 4,
-- và câu hỏi "chính sách nào hiệu lực lúc phiên sạc diễn ra" mất câu trả lời duy nhất.
-- Hai tiến trình chèn cùng lúc vẫn an toàn: UNIQUE (code, version) của migration 0004 chặn.
-- ---------------------------------------------------------------------------
CREATE FUNCTION charging_policies_version_noi_tiep() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  truoc record;
BEGIN
  SELECT id, version, effective_from, effective_to INTO truoc
  FROM charging_policies WHERE code = NEW.code
  ORDER BY version DESC LIMIT 1;

  IF NOT FOUND THEN
    IF NEW.version <> 1 THEN
      RAISE EXCEPTION 'Version đầu tiên của chính sách % phải là 1 (nhận %)', NEW.code, NEW.version
        USING ERRCODE = 'raise_exception';
    END IF;
    IF NEW.supersedes_id IS NOT NULL THEN
      RAISE EXCEPTION 'Chính sách % version 1 không nối tiếp version nào', NEW.code
        USING ERRCODE = 'raise_exception';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.version <> truoc.version + 1 THEN
    RAISE EXCEPTION 'Version chính sách % phải nối tiếp: mong đợi %, nhận %',
      NEW.code, truoc.version + 1, NEW.version USING ERRCODE = 'raise_exception';
  END IF;
  IF NEW.effective_from <= truoc.effective_from THEN
    RAISE EXCEPTION 'Version mới của chính sách % phải hiệu lực SAU version trước (% )',
      NEW.code, truoc.effective_from USING ERRCODE = 'raise_exception';
  END IF;
  IF NEW.supersedes_id IS DISTINCT FROM truoc.id THEN
    RAISE EXCEPTION 'supersedes_id của chính sách % v% phải trỏ tới version liền trước',
      NEW.code, NEW.version USING ERRCODE = 'raise_exception';
  END IF;
  IF truoc.effective_to IS NOT NULL THEN
    RAISE EXCEPTION 'Chính sách % đã ngừng hẳn lúc % — không thêm version mới được',
      NEW.code, truoc.effective_to USING ERRCODE = 'raise_exception';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER charging_policies_noi_tiep
  BEFORE INSERT ON charging_policies
  FOR EACH ROW EXECUTE FUNCTION charging_policies_version_noi_tiep();

-- ---------------------------------------------------------------------------
-- 2) Chỉ được NGỪNG HẲN version mới nhất; cấm sửa nội dung, cấm xoá.
--
-- So sánh bằng to_jsonb thay vì liệt kê từng cột: thêm cột ở migration sau vẫn được bảo vệ
-- tự động. Liệt kê tay thì cột mới lọt lưới mà không ai nhận ra.
-- ---------------------------------------------------------------------------
CREATE FUNCTION charging_policies_chi_duoc_ngung_han() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  version_moi_nhat integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'Chính sách sạc KHÔNG được xoá (F-B1): version cũ là căn cứ đối chiếu phiên sạc quá khứ. Muốn bỏ thì ngừng hiệu lực.'
      USING ERRCODE = 'raise_exception';
  END IF;

  IF (to_jsonb(NEW) - 'effective_to') IS DISTINCT FROM (to_jsonb(OLD) - 'effective_to') THEN
    RAISE EXCEPTION
      'Chính sách sạc KHÔNG được sửa đè (F-B1): mọi thay đổi nội dung phải tạo version mới.'
      USING ERRCODE = 'raise_exception';
  END IF;

  IF OLD.effective_to IS NOT NULL THEN
    RAISE EXCEPTION 'Chính sách % v% đã ngừng lúc % — không đổi lại được (F-B1)',
      OLD.code, OLD.version, OLD.effective_to USING ERRCODE = 'raise_exception';
  END IF;
  IF NEW.effective_to IS NULL THEN
    RAISE EXCEPTION 'Không được gỡ effective_to của chính sách % v% (F-B1)', OLD.code, OLD.version
      USING ERRCODE = 'raise_exception';
  END IF;

  -- Ngừng một version CŨ sẽ đục lỗ giữa dòng lịch sử: khoảng thời gian đó bỗng không còn
  -- chính sách nào, và kết luận vi phạm đã ghi cho khoảng đó không tái dựng được nữa.
  SELECT max(version) INTO version_moi_nhat FROM charging_policies WHERE code = OLD.code;
  IF OLD.version <> version_moi_nhat THEN
    RAISE EXCEPTION 'Chỉ ngừng được version mới nhất của chính sách % (mới nhất là v%, đang sửa v%)',
      OLD.code, version_moi_nhat, OLD.version USING ERRCODE = 'raise_exception';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER charging_policies_khong_sua_de
  BEFORE UPDATE OR DELETE ON charging_policies
  FOR EACH ROW EXECUTE FUNCTION charging_policies_chi_duoc_ngung_han();
