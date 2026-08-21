# SOW-03 — Thanh toán & Hóa đơn điện tử (production)

> **Gói thầu 3/4** · Điều kiện chung: `standards/INPUT-05-nha-thau.md` trong prompt-kit +
> [CLAUDE.md](../../../CLAUDE.md). Bối cảnh: [system-overview.md](../system-overview.md) ·
> Hiện trạng: [feature-status.md](../feature-status.md).
>
> **Nghiệm thu bằng demo + test chạy trước mặt G3, không nghiệm thu bằng slide.**

## 1. Mục tiêu gói

Đưa vòng tiền từ **sandbox** lên **production**: thu tiền thật cho phiên sạc thật, xuất
hóa đơn điện tử hợp lệ, và giữ được **đối soát 3 chiều lệch <1%** khi kWh không còn đến
từ simulator lý tưởng.

Đây là gói chạm vào **tiền thật** và **nghĩa vụ thuế**. Sai sót ở đây không hiện ra như
một bug — nó hiện ra như thất thoát doanh thu hoặc hóa đơn không hợp lệ.

## 2. Ranh giới an toàn — bắt buộc

- **Không nhà thầu nào giữ bản sao secret production.** Khoá VNPay/Momo production, khoá
  ký hóa đơn điện tử: chỉ nằm trong **secret manager do G3 quản trị**. Phát hiện secret
  trong code, chat hoặc tài liệu → **dừng thanh toán milestone** (chuẩn input mục 4).
- **Không lưu dữ liệu thẻ dưới bất kỳ hình thức nào.** Thiết kế hiện tại đã đúng: người
  dùng nhập thẳng trên trang cổng thanh toán, hệ thống G3 chỉ giữ token. **Giữ nguyên tính
  chất này** — mọi phương án làm hệ thống chạm vào số thẻ đều bị từ chối, kể cả khi "chỉ
  để test".
- Phần sandbox hiện có do Claude Code dựng **cố ý dừng ở sandbox**: `packages/payments`
  có rào chắn kỹ thuật từ chối khởi động nếu URL không phải sandbox. Nhà thầu **gỡ rào chắn
  này là một thay đổi cần ADR được duyệt**, không phải một dòng sửa lặng lẽ.

## 3. Phạm vi công việc

### 3.1 F-H1 — Thanh toán phiên sạc lên production

Hiện trạng: 🟦 **Sandbox**, 32 test. Đã xử lý đúng hai ca khó: **webhook đến 2 lần** và
**webhook đến trước khi phiên đóng** — cả hai đều ra đúng một giao dịch.

Phải làm:

- Ký hợp đồng kỹ thuật với cổng thanh toán, chuyển sang endpoint production.
- Đối soát ngân hàng: khớp giao dịch cổng ↔ `payments` ↔ sao kê.
- **Xử lý ca chưa làm:** "hoạt động khi sóng yếu — giữ phiên, thu sau" (acceptance F-H1
  hiện ❌). Đây là ca thật của tài xế đứng cạnh trụ ở vùng sóng yếu.
- Hoàn tiền / huỷ giao dịch / tranh chấp — chưa có gì trong Phase 1.

### 3.2 F-H3 — Hóa đơn điện tử kWh

Hiện trạng: ⬜ **Chưa làm**.

> ⚠️ **Đính chính quan trọng cho việc báo giá:** `docs/architecture/system-overview.md`
> khai có "E-invoice adapter (interface + mock)" trong `packages/contracts`. **Không có.**
> `packages/contracts/src/` chỉ chứa `telemetry`, `telematics-source`, `ocpp`, `sms`,
> `notifier`, `payment`, `csms-command`. Nhà thầu phải tính công **viết interface từ đầu**,
> không phải "thay mock bằng thật".

Phải làm:

- Viết interface `IEInvoiceProvider` trong `packages/contracts` + **ít nhất một mock chạy
  được** (quy tắc 2 — bắt buộc, không phải tuỳ chọn).
