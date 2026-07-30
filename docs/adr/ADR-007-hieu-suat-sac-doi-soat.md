# ADR-007: Hiệu suất sạc trong công thức đối soát 3 chiều (NF-10)

Ngày: 2026-07-28 · Người đề xuất: Claude Code (Prompt 06, F-C6)
Người duyệt: **PM** · Ngày duyệt: **2026-07-29** · Trạng thái: **ĐÃ DUYỆT**

> **Cập nhật 2026-07-29 — D-11 ĐÃ CHỐT:** PM chọn phương án **một hệ số toàn hệ**
> (`CHARGE_EFFICIENCY`), giữ `1.0` ở Phase 1 vì simulator sinh dữ liệu lý tưởng, và
> **hiệu chuẩn bằng dữ liệu pilot trước Gate 1**. Không chia hệ số theo dòng xe hay theo
> trạm ở giai đoạn này. Không có thay đổi code phát sinh — công thức đã đúng như vậy.
>
> ⚠️ **Việc còn phải làm là của con người, không phải của code:** đưa bước hiệu chuẩn hệ số
> vào checklist Gate 1. Xem mục "Hệ quả" bên dưới để biết cách đo.

## Bối cảnh

NF-10 yêu cầu đối soát 3 chiều **trụ (OCPP) ↔ xe (telematics) ↔ thanh toán**, sai lệch kWh
phải **< 1%**, lệch hơn thì cảnh báo tự động.

Ba chiều này **không đo cùng một đại lượng vật lý**:

| Chiều | Đo cái gì | Nguồn |
|---|---|---|
| Trụ | Năng lượng **lấy từ lưới**, tại đầu công tơ trụ | `charging_sessions.energy_kwh` (OCPP MeterValues) |
| Xe | Năng lượng **thực sự vào pin**, suy từ ΔSOC × dung lượng pack | `telematics_readings.soc_pct` + `batteries.capacity_kwh` |
| Tiền | Số tiền thu ÷ đơn giá điện | `payment_transactions.amount_vnd` |

Giữa "lấy từ lưới" và "vào pin" luôn có tổn hao: bộ sạc AC/DC, cáp, BMS, làm mát pack. Với
sạc nhanh DC cho xe tải điện, hiệu suất thực tế thường **92–95%** — tức chênh **5–8%**, gấp
5–8 lần ngưỡng 1% của NF-10. Nếu bỏ qua yếu tố này, khi gắn phần cứng thật hệ thống sẽ báo
"lệch" cho **100% số phiên sạc** — báo động giả hàng loạt, và cảnh báo đối soát sẽ bị bỏ qua
đúng lúc cần nó nhất.

## Quyết định

1. Đưa hệ số **hiệu suất sạc** vào công thức chiều xe, quy về đầu công tơ để so sánh cùng
   đại lượng:

   ```
   kwh_xe = (SOC_cuối − SOC_đầu) / 100 × dung_lượng_pin_kWh ÷ HIỆU_SUẤT_SẠC
   ```

2. Hệ số đọc từ biến môi trường **`CHARGE_EFFICIENCY`**, **mặc định `1.0` ở Phase 1**.
   Lý do để 1.0: Phase 1 chạy 100% trên simulator, mà simulator sinh dữ liệu lý tưởng —
   trụ ảo và xe ảo mô phỏng cùng một dòng năng lượng, không có tổn hao. Đặt 0.92 lúc này sẽ
   khiến demo Gate 0 báo lệch ~8.7% (đã có test cố định hành vi này).

3. SOC tại mốc bắt đầu/kết thúc phiên được **nội suy tuyến tính** giữa hai bản ghi telemetry
   gần nhất, không lấy bản ghi gần nhất. Telemetry gửi mỗi ~10s trong khi mốc phiên do trụ
   báo; lấy điểm gần nhất tạo sai số tới ~0.5% SOC mỗi đầu, riêng nó đã ăn gần hết ngưỡng 1%.

