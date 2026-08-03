# PHIẾU THẨM ĐỊNH — những thứ Claude Code TỰ ĐẶT và cần người ký

> Lập ngày 2026-08-03, sau khi Prompt 08 (vòng tiền & bảo hành) vào `main`.
>
> **Vì sao có phiếu này**: PRD không cho con số ở một số chỗ, nhưng không có con số thì không
> code được. Những chỗ đó tôi đã đặt giá trị TẠM để hệ chạy trên simulator, ghi rõ trong ADR,
> và **để sửa được bằng cấu hình/SQL, không cần deploy**. Phiếu này liệt kê đúng những giá trị
> đó để người có thẩm quyền xác nhận hoặc thay.
>
> Cột "Hỏng thế nào nếu sai" là phần quan trọng nhất — nó cho biết cái giá của việc để nguyên.

---

## NHÓM A — SỐ LIỆU AN TOÀN & BẢO HÀNH (bắt buộc trước Gate 1)

Đây là nhóm **không phải câu hỏi phần mềm**. Người ký phải là người chịu trách nhiệm kỹ thuật
pin / bảo hành, không phải người viết code.

### A1–A3. Ngưỡng phát hiện bất thường pin (F-A4 — an toàn cháy nổ)

Nguồn: [ADR-009](adr/ADR-009-nguong-bat-thuong-pin.md) · Nằm ở: bảng `anomaly_rules`
(migration 0019) · Sửa bằng: 1 câu `UPDATE`, không deploy.

| # | Luật | Giá trị TẠM đang chạy | Hỏng thế nào nếu sai | Người ký |
|---|---|---|---|---|
| **A1** | Nhiệt độ pack cao | **55 °C**, biên trễ 5 °C | Đặt cao quá → pin cháy mà hệ im lặng. Đặt thấp quá → cảnh báo giả liên tục, tài xế tắt thông báo, rồi lần thật cũng bỏ qua | Nhà sản xuất pack / Tri-Ring |
| **A2** | Sụt áp đột ngột | **30 V trong 60 giây**, biên trễ 10 V | Cùng rủi ro như A1. Thêm một câu hỏi mở: pack 690V rơi 30V nhẹ hơn nhiều pack 320V rơi 30V — nên để VOLT tuyệt đối hay % dải điện áp theo dòng xe? | Nhà sản xuất pack / Tri-Ring |
| **A3** | Mã lỗi BMS coi là nghiêm trọng | **P0A80, P0A0D, P0AFA, P0A94** | Danh sách này tôi lấy theo mã OBD chung, KHÔNG lấy từ tài liệu BMS Tri-Ring. Thiếu mã → bỏ sót lỗi thật. Thừa mã → báo động giả | Tri-Ring (tài liệu BMS) |

> ⚠️ Chừng nào A1–A3 chưa ký: cảnh báo F-A4 **chỉ là tín hiệu vận hành**, không được dùng làm
> căn cứ kỹ thuật hay pháp lý, và không dùng để kết luận bảo hành.

**Câu hỏi kèm theo cần trả lời cùng lúc:**

- [ ] Cảnh báo nhiệt độ cao có kèm hành động tự động nào không (nhắc tài xế dừng xe, chặn sạc
      tiếp), hay chỉ báo tin? — liên quan **Q12** (ranh giới can thiệp từ xa) đang MỞ.

### A4. Tiêu chí "THƯỜNG XUYÊN" của vi phạm sạc (F-B3)

Nguồn: [ADR-011](adr/ADR-011-tieu-chi-vi-pham-sac.md) · Nằm ở: `VIOLATION_SOC_BREACH_COUNT`
/ `VIOLATION_SOC_BREACH_WINDOW_DAYS` (env), hoặc cột `charging_policies.soc_breach_count` /
`.soc_breach_window_days` để đặt riêng theo hợp đồng từng khách.

| # | Hạng mục | Giá trị TẠM | Hỏng thế nào nếu sai | Người ký |
|---|---|---|---|---|
| **A4** | Bao nhiêu lần chạm ngưỡng SOC trong bao nhiêu ngày thì gọi là "thường xuyên" | **3 lần / 30 ngày** | Sheet 4 chỉ viết "**thường xuyên** >90% hoặc <20%", không cho số. Đặt lỏng quá → hành vi bào mòn pin không bị ghi nhận. Đặt chặt quá → khách bị gắn cờ oan, và vì `violations` là append-only nên **dòng sai không xoá được** | Bảo hành G3 Mobility + Legal |

**Câu hỏi kèm theo:**

