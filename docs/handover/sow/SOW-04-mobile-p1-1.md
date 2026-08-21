# SOW-04 — App tài xế (Mobile P1.1)

> **Gói thầu 4/4** · Điều kiện chung: `standards/INPUT-05-nha-thau.md` trong prompt-kit +
> [CLAUDE.md](../../../CLAUDE.md). Bối cảnh: [system-overview.md](../system-overview.md) ·
> Hiện trạng: [feature-status.md](../feature-status.md).
>
> **Nghiệm thu bằng demo + test chạy trước mặt G3, không nghiệm thu bằng slide.**

## 1. Mục tiêu gói

Biến khung app tài xế thành **ứng dụng tài xế dùng được ngoài trời, một tay, dưới nắng**.

Tài xế là người **duy nhất** đứng cạnh xe khi pin cảnh báo và cạnh trụ khi sạc. Không có
app thì F-H1 (thanh toán phiên sạc) và F-I2 (SOS) **không có mặt tiền** — chỉ còn API
(lý do chốt D-01). Nghĩa là gói này là điều kiện để hai tính năng Must của P1.0 có giá trị thật.

## 2. Điểm khởi đầu — đã có sẵn những gì

Hiện trạng F-D4: 🔌 **Interface-only**, 8 file test / **69 test xanh**.

| Đã có | Ở đâu |
|---|---|
| Cấu hình app, đọc từ env | [config.ts](../../../apps/mobile/src/config.ts) |
| Tầng gọi API + xử lý lỗi | [api/client.ts](../../../apps/mobile/src/api/client.ts) |
| Đăng nhập OTP theo số điện thoại | [auth/otp-flow.ts](../../../apps/mobile/src/auth/otp-flow.ts) · [token-storage.ts](../../../apps/mobile/src/auth/token-storage.ts) |
| i18n tiếng Việt | [i18n/vi.ts](../../../apps/mobile/src/i18n/vi.ts) |
| **Bảng 10 màn hình + luật điều hướng** (mặc định TỪ CHỐI khi chưa đăng nhập) | [navigation/routes.ts](../../../apps/mobile/src/navigation/routes.ts) |

**Chưa vẽ màn hình nào.** Bảng `BANG_MAN_HINH` đã khai sẵn 10 màn hình với mã wireframe
SCR-01…SCR-10 và mã PRD tương ứng, để khi wireframe về thì gắn giao diện vào chỗ đã có sẵn.

| Màn hình | Mã PRD | Wireframe |
|---|---|---|
| Đăng nhập | F-D4, F-F1 | SCR-01 |
| Trang chính | F-D4 | SCR-02 |
| Bản đồ trạm sạc | F-D1 | SCR-03 |
| Chi tiết trạm | F-D1, F-C2 | SCR-04 |
| Quét mã trụ sạc | F-H1 | SCR-05 |
| Đang sạc | F-H1, F-C2 | SCR-06 |
| Biên nhận | F-H1, F-H3 | SCR-07 |
| Khẩn cấp (SOS) | F-I2 | SCR-08 |
| Cảnh báo | F-A2, F-F3 | SCR-09 |
| Đồng ý sử dụng dữ liệu | F-F2, F-G4 | SCR-10 |

## 3. Phạm vi công việc

### 3.1 Dựng 10 màn hình P1.0

Theo wireframe của Thiết kế (chuẩn INPUT-03 §2 —
[YEU-CAU-WIREFRAME.md](../../design/YEU-CAU-WIREFRAME.md)). **Giữ nguyên** bảng màn hình và
luật điều hướng đã có; thêm màn hình mới phải cập nhật `BANG_MAN_HINH` kèm mã PRD.

### 3.2 F-D1 / F-D2 — Bản đồ & điều hướng trạm

- **F-D1**: 🟨 backend **đã sẵn sàng** (`GET /stations/map` lọc theo trạng thái, trả toạ độ) —
  phần còn lại là UI.
- **F-D2**: ⬜ chưa có gì.

> ⚠️ **Đính chính quan trọng cho việc báo giá:** `docs/architecture/system-overview.md`
> khai có "Map adapter (interface + mock)" trong `packages/contracts`. **Không có.**
> Nhà thầu phải **viết interface `IMapProvider` từ đầu** + ít nhất một mock chạy được
> (quy tắc 2), rồi mới cắm nhà cung cấp đã chọn ở Q5.

### 3.3 F-A2 — Cảnh báo pin khi app chạy nền

Acceptance F-A2 hiện ❌ ở đúng một điều khoản: *"hoạt động khi app chạy nền"* — chưa kiểm
chứng được vì chưa có app. Cần push nền thật (FCM/APNs), không phải polling.

Kèm theo: **SMS dự phòng cho cảnh báo pin ≤10% khi không có data** (F-F3) hiện chỉ có luật,
chưa gửi được tin nào ra ngoài vì SMS là mock.

### 3.4 F-H1 — Luồng thanh toán ≤3 bước

