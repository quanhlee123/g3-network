# ADR-006: Chống spam cảnh báo pin theo vòng đời cảnh báo (không dùng khái niệm "chuyến")

Ngày: 2026-07-28 · Người đề xuất: Claude Code (Prompt 06, F-A2)
Người duyệt: **PM** · Ngày duyệt: **2026-07-29** · Trạng thái: **ĐÃ DUYỆT**

> **Cập nhật 2026-07-29 — D-03 ĐÃ CHỐT.** PM quyết định lấy chính quy tắc dưới đây làm
> quyết định **chính thức**, tức là F-A2 **bỏ hẳn** khái niệm "chuyến": chống spam dựa trên
> SOC hồi phục, không dựa trên ranh giới chuyến đi. Vì vậy **không có thay đổi code nào**
> phát sinh từ việc chốt D-03 — phần "khi D-03 được chốt" ở mục Hệ quả không còn phải làm.
> Tiêu đề ADR đã bỏ chữ "TẠM".

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
- ~~**Khi D-03 được chốt**: sửa `dedup_key` sang dạng có mã chuyến…~~ — **không còn áp dụng**:
  D-03 chốt ngày 2026-07-29 là giữ nguyên quy tắc này, `dedup_key` không đổi.
- Biên trễ 5% là con số kỹ thuật chống rung, không phải con số nghiệp vụ; đổi được qua hằng
  `BIEN_TRE_PCT` mà không ảnh hưởng ngưỡng 30/20/10 của PRD.
- Cảnh báo được `resolved` tự động cho `alerts.status` một ý nghĩa vận hành thật (đang nguy
  hiểm / đã qua), có ích cho dashboard CSKH sau này.

## Người duyệt đã xác nhận (2026-07-29, PM)

- [x] Chấp nhận quy tắc này — và lấy làm quyết định **chính thức**, không chỉ tạm thời.
- [x] D-03: **không định nghĩa "chuyến"** cho mục đích chống spam cảnh báo pin. Nếu sau này
      module khác (vd F-A6 hiệu suất vận hành, F-K1 chấm điểm lái xe) cần khái niệm "chuyến"
      thì đó là quyết định riêng của module đó, không kéo F-A2 đi theo.
- [x] Sạc ít rồi đi tiếp mà SOC không vượt ngưỡng + 5%: **không** cảnh báo lại. Lý do: xe vẫn
      đang ở vùng SOC nguy hiểm, cảnh báo cũ vẫn đang mở nên tài xế vẫn đang thấy — bắn thêm
      là spam chứ không thêm thông tin.