4. Bản ghi telemetry cách mốc phiên quá `RECONCILE_SOC_WINDOW_S` (mặc định 60s) → kết luận
   **`thieu_du_lieu`**, KHÔNG phải `lech`, và **không sinh cảnh báo**. Xe mất sóng giữa phiên
   (NF-09) là chuyện bình thường; báo "lệch kWh" trong tình huống đó là vu oan cho trạm sạc.
   Phiên `thieu_du_lieu` được đối soát lại ở các lượt sau, khi dữ liệu đệm đã gửi bù.

## Lý do & các phương án đã loại

- **Bỏ qua hiệu suất, nới ngưỡng NF-10 lên 8%** (loại): NF-10 là ngưỡng đã chốt trong PRD;
  và ngưỡng 8% sẽ che mất đúng loại gian lận/hỏng hóc mà đối soát sinh ra để bắt.
- **Lấy SOC từ `charging_sessions.soc_start_pct/soc_end_pct`** (loại): hai cột đó đến từ
  MeterValues measurand `SoC` của **trụ**, tức vẫn là chiều trụ. Dùng chúng làm "chiều xe"
  là tự đối soát với chính mình — mất hoàn toàn giá trị của việc có 3 nguồn độc lập.
- **Hiệu suất cố định cứng trong code** (loại): hiệu suất phụ thuộc dòng xe, công suất trụ,
  nhiệt độ môi trường; phải hiệu chuẩn được mà không sửa code.

## Hệ quả & việc BẮT BUỘC làm trước Gate 1

- ⚠️ **Trước Gate 1 (pilot 20–30 xe, 2–3 trạm) phải hiệu chuẩn `CHARGE_EFFICIENCY` bằng dữ
  liệu thật.** Cách làm: chạy pilot với đối soát ở chế độ chỉ ghi nhận (không cảnh báo), lấy
  trung vị của `kwh_xe_thô / kwh_trụ` trên ≥100 phiên, đặt làm hệ số. **Nếu bỏ qua bước này,
  tiêu chí Gate 1 ③ "100% phiên sạc ghi nhận & đối soát" sẽ trượt vì báo động giả.**
- Một hệ số toàn hệ là đơn giản hóa. Nếu độ tán sai lệch sau hiệu chuẩn vẫn > 1%, cần hệ số
  **theo dòng xe hoặc theo trạm** — khi đó viết ADR mới, không sửa ADR này.
- Dung lượng pin trong `batteries.capacity_kwh` được coi là dung lượng danh định. Pin chai
  theo SOH sẽ làm ΔSOC ứng với ít kWh hơn thực tế; ở Phase 1 (xe mới, SOH ~100%) bỏ qua được,
  nhưng khi SOH tụt dưới ~95% thì công thức cần nhân thêm SOH — cần theo dõi.
- `simulators/vehicle-sim` dùng bảng dung lượng pin phải KHỚP `packages/db/src/seed.ts`
  (EVT-262 = 105 kWh, EVT-400 = 210, EVT-825 = 420); lệch bảng này là lệch kết quả đối soát.

## Người duyệt đã xác nhận (2026-07-29, PM)

- [x] Đồng ý để `CHARGE_EFFICIENCY = 1.0` ở Phase 1 (simulator).
- [x] Một hệ số **toàn hệ**, không chia theo dòng xe hay theo trạm ở Phase 1. Nếu độ tán sai
      lệch sau hiệu chuẩn pilot vẫn > 1% thì mở ADR mới, **không** sửa ADR này.
- [ ] **CÒN MỞ — ai hiệu chuẩn hệ số trong pilot và đưa vào checklist Gate 1?** Đây là việc
      quy trình/nhân sự, chưa được chỉ định. Vẫn là điều kiện cứng của Gate 1.
- [ ] **CÒN MỞ — đơn giá điện** `CHARGING_PRICE_VND_PER_KWH` (hiện 3.500 ₫/kWh GIẢ) lấy từ
      đâu khi vận hành thật: theo trạm hay theo khung giờ ToU? Liên quan Q3/Q9 DECISION-LOG.