Quét QR trên trụ → sạc → trả tiền → biên nhận kWh. Acceptance ghi rõ **≤3 bước** và
**hoạt động khi sóng yếu (giữ phiên, thu sau)**. Phối hợp SOW-03 cho phần backend.

### 3.5 F-I2 — SOS

Nút SOS gửi vị trí + SOC + mã lỗi (backend ✅ đã có, 13 test). Cần: nút hiển thị rõ, hoạt
động khi app nền, **fallback gọi hotline** khi không có mạng.

> Lưu ý thiết kế đã cân nhắc: màn SOS **yêu cầu đăng nhập**, vì endpoint `/sos` cần token để
> biết xe nào, tài xế nào. Tài xế chưa đăng nhập mà gặp sự cố thì lối thoát là **gọi hotline** —
> phần đó thuộc D-09/Q6, còn MỞ.

### 3.6 Tính năng P1.1 của module D

- **F-D3 Range-aware** — cảnh báo nếu SOC không đủ tới trạm đã chọn, gợi ý trạm trong tầm với.
- **F-D5 Chế độ offline** — cache SOC + bản đồ trạm đã tải + **timestamp**, hàng đợi thao tác
  đồng bộ khi có sóng.

### 3.7 F-F2 / NF-08 — Màn hình đồng ý dữ liệu

SCR-10. Văn bản đồng ý hiện tự khai là **BẢN NHÁP** vì Q7 chưa chốt. Nhà thầu dựng luồng;
**nội dung pháp lý do Legal cấp**, không tự viết.

## 4. Ngoài phạm vi

Portal đội xe (đã ✅ ở F-E1) · backend thanh toán (SOW-03) · adapter phần cứng (SOW-02) ·
soạn nội dung pháp lý cho consent (Legal) · vẽ wireframe (Thiết kế, chuẩn INPUT-03).

## 5. Điều kiện tiên quyết & quyết định MỞ

> ✅ **Đã gỡ chặn 2026-08-21 — gói khởi động được.** [D-15](../../DECISION-LOG.md) chốt: xin
> Thiết kế nộp trước **3 màn ưu tiên** làm chuẩn phong cách, **7 màn còn lại nhà thầu SOW-04
> vẽ theo**, G3 duyệt từng màn theo ràng buộc NF-12/NF-13.
>
> | Nộp trước từ Thiết kế | Nhà thầu vẽ, G3 duyệt |
> |---|---|
> | SCR-02 màn chính ba con số lớn · SCR-05 luồng QR 3 bước · SCR-08 SOS | SCR-01, 03, 04, 06, 07, 09, 10 |
>
> **Q5 không chặn P1.0.** Acceptance F-D2 ghi rõ *"mở điều hướng (in-app **hoặc
> Google/VietMap**)"* — P1.0 bung app bản đồ ngoài là đạt, không cần SDK. SDK chỉ cần cho
> F-D1 (hiện bản đồ trạm) và F-D3 (range-aware, P1.1). Nhà thầu **vẫn phải viết interface
> `IMapProvider` + mock** trong `packages/contracts` (quy tắc 2) để sau này cắm vendor nào cũng được.

| Mã | Nội dung | Trạng thái |
|---|---|---|
| ~~Wireframe~~ | ✅ Hết chặn qua D-15 — 3 màn ưu tiên + nhà thầu vẽ tiếp | Cần Thiết kế nộp 3 màn để khởi động |
| **Q5** 🟠 | Nhà cung cấp bản đồ: VietMap / Google / Mapbox | **Vẫn MỞ** nhưng **không chặn P1.0**; chặn F-D1 phần SDK và F-D3 (P1.1). Đo trong pilot theo khuyến nghị PRD |
| **Q7** 🟠 | Consent & chính sách dữ liệu tài xế (Nghị định 13/2023) | **Vẫn MỞ** — chặn nội dung chữ của SCR-10. Luồng thì dựng được, **câu chữ do Legal cấp** |
| **Q6 / D-09** 🟠 | Ai trực CSKH & cứu hộ 24/7; định hướng module I | **Vẫn MỞ** — chặn F-I2 fallback hotline và cam kết "gọi lại ≤5 phút" |
| **D-01** ✅ | Có app tài xế ở P1 — **ĐÃ CHỐT = CÓ** | (đã gỡ chặn, ⚠️ chờ BLĐ phê chuẩn hình thức) |

**Bốn câu hỏi thiết kế đang chờ trả lời** (nêu ở cuối [YEU-CAU-WIREFRAME.md](../../design/YEU-CAU-WIREFRAME.md)),
nhà thầu nên hỏi lại trước khi vẽ 7 màn của mình:

1. **km còn lại** hiện số trần hay kèm khoảng tin cậy (`≈120 km`)? Số trần dễ đọc nhưng dễ bị
   hiểu là cam kết.
2. Khi **mất sóng**, ba con số hiện giá trị cache kèm nhãn "số liệu lúc HH:mm", hay ẩn hẳn?
3. Nút **SOS** đặt floating hay trong thanh dưới? Floating luôn thấy nhưng che nội dung.
4. Nếu **không trạm nào còn trống** trong bán kính hợp lý thì hiện gì?

