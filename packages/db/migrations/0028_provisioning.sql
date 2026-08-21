-- F-F2 · Migration 0028 — Provisioning thiết bị theo VIN khi bàn giao xe.
--
-- Hành trình 1 bước 1 (sheet 2): "Nhân viên G3 kích hoạt thiết bị theo VIN; tài xế cài app,
-- đăng nhập bằng SĐT, xe hiện trong app ngay" — đo bằng "% kích hoạt thành công tại chỗ
-- (mục tiêu ≥98%)".
--
-- Muốn đo được tỷ lệ đó thì phải ghi lại CẢ LẦN HỎNG, không chỉ lần xong. Đây là lý do có
-- bảng riêng thay vì chỉ set devices.vehicle_id: một lần kích hoạt là một QUY TRÌNH có thể
-- dừng ở bất kỳ bước nào (quét sai VIN, thiết bị đã gắn xe khác, tài xế chưa ký consent,
-- telemetry không về sau 60 giây). Không lưu quy trình thì mẫu số của KPI không tồn tại.

-- ---------------------------------------------------------------------------------------
-- VĂN BẢN ĐỒNG Ý XỬ LÝ DỮ LIỆU CÁ NHÂN (Nghị định 13/2023)
--
-- ⚠️ Q7 ĐANG MỞ: nội dung pháp lý do Legal soạn, CHƯA có. Bảng này dựng sẵn CẤU TRÚC
-- phiên bản để khi Legal giao văn bản thật chỉ cần INSERT thêm một dòng — không phải sửa
-- schema, không phải migrate dữ liệu consent đã ký.
--
-- Cột `la_ban_nhap` là rào chắn quan trọng nhất ở đây: nó ghi thẳng vào dữ liệu rằng chữ ký
-- thu được theo bản nháp KHÔNG có giá trị pháp lý. Thiếu cột này thì sau khi Legal giao văn
-- bản thật, không ai phân biệt được consent nào ký theo placeholder và consent nào ký thật —
-- và sẽ có người tưởng đã đủ căn cứ pháp lý cho toàn bộ đội xe pilot.
-- ---------------------------------------------------------------------------------------
CREATE TABLE consent_documents (
  version     text PRIMARY KEY,                     -- vd 'v0.1-cho-legal', 'v1.0'
  tieu_de     text NOT NULL,
  noi_dung    text NOT NULL,
  -- true = BẢN NHÁP, chưa có giá trị pháp lý (Q7 chưa chốt)
  la_ban_nhap boolean NOT NULL DEFAULT true,
  hieu_luc_tu timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Bản placeholder để luồng kích hoạt chạy được từ hôm nay trên simulator.
-- Nội dung cố tình nói rõ nó là gì, để không ai in ra rồi đưa tài xế thật ký.
INSERT INTO consent_documents (version, tieu_de, noi_dung, la_ban_nhap) VALUES (
  'v0.1-cho-legal',
  '[CHỜ LEGAL — Q7] Đồng ý xử lý dữ liệu cá nhân của tài xế',
  E'[CHỜ LEGAL — Q7] Đây là VĂN BẢN NHÁP, CHƯA CÓ GIÁ TRỊ PHÁP LÝ.\n\n'
  'Nội dung chính thức do bộ phận Legal soạn theo Nghị định 13/2023/NĐ-CP, phải nêu tối thiểu:\n'
  '  1. Dữ liệu cá nhân nào được thu thập (vị trí xe theo thời gian thực, lộ trình, số điện thoại,\n'
  '     hành vi lái xe) và ai là Bên Kiểm soát dữ liệu.\n'
  '  2. Mục đích xử lý và cơ sở pháp lý cho từng mục đích.\n'
  '  3. Thời gian lưu trữ và cách huỷ dữ liệu.\n'
  '  4. Bên thứ ba nào được chia sẻ (chủ xe/đội xe, CSKH, cơ quan nhà nước khi có yêu cầu).\n'
  '  5. Quyền của chủ thể dữ liệu: rút lại đồng ý, yêu cầu xem/xoá, khiếu nại — và cách thực hiện.\n'
  '  6. TÌNH HUỐNG TÀI XẾ LÀM THUÊ: người ký hợp đồng là chủ xe, nhưng chủ thể dữ liệu là tài xế.\n'
  '     Đồng ý phải lấy TRỰC TIẾP từ tài xế, không suy ra từ hợp đồng của chủ xe (Q7 nêu rõ).\n\n'
  'Cho tới khi Legal giao bản chính thức, mọi chữ ký thu theo bản này chỉ dùng để CHẠY THỬ\n'
  'quy trình trên simulator và phải được thu lại bằng bản chính thức trước pilot.',
  true
);

-- ---------------------------------------------------------------------------------------
-- PHIÊN KÍCH HOẠT
-- ---------------------------------------------------------------------------------------
CREATE TYPE provisioning_status AS ENUM (
  'dang_lam',    -- đang thực hiện tại chỗ
  'thanh_cong',  -- đủ 4 bước, telemetry đã về
  'that_bai',    -- dừng giữa chừng, có lý do
  'huy'          -- nhân viên chủ động huỷ (không tính vào mẫu số KPI)
);

-- Bước đang đứng — để màn hình mở lại đúng chỗ nếu nhân viên đóng nhầm tab giữa lúc bàn giao.
CREATE TYPE provisioning_buoc AS ENUM (
  'chon_xe',      -- đã nhận VIN hợp lệ
  'gan_thiet_bi', -- đã gán device
  'consent',      -- tài xế đã đồng ý
  'cho_telemetry',-- đang chờ dữ liệu về
  'xong'
);

CREATE TABLE provisioning_sessions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id        uuid NOT NULL REFERENCES vehicles (id),
  device_id         uuid REFERENCES devices (id),
  status            provisioning_status NOT NULL DEFAULT 'dang_lam',
  buoc              provisioning_buoc NOT NULL DEFAULT 'chon_xe',

  -- Consent: giữ CẢ phiên bản văn bản lẫn tài xế đã ký. drivers.consent_at/consent_version
  -- (migration 0001) là trạng thái HIỆN TẠI của tài xế; ở đây là BẰNG CHỨNG của lần bàn giao.
  consent_version   text REFERENCES consent_documents (version),
  consent_driver_id uuid REFERENCES drivers (id),
  consent_at        timestamptz,

  -- Bằng chứng telemetry đã về: mốc bản ghi đầu tiên nhận được và chờ mất bao lâu.
  telemetry_ok_at   timestamptz,
  cho_telemetry_giay integer CHECK (cho_telemetry_giay >= 0),

  ly_do_that_bai    text,
  thuc_hien_boi     uuid NOT NULL REFERENCES users (id),
  bat_dau_at        timestamptz NOT NULL DEFAULT now(),
  ket_thuc_at       timestamptz,

  -- Đã kết thúc thì phải có mốc kết thúc, và thất bại thì phải nêu lý do — KPI mà không
  -- biết hỏng vì sao thì chỉ là một con số, không sửa được quy trình.
  CONSTRAINT provisioning_ket_thuc_hop_le CHECK (
    (status = 'dang_lam' AND ket_thuc_at IS NULL)
    OR (status <> 'dang_lam' AND ket_thuc_at IS NOT NULL)
  ),
  CONSTRAINT provisioning_that_bai_co_ly_do CHECK (
    status <> 'that_bai' OR ly_do_that_bai IS NOT NULL
  ),
  CONSTRAINT provisioning_thanh_cong_du_bang_chung CHECK (
    status <> 'thanh_cong'
    OR (device_id IS NOT NULL AND consent_at IS NOT NULL AND telemetry_ok_at IS NOT NULL)
  )
);

CREATE INDEX idx_provisioning_vehicle ON provisioning_sessions (vehicle_id, bat_dau_at DESC);
CREATE INDEX idx_provisioning_status ON provisioning_sessions (status, bat_dau_at DESC);

-- Mỗi xe chỉ có MỘT phiên đang làm dở: hai nhân viên cùng kích hoạt một xe sẽ giẫm lên
-- device_id của nhau và KPI đếm trùng.
CREATE UNIQUE INDEX idx_provisioning_mot_phien_dang_lam
  ON provisioning_sessions (vehicle_id)
  WHERE status = 'dang_lam';
