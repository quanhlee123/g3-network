# SOW-02 — Tích hợp phần cứng (telematics Tri-Ring & trụ sạc OCPP)

> **Gói thầu 2/4** · Điều kiện chung: `standards/INPUT-05-nha-thau.md` trong prompt-kit +
> [CLAUDE.md](../../../CLAUDE.md). Bối cảnh: [system-overview.md](../system-overview.md) ·
> Hiện trạng: [feature-status.md](../feature-status.md).
>
> **Nghiệm thu bằng demo + test chạy trước mặt G3, không nghiệm thu bằng slide.**

## 1. Mục tiêu gói

Thay thiết bị **giả lập** bằng thiết bị **thật** — xe Tri-Ring và trụ sạc OCPP — mà
**không phá vỡ** kiến trúc hiện có và **không làm đỏ** một test mock nào.

Đây là gói có rủi ro cao nhất: nó là điều kiện của Gate 1, và nó phụ thuộc vào những câu
hỏi kỹ thuật với Tri-Ring hiện **vẫn chưa có câu trả lời**.

## 2. Ràng buộc cứng — đọc trước khi báo giá

**Interface trong `packages/contracts` phải giữ nguyên.** Cụ thể:

- `ITelematicsSource` ([telematics-source.ts](../../../packages/contracts/src/telematics-source.ts))
  — adapter thật là **một cài đặt mới** của interface này, không phải sửa interface.
- OCPP transport ([ocpp.ts](../../../packages/contracts/src/ocpp.ts)) — tương tự.
- `MockTelematicsSource` và `MockChargePointTransport` **phải tiếp tục chạy được** và
  **toàn bộ test mock phải tiếp tục xanh** sau khi có adapter thật (test hồi quy —
  chuẩn input mục 5).
- Chuyển mock ↔ thật bằng biến môi trường, qua `resolveProviderKind()` đã có sẵn. Giá trị
  `'real'` chỉ hợp lệ khi **có ADR được duyệt**.

Lý do: `npm run demo:gate0` và toàn bộ CI phải chạy được trên máy không có phần cứng.
Một nhà thầu làm hỏng điều này là làm hỏng khả năng phát triển của mọi người khác.

## 3. Phạm vi công việc

### 3.1 F-G1 — Adapter telematics Tri-Ring thật

Hiện trạng: 🔌 **Interface-only**. Pipeline ingest chạy đầy đủ trên mock (94 test), gồm
validate, quarantine bản tin bẩn, phát hiện lệch đồng hồ, ép múi giờ tường minh.
Adapter thật **chưa có dòng nào**.

Phải làm:

- Cài đặt `ITelematicsSource` cho thiết bị thật theo đúng giao thức Tri-Ring chốt ở TR-02.
- Ánh xạ trường dữ liệu thật → schema `telematics_readings`, **tăng `schema_version`**
  bằng migration mới (không sửa migration cũ đã merge — quy tắc 8, 9).
- Giữ nguyên đường quarantine: bản tin sai định dạng hoặc thiếu múi giờ vẫn phải vào
  `telemetry_quarantine`, không được im lặng bỏ qua.

> ⚠️ **Hai rủi ro đã được phòng vệ sẵn trong mã — đừng gỡ ra:**
> **TR-01 chốt WGS-84** (GCJ-02 lệch 100–700 m tại VN → geofence và gợi ý trạm sai đều mà
> không có dấu hiệu). Cột `devices.he_toa_do` (migration 0029) để kiểm chứng **từng thiết bị**.
> **TR-03 chốt giờ vận hành GMT+7**, bản tin phải mang múi giờ tường minh — sai 1 giờ là
> **gắn cờ vi phạm bảo hành oan** toàn bộ phiên sạc đêm.

### 3.2 F-G2 — Nghiệm thu trụ sạc OCPP thật

Hiện trạng: ✅ **Hoàn thành trên mock**. CSMS 1.6J tự xây (WebSocket), chạy đúng với
`ocpp-sim`. Chưa từng nói chuyện với trụ thật.

Phải làm:

- Nghiệm thu CSMS với **trụ thật của nhà cung cấp đã mua sắm**, đủ chu trình:
  BootNotification → StatusNotification → StartTransaction → MeterValues → StopTransaction.
- Xử lý sai lệch thực tế giữa các hãng trụ (chuỗi trạng thái, đơn vị MeterValues, mất kết nối
  giữa phiên) — bằng adapter, **không** bằng `if` rải trong logic nghiệp vụ.
- Bộ test nghiệm thu trụ dùng lại được cho mỗi lô trụ mua sau.