## 6. Definition of Done

### 6.1 Từ acceptance PRD

- [ ] **F-D4** — đăng nhập theo tài khoản tài xế · **dùng tốt ngoài trời** · **tiếng Việt** ·
      chạy trên iOS và Android.
- [ ] **F-D1** — hiện trạm gần vị trí · lọc theo trạng thái khả dụng/công suất/chuẩn · chi tiết trạm.
- [ ] **F-D2** — mở điều hướng tới trạm (in-app hoặc Google/VietMap) · **ưu tiên trạm còn trống**.
- [ ] **F-D3** — tính khả năng tới đích theo SOC & quãng đường; gợi ý trạm trong tầm với.
- [ ] **F-D5** — cache dữ liệu gần nhất **kèm timestamp** · hàng đợi thao tác đồng bộ khi có sóng.
- [ ] **F-A2** — cảnh báo ≤30s khi chạm ngưỡng · kèm khoảng cách & nút điều hướng ·
      **hoạt động khi app chạy nền** · chống spam 1 lần/ngưỡng.
- [ ] **F-H1** — luồng quét → sạc → trả **≤3 bước** · biên nhận kWh · hoạt động khi sóng yếu.
- [ ] **F-I2** — nút CSKH hiển thị · **hoạt động khi app nền** · **fallback gọi hotline** ·
      quy trình gọi lại ≤5 phút (phần người: phụ thuộc Q6).
- [ ] **F-F3** — cấu hình kênh & ngưỡng · lịch sử thông báo · **SMS dự phòng cho pin ≤10%
      khi không có data**.

### 6.2 Từ ngưỡng NF-xx

- [ ] **NF-12** — chữ lớn, tương phản cao, **thao tác một tay**, **tác vụ chính ≤3 chạm**.
      Nghiệm thu bằng **người thật thao tác ngoài nắng**, không bằng ảnh chụp màn hình.
- [ ] **NF-13** — chạy đúng trên **Android 10+** (ưu tiên **Android tầm trung**, không phải
      máy flagship của lập trình viên) và **iOS 15+**.
- [ ] **NF-17** — tiếng Việt mặc định · đơn vị **VNĐ, km, kWh** đúng ở mọi màn hình.
- [ ] **NF-08** — luồng consent theo Nghị định 13/2023: tài xế **biết mình bị giám sát vì mục
      đích gì**; thu thập tối thiểu.
- [ ] **NF-09** — app dùng được ở vùng sóng yếu: hiện dữ liệu cache **kèm thời điểm**, không
      hiện số cũ như thể là số mới.

### 6.3 Từ tiêu chí Gate

- [ ] **Gate 1 ④** — thanh toán sạc **end-to-end** hoạt động trên app thật trong pilot.
- [ ] **Gate 1 ⑥** — **CSAT tài xế pilot ≥75%** sau 4–6 tuần với 20–30 xe.
- [ ] Mục tiêu Phase 1 "Kích hoạt & giữ chân": onboarding **≤5 phút** · kích hoạt **≥80%** ·
      tài xế dùng hàng tuần **≥70%**.

### 6.4 Điều kiện chung mọi PR

- [ ] Mã F-xx trong tên nhánh, commit, comment đầu file, mô tả PR. PR >500 dòng phải chia nhỏ.
- [ ] **Ảnh chụp màn hình bắt buộc** trong mô tả PR khi có thay đổi UI.
- [ ] Test đi kèm **trong cùng PR**. Sửa test cũ cho "qua" thay vì sửa code = vi phạm nghiêm trọng.
- [ ] Màn hình mới → cập nhật `BANG_MAN_HINH` kèm mã PRD và mã wireframe.
- [ ] Gọi API **qua tầng `src/api/`**, không `fetch` rải trong component (quy tắc 2).
- [ ] Dữ liệu **giả 100%**: không SĐT thật, không VIN thật trong ảnh chụp màn hình hay demo.

## 7. Cách nghiệm thu

| Bước | Làm gì |
|---|---|
| 1 | `npm test -w apps/mobile` xanh; toàn bộ `npm test` của repo vẫn xanh |
| 2 | Cài app lên **máy Android tầm trung**, mang **ra ngoài nắng**, một người chưa từng dùng thao tác |
| 3 | Đếm số chạm cho 3 tác vụ chính: xem SOC · tìm trạm & điều hướng · quét QR trả tiền — **mỗi tác vụ ≤3 chạm** |
| 4 | Tắt màn hình / để app chạy nền → hạ SOC xuống 20% bằng simulator → **cảnh báo phải tới** |
| 5 | Bật chế độ máy bay → app vẫn hiện SOC cache **kèm thời điểm**; bấm SOS → fallback gọi hotline |
| 6 | Chạy đủ luồng thanh toán trên sandbox: quét → sạc → trả → biên nhận |
| 7 | Đối chiếu từng ô checkbox mục 6 trước mặt G3 |
