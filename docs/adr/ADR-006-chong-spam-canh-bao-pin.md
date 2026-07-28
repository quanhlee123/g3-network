# ADR-006: Quy tắc TẠM chống spam cảnh báo pin khi D-03 còn MỞ

Ngày: 2026-07-28 · Người đề xuất: Claude Code (Prompt 06, F-A2) · Người duyệt: (chờ duyệt) · Trạng thái: NHÁP

## Bối cảnh

F-A2 (docs/prd/04-p1-chuc-nang.md) yêu cầu cảnh báo pin phân cấp 30% / 20% / 10% với tiêu chí
chấp nhận: **"chống spam (1 lần/ngưỡng/chuyến)"**.

Vấn đề: **D-03 trong docs/DECISION-LOG.md — "Định nghĩa *chuyến* cho chống spam cảnh báo" —
đang ở trạng thái MỞ**, người quyết là PM + Vận hành. Theo ranh giới trong CLAUDE.md, Claude
Code không được tự quyết mục đang MỞ.

Nhưng tiêu chí **Gate 0 ③** lại bắt buộc luồng end-to-end *"xe giả lập → cảnh báo pin → phiên
sạc giả lập → đối soát"* phải chạy được. Không có F-A2 thì không qua được Gate 0. Trong khi
đó, cảnh báo không chống spam cũng không dùng được: SOC dao động quanh 20.0% sẽ bắn hàng chục
cảnh báo mỗi phút vào điện thoại tài xế — phản tác dụng với mục tiêu an toàn.

Kế hoạch Prompt 06 đã nêu tình huống này; PM chọn phương án "quy tắc tạm + ADR nháp".

## Quyết định

Áp dụng quy tắc chống spam **KHÔNG dựa trên khái niệm "chuyến"**, mà dựa trên vòng đời của
chính cảnh báo:

1. Mỗi cặp (xe, ngưỡng) có tối đa **một cảnh báo đang mở** (`alerts.status <> 'resolved'`,
   `dedup_key = 'F-A2:<vehicle_id>:<ngưỡng>'`).
2. SOC chạm ngưỡng mà cặp đó chưa có cảnh báo mở → **bắn** (`status = 'open'`).
3. SOC hồi lên trên **ngưỡng + 5%** (biên trễ / hysteresis) → cảnh báo được **đóng**
   (`status = 'resolved'`), ngưỡng đó nạp đạn lại cho lần tụt pin sau.
4. Vùng đệm giữa `ngưỡng` và `ngưỡng + 5%`: không bắn, không đóng — SOC rung quanh mốc
   không sinh ra chuỗi cảnh báo.

Trạng thái nằm **hoàn toàn trong bảng `alerts`**, không có bộ nhớ tạm nào là nguồn sự thật:
ingest khởi động lại thì nạp lại trạng thái từ DB (có test cho tình huống này).

Cài đặt: `services/ingest/src/battery-alerts.ts`, chạy ngay trong pipeline ingest nên đáp ứng
"cảnh báo ≤30s khi chạm ngưỡng" mà không cần job quét định kỳ.

## Lý do & các phương án đã loại

- **Chờ D-03 chốt rồi mới làm** (loại): chặn Gate 0 — mốc quan trọng nhất của giai đoạn 1 —
  vì một quyết định về ngữ nghĩa vận hành, trong khi phần lớn giá trị của F-A2 không phụ
  thuộc định nghĩa "chuyến".
- **Tự định nghĩa "chuyến"** (vd: xe dừng >15 phút, hoặc odometer tăng >X km) (loại): đó
  chính là nội dung của D-03. Tự chọn là vượt ranh giới CLAUDE.md, và một định nghĩa sai sẽ
  ăn sâu vào `dedup_key` của dữ liệu cảnh báo, rất tốn công sửa về sau.
- **Chống spam theo cửa sổ thời gian cố định** (vd 1 cảnh báo/ngưỡng/giờ) (loại): xe sạc xong
  đi tiếp và tụt pin lại trong vòng 1 giờ sẽ **không** được cảnh báo — bỏ lọt đúng tình huống
  nguy hiểm. Quy tắc theo SOC hồi phục không có nhược điểm này.

## Hệ quả

- Về hành vi, quy tắc này **trùng với "1 lần/chuyến"** trong hầu hết trường hợp thực tế: giữa
  hai lần tụt pin qua cùng một ngưỡng luôn có một lần sạc, mà sạc thì SOC vượt ngưỡng + 5%.
  Khác biệt chỉ xuất hiện ở chuyến rất dài không sạc giữa chừng (bắn 1 lần, đúng mong muốn)
  và ở trường hợp sạc *rất ít* rồi đi tiếp (quy tắc này sẽ không bắn lại — cần D-03 xác nhận
  đây có phải hành vi mong muốn không).
- **Khi D-03 được chốt**: sửa `dedup_key` sang dạng có mã chuyến và thêm điều kiện "chuyến
  mới" vào `quyetDinhCanhBao`. Hàm này là hàm thuần, có test riêng — phạm vi sửa nhỏ và rõ.
- Biên trễ 5% là con số kỹ thuật chống rung, không phải con số nghiệp vụ; đổi được qua hằng
  `BIEN_TRE_PCT` mà không ảnh hưởng ngưỡng 30/20/10 của PRD.
- Cảnh báo được `resolved` tự động cho `alerts.status` một ý nghĩa vận hành thật (đang nguy
  hiểm / đã qua), có ích cho dashboard CSKH sau này.

## Cần người duyệt xác nhận

- [ ] Chấp nhận quy tắc tạm này cho tới khi D-03 chốt?
- [ ] D-03: định nghĩa "chuyến" là gì? (đầu vào cho bản sửa sau)
- [ ] Sạc ít rồi đi tiếp (SOC không vượt ngưỡng + 5%) thì có nên cảnh báo lại không?