### 3.3 F-F2 — Provisioning trên thiết bị thật

Hiện trạng: ✅ trên mock (quy trình theo VIN, checklist bàn giao in được, không chốt được
khi chưa có telemetry). Tỷ lệ ≥98% **không đo được** vì chưa có thiết bị thật.

Phải làm: chạy quy trình trên thiết bị thật, đo tỷ lệ thành công, xử lý các ca hỏng
(SIM chưa kích hoạt, sai VIN, thiết bị im lặng sau lắp).

### 3.4 F-D5 / NF-09 — Bộ đệm offline thật

Xác nhận TR-05 rồi cài đặt store-and-forward **≥48 giờ** ở phía thiết bị; xử lý kịch bản
**gửi bù hàng loạt** (nhiều xe cùng đẩy 48 giờ dữ liệu về một lúc). Kèm sửa mục **N-08**:
buffer hiện **không có giới hạn dung lượng** và mốc 48h **chưa được test**.

## 4. Ngoài phạm vi

Thanh toán production (SOW-03) · màn hình app tài xế (SOW-04) · vault/mTLS hạ tầng (SOW-01,
nhưng **định danh thiết bị NF-06 phải phối hợp chặt** với gói này) · mua sắm phần cứng.

## 5. Điều kiện tiên quyết

> ✅ **Đã gỡ chặn phần lớn 2026-08-21.** [D-13](../../DECISION-LOG.md) chốt **G3 tự chọn
> T-BOX**, không dùng K4-E của Tri-Ring. Hệ quả: **TR-02, TR-04, TR-05 không còn là câu hỏi
> chờ Tri-Ring trả lời** — chúng trở thành **tiêu chí chọn thiết bị** trong hồ sơ mời thầu,
> tức G3 tự quyết. Bốn yêu cầu bắt buộc để dán thẳng vào đặc tả mua sắm nằm ở
> [tri-ring-tbox.md §3.0](../../integrations/tri-ring-tbox.md).

| Mã | Câu hỏi | Trạng thái |
|---|---|---|
| **File DBC** 🔴 | Bảng giải mã CAN của xe (dự kiến 8/2026, chú thích tiếng Trung, **cần bản dịch**) | **CÒN CHẶN** — không có DBC thì không đọc được CAN, **dù dùng T-BOX nào**. Đây mới là phần còn lại của Q1 và của tiêu chí **Gate 0 ①** |
| ~~TR-02~~ giao thức lên server | ✅ Hết chặn qua D-13 — G3 chọn thiết bị nên chọn luôn giao thức | Vẫn phải nới `payload` sang `string \| Uint8Array` nếu thiết bị trúng thầu nói nhị phân |
| ~~TR-04~~ server tại VN | ✅ Hết chặn qua D-13 + **D-16** (hạ tầng đã chốt đặt tại VN) | Thành **yêu cầu bắt buộc #4** trong hồ sơ mời thầu |
| ~~TR-05~~ đệm offline ≥48h | ✅ Hết chặn qua D-13 | Thành **yêu cầu bắt buộc #3**; nghiệm thu bằng **bench test**, không bằng lời hứa nhà cung cấp |
| **Q8** 🟠 | OCPP chỉ 1.6J hay bắt buộc trụ nâng cấp được 2.0.1? | **Vẫn MỞ** — điều khoản mua sắm trụ |
| **Q2** 🟠 | Ai vận hành CSMS: G3 Network hay G3 Energy thuê ngoài? | **Vẫn MỞ** — quyết định ai sở hữu mã nguồn CSMS |

**Việc phát sinh từ D-13 và D-16 mà nhà thầu phải tính công:**

- Hồ sơ mời thầu T-BOX phải yêu cầu thiết bị **nạp được chứng chỉ client** — không có điều
  khoản này thì NF-06 (mTLS theo thiết bị) không thực hiện được dù backend đã sẵn sàng.
- Quy trình cấp chứng chỉ nối vào luồng **provisioning theo VIN (F-F2)**: kích hoạt thiết bị
  cấp luôn chứng chỉ, thu hồi thiết bị revoke luôn. Phối hợp với SOW-01.
- Lấy **văn bản chính thức** từ Tri-Ring xác nhận lắp T-BOX bên thứ ba không ảnh hưởng bảo
  hành xe & pin — hiện mới có xác nhận qua chat.

> **Nếu file DBC trễ:** PRD sheet 13 có **phương án B — gateway OBD bên thứ ba**. Nhà thầu nên
> báo giá **hai phương án** hoặc nêu rõ giả định đang dùng.

