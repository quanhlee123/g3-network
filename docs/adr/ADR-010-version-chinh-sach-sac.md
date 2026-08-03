# ADR-010: Cách đánh version chính sách sạc & thứ tự ưu tiên phạm vi
Ngày: 2026-08-01 · Người đề xuất: Claude Code (Prompt 08.1) · Người duyệt: — · Trạng thái: **Nháp**

## Bối cảnh

F-B1 (sheet 4) yêu cầu chính sách sạc bảo hành "cấu hình theo xe/đội/dòng; hiệu lực ngay;
lưu phiên bản chính sách (audit)". F-B3 dùng chính sách đó để gắn cờ vi phạm, và NF-11 đòi
bằng chứng vi phạm phải BẤT BIẾN vì nó là căn cứ đối chiếu hợp đồng bảo hành 500.000km/5 năm.

Hai câu hỏi PRD không trả lời, mà không trả lời thì không code được:

1. **Sửa chính sách là sửa cái gì?** Nếu UPDATE đè lên dòng cũ thì mọi kết luận vi phạm đã
   ghi theo ngưỡng cũ không còn tái dựng được — đúng thứ mà tranh chấp bảo hành cần.
2. **Một xe khớp nhiều chính sách thì theo cái nào?** Sheet 8 cho phép phạm vi xe / đội /
   dòng xe cùng tồn tại, nên một xe EVT-262 của đội A có thể khớp cả ba.

Thêm một chỗ PRD im lặng: khung giờ ToU ghi trong hợp đồng là **giờ Việt Nam**, còn
`timestamptz` trong PostgreSQL là UTC. Lệch 7 tiếng là gắn cờ sai gần như toàn bộ phiên đêm.

## Quyết định

**1. Tạo version mới là INSERT THUẦN — không đụng dòng cũ.**
`version` tăng 1 mỗi lần, `effective_from` của version N+1 phải muộn hơn version N và chính nó
đóng hiệu lực version N. Không có UPDATE trên đường ban hành chính sách. Cột `effective_to`
chỉ dùng khi **ngừng hẳn** một mã chính sách (không có version kế tiếp), và chỉ đặt được trên
version mới nhất. Trigger ở migration 0024 chặn mọi UPDATE nội dung và mọi DELETE.

**2. "Chính sách hiệu lực tại thời điểm T" tính theo hai bước, không gộp:**
- B1: với TỪNG mã chính sách khớp phạm vi, lấy version có `effective_from` lớn nhất mà ≤ T.
- B2: bỏ version đã ngừng hẳn tại T, rồi chọn phạm vi **hẹp nhất**.

Gộp một bước sẽ sai ở đúng ca này: mã chính sách đã ngừng ở v2, mà v1 vẫn có `effective_to`
NULL → truy vấn một bước tụt về v1, tức chính sách đã bỏ sống lại.

**3. Thứ tự ưu tiên phạm vi: xe > đội > dòng xe.** Cùng mức thì `effective_from` muộn hơn
thắng, rồi tới `version` lớn hơn.

**4. Version mới KẾ THỪA ngưỡng của version trước; muốn bỏ một giới hạn phải gửi `null`.**

**5. Khung giờ ToU hiểu theo múi giờ `APP_TIMEZONE`, mặc định `Asia/Ho_Chi_Minh`.**

## Lý do & các phương án đã loại

**Về (1).** Phương án "UPDATE `effective_to` của dòng cũ khi ban hành version mới" là cách
làm quen thuộc, đã loại vì hai lý do: (a) nó đưa UPDATE vào đường đi thường ngày của bảng
mang giá trị pháp lý, nên trigger bảo vệ phải nới ra đủ rộng để lọt cả sửa nhầm; (b) nó cần
transaction bao hai câu lệnh, trong khi INSERT thuần thì một câu là xong và không có trạng
thái nửa vời khi tiến trình chết giữa chừng.

**Về (3).** Phạm vi hẹp hơn luôn là ngoại lệ được ký riêng cho xe/đội đó (vd xe chở hàng lạnh
được phép sạc ngoài khung giờ), nên nó phải thắng quy định chung của cả dòng xe. Thứ tự
ngược lại sẽ khiến ngoại lệ ký riêng không bao giờ có hiệu lực.

**Về (4).** Phương án "bỏ trống = bỏ giới hạn" gọn hơn nhưng hỏng thầm lặng: người soạn
chính sách thường chỉ muốn siết đúng một con số ("SOC max 90 → 80"), và nếu bỏ trống nghĩa là
xoá thì thao tác đó lặng lẽ gỡ luôn khung giờ ToU và trần công suất — **nới lỏng** điều kiện
bảo hành mà không ai chủ ý. Sai theo hướng nới lỏng nguy hiểm hơn sai theo hướng siết chặt,
vì nó chỉ lộ ra khi tranh chấp đã xảy ra.

**Về (5).** Phương án "mỗi chính sách mang múi giờ riêng" linh hoạt hơn, đã hoãn: Phase 1 chỉ
chạy trong nước, thêm cột giờ chỉ tạo thêm chỗ để cấu hình sai. Khi mở GMS (Lào, Trung —
NF-17) thì thêm cột `timezone` vào một version mới, không phá vỡ dữ liệu cũ.

## Hệ quả

- Bảng `charging_policies` chỉ lớn thêm, không bao giờ nhỏ đi. Với vài chục mã chính sách và
  vài lần đổi mỗi năm thì không đáng kể so với giá trị đối chiếu 5 năm (NF-16).
- Sửa nhầm một version vừa ban hành **không sửa lại được** — phải ban hành version kế tiếp,
  và chuỗi sai → sửa nằm nguyên trong lịch sử. Đây là chủ ý, không phải hạn chế.
- Đổi phạm vi (xe → đội) không làm được bằng version mới; phải tạo mã chính sách khác. Chính
  sách đổi phạm vi thực chất là chính sách khác.
- Nhà thầu tiếp nhận: mọi đường ghi chính sách đi qua `POST /charging-policies*`;
  không có PATCH/PUT/DELETE và không nên thêm.

## Còn MỞ — cần người quyết

- **Q4 (DECISION-LOG) vẫn MỞ**: chính sách xử lý vi phạm sạc là "chỉ cảnh báo" hay "có chế
  tài". ADR này chỉ định nghĩa *chính sách là gì* và *version nào áp cho phiên nào*; phần chế
  tài (giảm quyền lợi, tính phí) KHÔNG được cài đặt — xem F-B3/F-B5 ở Prompt 08.2.
- **Múi giờ khi mở rộng GMS**: xem mục (5) ở trên.