- [ ] Vi phạm `outside_hours` hiện gắn cờ khi có **bất kỳ phút nào** ngoài khung giờ. Có cho
      biên độ dung thứ không (vd bỏ qua nếu ≤5 phút, do tài xế cắm sớm vài phút)?
      Hiện KHÔNG có biên độ — chặt nhất có thể.

### A5. Hạn mức chống spam thông báo (F-F3)

Nguồn: [ADR-008](adr/ADR-008-rate-limit-thong-bao.md) · Nằm ở: `NOTIFY_RATE_LIMIT_MAX` /
`NOTIFY_RATE_LIMIT_WINDOW_S`.

| # | Hạng mục | Giá trị TẠM | Hỏng thế nào nếu sai | Người ký |
|---|---|---|---|---|
| **A5** | Trần tin nhắn cho kênh chen ngang (push/SMS) | **3 tin / 15 phút** cho mỗi (người × loại × kênh) | Lỏng quá → tài xế bị spam rồi tắt thông báo. Chặt quá → tin quan trọng bị nén. *(Cảnh báo nguy cấp severity 3 KHÔNG bao giờ bị chặn — cần xác nhận nguyên tắc này)* | PM + Vận hành |

**Câu hỏi kèm theo:**

- [ ] **SMS là kênh tốn tiền thật.** Hiện cấu hình SMS cho: pin ≤10%, bất thường pin (tài xế),
      nghi tháo thiết bị (admin). Có siết thêm không, và **ai chịu ngân sách SMS**?
- [ ] Chấp nhận nguyên tắc "severity 3 không bao giờ bị rate-limit", kèm ràng buộc mọi luật
      severity 3 phải tự chống trùng ở tầng alert?

### A6. Đơn giá điện đang dùng là GIÁ GIẢ

| # | Hạng mục | Giá trị TẠM | Hỏng thế nào nếu sai | Người quyết |
|---|---|---|---|---|
| **A6** | `CHARGING_PRICE_VND_PER_KWH` | **3.500 ₫/kWh** | Đây là số tôi bịa để demo chạy. Nó vào **số tiền thu của khách** và vào **chiều tiền của đối soát 3 chiều**. Không thay trước khi có khách thật = thu sai tiền | Kế toán Holding (**Q3**, **Q9** đang MỞ) |

### A7. Hệ số hiệu suất sạc — đã chốt nhưng CHƯA hiệu chuẩn

| # | Hạng mục | Giá trị | Việc còn phải làm | Người chịu |
|---|---|---|---|---|
| **A7** | `CHARGE_EFFICIENCY` = **1.0** | D-11 đã CHỐT, [ADR-007](adr/ADR-007-hieu-suat-sac-doi-soat.md) đã DUYỆT | 1.0 chỉ đúng với simulator lý tưởng. Phần cứng thật sẽ lệch 5–8% ở **100% số phiên** → đối soát báo lệch hàng loạt. **Phải hiệu chuẩn bằng dữ liệu pilot trước Gate 1** — và ADR-007 vẫn chưa chỉ định AI làm việc hiệu chuẩn này | PM chỉ định người |

---

## NHÓM B — ADR ĐANG NHÁP, CHỜ DUYỆT (9 cái)

Đây là quyết định kỹ thuật, không phải con số an toàn. Duyệt = đổi dòng `Trạng thái:` trong
file thành `ĐÃ DUYỆT` + ghi tên người duyệt và ngày.

| ADR | Nội dung | Ghi chú |
|---|---|---|
| [ADR-002](adr/ADR-002-migration-sql-thuan.md) | Migration SQL thuần, đánh số thứ tự | Code đã dựa vào từ Prompt 03 |
| [ADR-003](adr/ADR-003-mqtt-lwt-phat-hien-mat-nguon.md) | MQTT LWT để phát hiện mất nguồn | Code F-J3 đã dựa vào từ Prompt 04 |
| [ADR-004](adr/ADR-004-quarantine-telemetry.md) | Cách ly bản tin telemetry hỏng thay vì drop | |
| [ADR-005](adr/ADR-005-csms-ocpp-transactions.md) | Tách `ocpp_transactions` (mutable) khỏi `charging_sessions` (append-only) | Nền tảng của cả F-B2 và F-H1 |
| [ADR-008](adr/ADR-008-rate-limit-thong-bao.md) | Rate-limit thông báo | Xem A5 ở trên |
| [ADR-009](adr/ADR-009-nguong-bat-thuong-pin.md) | Ngưỡng bất thường pin | Xem A1–A3 ở trên |
| [ADR-010](adr/ADR-010-version-chinh-sach-sac.md) | Version chính sách sạc | Xem 3 điểm bên dưới |
| [ADR-011](adr/ADR-011-tieu-chi-vi-pham-sac.md) | Tiêu chí gắn cờ vi phạm | Xem A4 ở trên |
| [ADR-012](adr/ADR-012-thanh-toan-sandbox.md) | Luồng thanh toán sandbox | Xem 1 điểm bên dưới |