## 6. Definition of Done

### 6.1 Từ acceptance PRD

- [ ] **F-G1** — nhận đủ trường lõi từ thiết bị thật; môi trường test/mock **vẫn chạy song song**.
- [ ] **F-A1** — cập nhật ≤30s (p95) khi xe online · cờ online/offline đúng · `schema_version`
      tăng đúng qua migration mới.
- [ ] **F-G2** — trạng thái & phiên sạc realtime từ trụ thật; bộ test nghiệm thu trụ theo chuẩn
      chạy được và tái sử dụng cho lô sau.
- [ ] **F-C2** — trạng thái súng Available/Charging/Faulted **chính xác ≥99%**, đo trên trụ thật.
- [ ] **F-F2** — provisioning theo VIN với thiết bị thật, **tỷ lệ thành công ≥98%**.
- [ ] **F-J1 / F-J3** — với thiết bị thật, hệ vẫn **phân biệt được mất nguồn đột ngột với mất sóng**.

### 6.2 Từ ngưỡng NF-xx

- [ ] **NF-01** — độ trễ telematics ≤30s p95 (mục tiêu ≤10s) trên **thiết bị thật**, đo bằng
      timestamp thiết bị so với lúc ingest.
- [ ] **NF-02** — độ trễ trạng thái trụ ≤30s, đo **dưới tải và trải đều cả lượt chạy**
      (phụ thuộc N-09 của SOW-01 đã sửa).
- [ ] **NF-09** — store-and-forward **≥48 giờ**, **không mất bản ghi**; kịch bản gửi bù hàng loạt
      không làm sập ingest.
- [ ] **NF-16** — `schema_version` tăng đúng, **tương thích ngược**: dữ liệu v1 cũ vẫn đọc được.
- [ ] **NF-06** — mỗi thiết bị thật có định danh riêng, thu hồi được (phối hợp SOW-01).
- [ ] **NF-04** — 300 xe **thật hoặc hỗn hợp** không đổi kiến trúc.

### 6.3 Từ tiêu chí Gate

- [ ] **Gate 0 ①** — đặc tả telematics Tri-Ring **được ký xác nhận** (trường dữ liệu, tần suất,
      giao thức, môi trường test).
- [ ] **Gate 0 ②** — trụ sạc mua sắm có điều khoản **OCPP 1.6J bắt buộc**.
- [ ] **Gate 1 ①** — provisioning **≥95%** trong pilot 20–30 xe, 4–6 tuần.
- [ ] **Gate 1 ②** — độ trễ dữ liệu **≤30s (p95)** suốt pilot.
- [ ] **Gate 1 ③** — **100% phiên sạc** được ghi nhận & đối soát.
- [ ] **Gate 1 ⑤** — **0 sự cố mất dữ liệu nghiêm trọng** trong pilot.

### 6.4 Điều kiện chung mọi PR

- [ ] Mã F-xx trong tên nhánh, commit, comment đầu file, mô tả PR. PR >500 dòng phải chia nhỏ.
- [ ] Test đi kèm **trong cùng PR**. Sửa test cũ cho "qua" thay vì sửa code = vi phạm nghiêm trọng.
- [ ] **Interface `packages/contracts` giữ nguyên; simulator và toàn bộ test mock vẫn xanh.**
- [ ] Đổi schema = **migration mới**, không sửa migration đã merge (quy tắc 8, 9).
- [ ] Thay đổi kiến trúc → ADR được duyệt trước khi code.
- [ ] Dữ liệu test vẫn là dữ liệu **giả**: không VIN thật của khách hàng thật vào môi trường dev.

## 7. Cách nghiệm thu

| Bước | Làm gì |
|---|---|
| 1 | Trên máy **không có phần cứng**: `npm run demo:gate0` và `npm test` vẫn xanh (chứng minh mock không bị phá) |
| 2 | Trên bàn có **thiết bị thật**: lắp 1 thiết bị → provisioning tới tick xanh → dữ liệu chảy → cảnh báo pin bắn đúng ngưỡng |
| 3 | Rút nguồn thiết bị → hệ báo **"nghi tháo thiết bị"**, không phải "mất sóng" |
| 4 | Trụ thật: chạy trọn một phiên sạc → vào `charging_sessions` → đối soát 3 chiều khớp <1% |
| 5 | Ngắt mạng thiết bị 48 giờ → nối lại → **không mất bản ghi nào** |
| 6 | Đối chiếu từng ô checkbox mục 6 trước mặt G3 |
