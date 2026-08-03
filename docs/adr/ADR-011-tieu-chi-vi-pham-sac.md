# ADR-011: Tiêu chí gắn cờ vi phạm sạc & ranh giới với chế tài
Ngày: 2026-08-01 · Người đề xuất: Claude Code (Prompt 08.2) · Người duyệt: — · Trạng thái: **Nháp**

## Bối cảnh

F-B3 (sheet 4): "So phiên sạc với chính sách → gắn cờ (ngoài khung giờ; **thường xuyên** >90%
hoặc <20%; sạc nhanh quá mức)". F-B5: cảnh báo tài xế/chủ xe "nêu rõ hành vi & cách khắc phục".
NF-11 đòi bằng chứng bất biến phục vụ đối chiếu hợp đồng bảo hành.

Ba chỗ PRD không đủ để code:

1. **"Thường xuyên" là bao nhiêu lần trong bao lâu?** PRD không cho con số. Gắn cờ ngay lần
   đầu là kết tội oan một hành vi mà chính PRD hàm ý là được phép nếu không lặp lại.
2. **Vi phạm theo tần suất gắn vào đâu?** Nó nói về một GIAI ĐOẠN chứ không phải một phiên.
3. **Gắn cờ xong thì làm gì?** Đây là **Q4** trong DECISION-LOG và đang **MỞ**.

## Quyết định

**1. Hai nhóm tiêu chí, xử lý khác nhau.**

| Loại | Điều kiện | Kết luận ngay? |
|---|---|---|
| `outside_hours` | có phút nào của phiên nằm ngoài khung ToU | Có |
| `overpower` | công suất đỉnh > `max_power_kw` | Có |
| `duration_exceeded` | thời lượng > `max_duration_minutes` | Có |
| `soc_above_max` | SOC cuối > `soc_max_pct` | **Chỉ khi LẶP LẠI** |
| `soc_below_min` | SOC đầu < `soc_min_pct` | **Chỉ khi LẶP LẠI** |

**2. Ngưỡng "thường xuyên" nằm trong CHÍNH SÁCH, mặc định toàn hệ khi không khai.**
Cột `charging_policies.soc_breach_count` / `.soc_breach_window_days`; NULL thì lấy
`VIOLATION_SOC_BREACH_COUNT` (mặc định **3**) và `VIOLATION_SOC_BREACH_WINDOW_DAYS` (**30**).

> ⚠️ **Hai con số mặc định 3 lần / 30 ngày là do tôi đặt, CHƯA được Bảo hành G3 Mobility,
> nhà sản xuất pin, hay Legal thẩm định.** Đây là cùng loại vấn đề với ADR-009 (ngưỡng bất
> thường pin). Tới khi có người ký, kết luận `soc_above_max` / `soc_below_min` chỉ nên dùng
> làm **tín hiệu vận hành để nhắc tài xế**, KHÔNG dùng làm căn cứ từ chối bảo hành.

**3. Mỗi phiên để lại đúng 1 dòng `violation_checks`, kể cả khi sạch.**
Bảng này lưu cờ sự kiện SOC của từng phiên (xét theo đúng version chính sách của phiên đó),
và phép đếm "thường xuyên" cộng chính các cờ ấy trong cửa sổ.

**4. Vi phạm theo tần suất chốt 1 lần / xe / loại / cửa sổ.**

**5. KHÔNG có chế tài tự động — Q4 còn MỞ.** Hệ thống chỉ: ghi bằng chứng bất biến + cảnh
báo. KHÔNG trừ điểm tuân thủ, KHÔNG đổi `vehicles.warranty_state`, KHÔNG tính phí.

**6. Cảnh báo vi phạm không bao giờ dùng severity 3.**

## Lý do & các phương án đã loại

**Về (2).** Phương án "hằng số trong code" đã loại vì ngưỡng này là điều khoản hợp đồng, khác
nhau theo khách hàng; sửa hợp đồng mà phải deploy là sai chỗ. Phương án "chỉ có mặc định toàn
hệ" đã loại vì đội xe chở hàng lạnh và đội chạy tuyến ngắn không thể chung một ngưỡng.

**Về (3).** Phương án gọn hơn là chỉ ghi dòng khi CÓ vi phạm. Đã loại: khi tranh chấp, bên bảo
hành cần chứng minh "phiên này ĐÃ được xét theo chính sách version N và kết luận là đạt".
Không có bảng này thì im lặng bị hiểu thành *chưa kiểm tra*, và cả hồ sơ mất sức thuyết phục.

**Về (4).** Phương án "mỗi phiên vi phạm là một dòng" đã loại: hồ sơ đầy bản sao của cùng một
kết luận, tài xế bị bắn cảnh báo mỗi lần sạc, và vì `violations` append-only nên không dọn
lại được. Cùng nguyên tắc vòng đời cảnh báo của ADR-006.

**Về (5).** Đây là ranh giới CLAUDE.md ("không tự quyết các mục đang MỞ"). Khuyến nghị của
chính PRD cho Q4 là "P1: cảnh báo + hồ sơ; chế tài để hợp đồng quyết — phần mềm chỉ cung cấp
bằng chứng", nên phần đã làm nằm gọn trong khuyến nghị đó và phần chưa làm là phần cần người
quyết. Cùng tiền lệ PM đã duyệt ở ADR-006 và F-I2.

**Về (6).** Severity 3 xuyên thủng rate-limit và bắn SMS (ADR-008) — chỗ đó dành cho nguy hiểm
tính mạng. Vi phạm hợp đồng sạc, dù nặng, vẫn là việc xử lý trong ngày. Đánh đồng hai loại sẽ
làm người nhận quen với chuông báo động, và lần pin thật sự sắp cháy thì họ đã tắt thông báo.

## Hệ quả

- Đổi `VIOLATION_SOC_BREACH_*` **không** hồi tố: các vi phạm đã ghi giữ nguyên (append-only).
  Muốn áp ngưỡng mới cho quá khứ thì chạy `POST /violations/run` với `lam_lai_tat_ca` — và nó
  cũng chỉ thêm vi phạm mới, không xoá cái cũ.
- `violation_checks` lớn tuyến tính theo số phiên sạc. 300 xe × ~1 phiên/ngày ≈ 110k dòng/năm.
- Nhà thầu tiếp nhận: khi Q4 chốt có chế tài, chỗ móc vào là sau `ghiViPham()` trong
  `apps/api/src/modules/violations/detect.ts` — KHÔNG sửa bản ghi vi phạm đã có.

## Còn MỞ — cần người quyết

- **Q4 (MỞ)**: chế tài vi phạm sạc. Chặn phần "xử lý" của F-B3/F-B5/F-B6.
- **Ngưỡng "thường xuyên" 3 lần / 30 ngày**: cần Bảo hành Mobility + nhà sản xuất pin ký
  trước Gate 1, cùng đợt với ba ngưỡng của ADR-009.
- **`outside_hours` gắn cờ khi có BẤT KỲ phút nào ngoài khung**: có nên cho biên độ dung thứ
  (vd bỏ qua nếu ≤5 phút, do tài xế cắm sớm vài phút)? Hiện KHÔNG có biên độ — chặt nhất có
  thể, và số phút cụ thể luôn nằm trong bằng chứng để người duyệt tự cân nhắc.