**Ba điểm trong ADR-010 cần xác nhận rõ (PRD không nói):**

- [ ] **Thứ tự ưu tiên phạm vi chính sách: xe > đội > dòng xe.** Nghĩa là ngoại lệ ký riêng cho
      một xe luôn thắng quy định chung của cả dòng. Đúng ý nghiệp vụ chứ?
- [ ] **Tạo version mới thì ngưỡng nào không gửi sẽ GIỮ NGUYÊN của version trước**; muốn bỏ một
      giới hạn phải gửi `null` tường minh. (Phương án ngược lại — bỏ trống = xoá — dễ khiến
      người soạn vô tình **nới lỏng** bảo hành.)
- [ ] **Khung giờ ToU hiểu theo múi giờ `Asia/Ho_Chi_Minh`** (`APP_TIMEZONE`). Khi mở rộng
      GMS (Lào, Trung) sẽ cần múi giờ theo từng chính sách — chấp nhận hoãn tới lúc đó?

**Một điểm trong ADR-012 cần xác nhận:**

- [ ] Giao dịch thanh toán **neo vào phiên OCPP**, không neo vào phiên sạc — để webhook đến
      trước khi trụ kịp gửi `StopTransaction` vẫn ghi nhận được tiền mà không phải bịa bản ghi
      phiên sạc. Hệ quả: có thể tồn tại giao dịch `succeeded` mà chưa gắn phiên (trạng thái
      **hợp lệ**, không phải lỗi dữ liệu). Vận hành chấp nhận trạng thái này chứ?

---

## NHÓM C — PHÂN QUYỀN TÔI PHẢI SUY LUẬN (11 mục)

Sheet 9 không phủ hết các màn hình mới. Chi tiết từng mục ở
[docs/architecture/rbac-matrix.md](architecture/rbac-matrix.md), phần `[CẦN REVIEW]`.

| Mã | Vấn đề | Tôi đã chọn | Người xác nhận |
|---|---|---|---|
| **R-01** | Sale được xem **vị trí xe** (sheet 9 ghi "V") | Giữ đúng sheet 9 — nhưng khó biện minh theo nguyên tắc thu thập tối thiểu của Nghị định 13 | PM + **Legal** |
| **R-02** | Sale và danh sách phiên sạc | Chọn CHẶT hơn: Sale **không** có | PM |
| **R-03** | Tài xế xem danh mục trạm | Cho đọc; thao tác ghi tách thành `station.manage` | *(đã rõ)* |
| **R-04** | QL đội xem đối soát kWh phạm vi đội | Lọc theo `customer_id` | PM xác nhận |
| **R-05** | Bảo hành & CSKH **không** thấy trạm sạc | Giữ đúng sheet 9 (từ chối) — dù CSKH hỗ trợ tài xế hết pin thì cần biết trạm nào còn trống | CSKH Holding |
| **R-06** | "Thông báo của tôi" — sheet 9 không có dòng nào | Cấp cho cả 7 vai trò, phạm vi `own` cứng (không ai xem hộp thư người khác, kể cả admin) | PM xác nhận |
| **R-07** | Geofence — sheet 9 không có dòng nào | Đặt ngang quyền xem vị trí xe | PM + Vận hành |
| **R-08** | Ticket cho Vận hành / Bảo hành / Sale | Chọn CHẶT hơn: ba vai trò này **chưa** có | PM + CSKH *(nằm trong D-09 đang MỞ)* |
| **R-09** | Ai được **ĐỌC** chính sách sạc (sheet 9 chỉ có quyền GHI) | Thêm Tài xế (`own`) + QL đội (`fleet`) — vì F-B5 bắt buộc cảnh báo phải nêu cách khắc phục, mà không cho xem quy định thì cảnh báo vô nghĩa | PM + Bảo hành |
| **R-10** | Sale và hồ sơ vi phạm sạc | Chọn CHẶT hơn: Sale **không** có (bằng chứng chứa cả telemetry) | PM + Legal |
| **R-11** | **Webhook thanh toán là route CÔNG KHAI** | Ngoại lệ duy nhất của "mặc định TỪ CHỐI" ngoài health/docs/đăng nhập. Xác thực bằng **chữ ký HMAC**. Pen-test (NF-07) nên soi endpoint này trước tiên | PM + Bảo mật |

---

## NHÓM D — QUYẾT ĐỊNH NGHIỆP VỤ ĐANG MỞ

Đã có sẵn trong [docs/DECISION-LOG.md](DECISION-LOG.md). Liệt kê lại theo **mức độ chặn**:

