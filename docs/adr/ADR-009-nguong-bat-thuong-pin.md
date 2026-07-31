# ADR-009: Ngưỡng phát hiện bất thường pin — để trong bảng, và ba con số mặc định chưa được thẩm định

Ngày: 2026-07-30 · Người đề xuất: Claude Code (Prompt 07, F-A4) · Người duyệt: (chờ duyệt) · Trạng thái: NHÁP

## Bối cảnh

F-A4 là tính năng **Must** và được PRD v2.0 nâng cấp từ Should lên Must với lý do ghi thẳng
trong sheet 4: *"an toàn cháy nổ pin"*. Nó phải trả lời câu hỏi "pin này có đang nguy hiểm
không" bằng ba tín hiệu: nhiệt độ pack, tốc độ sụt điện áp, và mã lỗi BMS.

Vấn đề: **PRD không cho con số nào**, và đặc tả BMS của Tri-Ring vẫn nằm ở **Q1 (MỞ)** trong
docs/DECISION-LOG.md. Không có ngưỡng thì không có F-A4; mà tự đặt ngưỡng an toàn cho một
hệ thống pin là việc vượt thẩm quyền kỹ thuật của người viết phần mềm.

## Quyết định

1. **Ngưỡng nằm trong bảng `anomaly_rules`, không nằm trong code** (migration 0019), phạm vi
   XE > ĐỘI > MẶC ĐỊNH giống F-A2. Khi nhà sản xuất pin đưa thông số thật, vận hành sửa một
   dòng SQL là xong — không sửa code, không deploy, không chờ release.

2. **Ba con số mặc định là mức KỸ THUẬT TẠM, không phải ngưỡng an toàn đã thẩm định.**
   Chúng được chọn để hệ thống chạy đúng trên simulator và được ghi rõ ràng như vậy trong
   comment của migration:

   | Luật | Mặc định | Căn cứ (yếu) |
   |---|---|---|
   | `nhiet_do_cao` | 55°C, biên trễ 5°C | Pack LFP vượt 55°C là vùng phải can thiệp; simulator kịch bản (d) leo tới 60°C |
   | `sut_ap_dot_ngot` | 30V trong 60s, biên trễ 10V | Pack 320–690V mà rơi 30V trong 1 phút là bất thường ở mọi dòng xe hiện có |
   | `ma_loi_bms` | `P0A80`, `P0A0D`, `P0AFA`, `P0A94` | Mã lỗi pack pin/điện áp; danh sách thật phải lấy từ tài liệu BMS |

3. **Chống trùng ở tầng alert là BẮT BUỘC, không phải tuỳ chọn.** ADR-008 quy định cảnh báo
   `severity = 3` không bao giờ bị rate-limit của khung thông báo chặn. Nếu F-A4 không tự
   chống trùng thì nhiệt độ giữ ở 60°C sẽ bắn thông báo mỗi 10 giây. Cơ chế: mỗi (xe, loại)
   tối đa một cảnh báo mở, chỉ đóng khi điều kiện hết hẳn qua biên trễ. Có **hai lớp** — tập
   trong RAM và `WHERE NOT EXISTS` ở câu INSERT — vì hai tiến trình ingest chạy song song thì
   chỉ lớp DB mới cứu được.

4. **Snapshot là 5 phút TRƯỚC sự kiện.** Tại thời điểm phát hiện, dữ liệu sau sự kiện chưa tồn
   tại. Phần trước mới trả lời được "pin nóng lên từ lúc nào, nhanh cỡ nào". Nếu sau này cần
   cả phần sau thì phải làm job bổ sung snapshot — tuyệt đối không chặn cảnh báo để chờ đủ
   5 phút dữ liệu sau.

## Lý do & các phương án đã loại

- **Chờ Q1 chốt rồi mới làm F-A4** (loại): F-A4 là Must và là tính năng an toàn; hoãn nó đồng
  nghĩa Phase 1 không có lớp phát hiện cháy nổ nào. Tiền lệ ADR-006 (PM đã duyệt) cho phép
  làm với tham số tạm miễn là ghi rõ và sửa được không cần deploy.
- **Hardcode ngưỡng trong code** (loại): vi phạm chính yêu cầu của Prompt 7.2, và biến việc
  hiệu chỉnh một con số an toàn thành một lần release.
- **Ngưỡng nhiệt theo dòng xe (`vehicle_model`)** (hoãn): hợp lý về kỹ thuật, nhưng ba dòng
  EVT hiện dùng chung hoá chất LFP và chưa có dữ liệu để biện minh cho ba con số khác nhau.
  Phạm vi XE/ĐỘI đã đủ để đặt riêng khi cần.
- **Suy ngưỡng sụt áp theo % dải điện áp của từng dòng xe** (hoãn): đúng hơn về mặt vật lý
  (pack 690V rơi 30V nhẹ hơn nhiều so với pack 320V rơi 30V), nhưng cần dữ liệu thật để chọn
  hệ số. Đã ghi thành câu hỏi cho người duyệt bên dưới.

## Hệ quả

- Chừng nào Q1 chưa chốt, **cảnh báo F-A4 chỉ nên coi là tín hiệu vận hành, chưa phải căn cứ
  kỹ thuật/pháp lý**. Không dùng để kết luận bảo hành.
- Ngưỡng 55°C sẽ bắt kịch bản (d) của simulator (leo tới 60°C) — demo Gate 0 mở rộng dựa vào
  điều này.
- Mỗi cảnh báo mang theo snapshot ~30 bản ghi trong `payload` jsonb. Với 20 xe demo không
  đáng kể; ở quy mô 300 xe (NF-04) cần xem lại kích thước bảng `alerts`.

## Câu hỏi cần người duyệt xác nhận

- [ ] **Ai là người ký ba con số ngưỡng an toàn?** Đây là câu hỏi kỹ thuật pin, không phải
      câu hỏi phần mềm. Đề nghị đưa vào phụ lục hợp đồng với Tri-Ring/nhà cung cấp pack
      (cùng chỗ với Q1).
- [ ] Ngưỡng sụt áp nên là số VOLT tuyệt đối (hiện tại) hay % dải điện áp theo dòng xe?
- [ ] Cảnh báo nhiệt độ cao có cần kèm hành động tự động nào không (vd nhắc tài xế dừng xe,
      chặn sạc tiếp) — hay chỉ báo tin? Liên quan Q12 (ranh giới can thiệp từ xa) đang MỞ.