- Tích hợp nhà cung cấp HĐĐT đã chọn ở Q9.
- Hóa đơn hợp lệ theo quy định VN cho khách lẻ + hóa đơn tổng hợp tháng cho đội xe.
- **Khớp với đối soát F-C6**: số kWh trên hóa đơn phải bằng số kWh đã đối soát, không phải
  số đọc thẳng từ trụ.

### 3.3 NF-10 — Hiệu chuẩn đối soát trên dữ liệu thật

Hiện trạng: hệ số `CHARGE_EFFICIENCY` đang để **1.0** vì simulator lý tưởng (D-11, ADR-007).

> Nếu không hiệu chuẩn, **phần cứng thật sẽ báo lệch 5–8% ở 100% số phiên** — nghĩa là
> cảnh báo NF-10 nổ liên tục và trở thành tiếng ồn, đúng lúc nó cần được tin tưởng nhất.

Phải làm: hiệu chuẩn bằng dữ liệu pilot, **trước Gate 1** (đây là điều kiện ghi trong D-11).
Nếu dữ liệu cho thấy một hệ số toàn hệ là không đủ (khác nhau theo dòng xe hoặc theo trạm)
→ **viết ADR đề xuất**, không tự đổi mô hình.

### 3.4 F-H2 — Ví & lịch sử giao dịch (P1.1)

Hiện trạng: ⬜ Chưa làm. Ví nạp trước cho tài xế/đội xe, hạn mức, đội xe trả tập trung,
**đối soát ví khớp phiên sạc**.

## 4. Ngoài phạm vi

F-H4 billing thuê bao SaaS (P1.5, Q3 MỞ) · màn hình app tài xế cho luồng thanh toán
(SOW-04 — **nhưng API phải sẵn sàng cho SOW-04**) · hạ tầng vault (SOW-01).

## 5. Điều kiện tiên quyết & quyết định MỞ

> ✅ **Đã gỡ chặn 2026-08-21 — chặng 1 khởi động được ngay.** [D-14](../../DECISION-LOG.md)
> chốt **tách gói làm 2 chặng**:
>
> - **Chặng 1 — khởi động ngay, KHÔNG chờ Q9:** viết interface `IEInvoiceProvider` trong
>   `packages/contracts` + ít nhất một mock chạy được (quy tắc 2). Interface và mock không
>   phụ thuộc vendor.
> - **Chặng 2 — cắm adapter thật** khi Kế toán Holding chốt vendor ở Q9.
>
> Tiêu chí chọn vendor đã thống nhất thứ tự: (1) **trùng hệ kế toán Holding đang dùng** để
> khỏi đối soát 2 hệ thống · (2) có API + sandbox tử tế · (3) chi phí mỗi hoá đơn.

| Mã | Câu hỏi | Trạng thái |
|---|---|---|
| **Q9** 🟠 | Nhà cung cấp hóa đơn điện tử & luồng kế toán doanh thu điện | **Vẫn MỞ** nhưng **chỉ còn chặn chặng 2** |
| **D-11** 🟠 | Hiệu chuẩn `CHARGE_EFFICIENCY` — ai làm, trên dữ liệu nào | **Giao nhà thầu SOW-02** (người đang cầm dữ liệu pilot), không phải gói này. Vẫn là điều kiện Gate 1 |
| **Q13** 🟠 | Giá điện động theo khung giờ — ai sở hữu biểu giá | **Vẫn MỞ** — chặn cách tính tiền phiên sạc |
| **Q3** ⚪ | Giá gói Standard | F-H4 (ngoài phạm vi gói này) |
| — | Hợp đồng kỹ thuật với cổng thanh toán production | Chặn mục 3.1, không chặn 3.2 |

## 6. Definition of Done

### 6.1 Từ acceptance PRD

- [ ] **F-H1** — luồng **quét → sạc → trả ≤3 bước** (đo trên app thật, phối hợp SOW-04);
      **không lưu thông tin thẻ** trên hệ thống G3, chứng minh bằng rà soát schema + log;
      **hoạt động khi sóng yếu** (giữ phiên, thu sau) — có kịch bản demo ngắt mạng giữa phiên.