### Đang chặn công việc tiếp theo

| Mã | Câu hỏi | Chặn gì |
|---|---|---|
| **D-01** | Có app tài xế ở P1 không? | ⚠️ **Chặn Prompt 09**. F-H1 hiện mới có API backend; màn hình quét QR chưa làm |
| **Q4** | Vi phạm sạc: chỉ cảnh báo hay có chế tài? | Chặn phần "xử lý" của F-B3/F-B5/F-B6. Hiện hệ thống **chỉ ghi bằng chứng + cảnh báo**, không trừ điểm, không đổi trạng thái bảo hành, không tính phí |
| **Q1** | Đặc tả BMS Tri-Ring | Chặn A1–A3 ở trên |
| **Q3 / Q9** | Đơn giá điện thật & hoá đơn điện tử | Chặn A6 ở trên. Biên nhận kWh hiện mới ở mức dữ liệu, **chưa phải hoá đơn hợp lệ** |
| **D-09 / Q6** | Ai vận hành CSKH & cứu hộ 24/7 | Chặn phần nghiệp vụ F-I2 (quy trình gọi lại, phân ca, hotline dự phòng) |

### Chưa chặn nhưng nên chốt sớm

| Mã | Câu hỏi |
|---|---|
| **D-02** | Dùng thẻ RFID ở trụ sạc? (hiện `idTag = VIN`) |
| **D-12** | Vai trò "Quản lý rủi ro" nhận cảnh báo tháo thiết bị — vai trò này **không tồn tại** trong sheet 9 lẫn enum `user_role`; tạm cấu hình cho admin/QL đội/CSKH |
| **D-05…D-08** | F-A6 actor · F-E3 báo cáo cho ai · F-E4 mô hình quản lý tài xế · F-F2/F-J2 provisioning |
| **Q2** | Ai vận hành CSMS (hiện G3 tự xây theo khuyến nghị PRD) |
| **Q5** | Nhà cung cấp bản đồ |
| **Q7** | Consent & chính sách dữ liệu tài xế (Nghị định 13) |
| **Q8** | OCPP 1.6J hay yêu cầu 2.0.1 ngay từ hồ sơ mua sắm |
| **Q10–Q12** | Pháp lý P2 · MOU nguồn hàng · ranh giới khoá xe từ xa |

---

## SAU KHI KÝ THÌ LÀM GÌ

Không cần sửa code cho nhóm A. Cụ thể:

| Ký xong mục | Áp vào hệ thống bằng |
|---|---|
| A1–A3 | `UPDATE anomaly_rules SET nguong_so = …, bien_tre_so = …, ma_loi = ARRAY[…]` |
| A4 | Sửa `VIOLATION_SOC_BREACH_COUNT` / `_WINDOW_DAYS` trong `infra/.env`; hoặc đặt riêng theo hợp đồng bằng cột `soc_breach_count` / `soc_breach_window_days` khi ban hành version chính sách mới |
| A5 | Sửa `NOTIFY_RATE_LIMIT_MAX` / `_WINDOW_S` |
| A6 | Sửa `CHARGING_PRICE_VND_PER_KWH` |
| A7 | Sửa `CHARGE_EFFICIENCY` sau khi hiệu chuẩn bằng dữ liệu pilot |
| Nhóm B | Đổi dòng `Trạng thái:` trong file ADR + ghi tên người duyệt & ngày |
| Nhóm C | Nếu khác lựa chọn của tôi → sửa `apps/api/src/auth/permissions.ts` + cập nhật `rbac-matrix.md` (có test khoá lại, sai là test đỏ) |
| Nhóm D | Điền 5 trường vào `docs/DECISION-LOG.md` (Phương án / Lý do / Người quyết / Ngày / Trạng thái) |

**Lưu ý về dữ liệu quá khứ**: đổi ngưỡng **không hồi tố**. Vi phạm đã ghi giữ nguyên vì
`violations` là append-only (NF-11). Muốn áp ngưỡng mới cho quá khứ thì chạy
`POST /violations/run` với `lam_lai_tat_ca` — và nó cũng chỉ **thêm** vi phạm mới, không xoá
cái cũ. Đây là chủ ý, không phải hạn chế.

---

## Ô KÝ

| Nhóm | Người duyệt | Chữ ký | Ngày |
|---|---|---|---|
| A1–A3 (ngưỡng an toàn pin) | | | |
| A4 (tiêu chí "thường xuyên") | | | |
| A5 (rate-limit & ngân sách SMS) | | | |
| A6–A7 (đơn giá điện, hiệu suất sạc) | | | |
| B (9 ADR) | | | |
| C (phân quyền R-01…R-11) | | | |
| D (quyết định nghiệp vụ) | | | |