- [ ] **F-H3** — hóa đơn **hợp lệ theo quy định VN** cho khách lẻ; hóa đơn tổng hợp tháng cho
      đội xe; **khớp đối soát F-C6** (kWh trên hóa đơn = kWh đã đối soát).
- [ ] **F-C6** — kWh theo khách/phiên **chính xác theo phiên**, khớp 3 chiều trụ–xe–thanh toán.
- [ ] **F-H2** — nạp/rút theo quy định · hạn mức · **đối soát ví khớp phiên sạc**.

### 6.2 Từ ngưỡng NF-xx

- [ ] **NF-10** — sai lệch kWh **<1%** trên **dữ liệu phần cứng thật**, sau khi hiệu chuẩn;
      cảnh báo tự động khi lệch, và **cảnh báo không nổ giả** hàng loạt.
- [ ] **NF-11** — `charging_sessions` và `payments` giữ nguyên tính **append-only**; mọi điều
      chỉnh (hoàn tiền, huỷ) là **bản ghi mới**, không phải UPDATE bản ghi cũ.
- [ ] **NF-05** — secret production **chỉ trong vault do G3 quản trị**; `gitleaks git .`
      sạch trên toàn lịch sử.
- [ ] **NF-17** — đơn vị **VNĐ** và **kWh** đúng ở mọi nơi hiển thị và mọi chứng từ.
- [ ] **NF-18** — test phủ: webhook trễ · webhook 2 lần · webhook sai chữ ký · phiên chưa đóng
      mà tiền đã về · hoàn tiền · mất mạng giữa luồng.

### 6.3 Từ tiêu chí Gate

- [ ] **Gate 1 ③** — **100% phiên sạc** được ghi nhận & đối soát trong pilot.
- [ ] **Gate 1 ④** — **thanh toán sạc end-to-end hoạt động** trong pilot 20–30 xe, 2–3 trạm.
- [ ] **Gate 2 ⑤** — tuân thủ Nghị định 13/2023 với dữ liệu giao dịch của tài xế.
- [ ] Đối soát kế toán: doanh thu điện trên hệ thống **khớp >99%** với sao kê ngân hàng
      (mục tiêu Phase 1: "doanh thu điện đối soát khớp >99%").

### 6.4 Điều kiện chung mọi PR

- [ ] Mã F-xx trong tên nhánh, commit, comment đầu file, mô tả PR. PR >500 dòng phải chia nhỏ.
- [ ] Test đi kèm **trong cùng PR**. Sửa test cũ cho "qua" thay vì sửa code = vi phạm nghiêm trọng.
- [ ] **Interface `packages/contracts` giữ nguyên; mock sandbox và toàn bộ test mock vẫn xanh** —
      CI phải chạy được mà không cần khoá production.
- [ ] Gỡ rào chắn sandbox trong `packages/payments` → **cần ADR được duyệt**.
- [ ] Không secret trong code/chat/tài liệu. Vi phạm → dừng thanh toán milestone.

## 7. Cách nghiệm thu

| Bước | Làm gì |
|---|---|
| 1 | CI và `npm test` xanh **mà không cần khoá production** — chứng minh mock còn nguyên |
| 2 | `npm run demo:tuan8` vẫn chạy đúng trên sandbox |
| 3 | Giao dịch thật số tiền nhỏ, có mặt kế toán G3: trả tiền → biên nhận → hóa đơn điện tử hợp lệ |
| 4 | Bắn lại webhook 2 lần thủ công → vẫn đúng một giao dịch, không double-charge |
| 5 | Ngắt mạng giữa phiên → phiên được giữ, thu sau thành công |
| 6 | Đối soát 20 phiên thật: hệ thống ↔ cổng thanh toán ↔ sao kê ngân hàng, lệch <1% |
| 7 | Đối chiếu từng ô checkbox mục 6 trước mặt G3 |
