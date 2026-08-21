# Tích hợp telematics Tri-Ring (T-BOX trên xe) — trạng thái dữ liệu đầu vào

> **Nguồn:** "Tổng hợp thông tin kỹ thuật — Trao đổi với Tri-Ring (Trung Quốc)", trao đổi
> 21/07/2026 – 31/07/2026, nhóm chat *G3-TriRing : FMS越南车队系统建设*.
> Người trả lời: 张成 (Zhang Cheng) — kỹ thuật; điều phối: Jason 吴.
>
> Tài liệu này **không thay PRD**. Nó ghi lại dữ kiện phần cứng/giao thức để đối chiếu với
> code, và nêu rõ chỗ nào đang **chặn** thiết kế.

## 1. Đã xác nhận — dùng được để thiết kế

| Hạng mục | Giá trị | Ảnh hưởng tới code |
|---|---|---|
| Cổng chờ T-BOX | AMP 174917-2, trong cabin phía ghế phụ | — (phần cứng) |
| CAN | 01 kênh, 500 kbps, J1939 | — (phần cứng) |
| Nguồn | 24V, có nguồn thường trực + nguồn wake-up | Liên quan F-J3 (xem §3) |
| Chuẩn dữ liệu | **GB/T 32960-2016** | Bộ trường rộng hơn schema hiện tại — xem §4 |
| SOH | Có, phát trên CAN tổng thành xe | Đã có cột `batteries.soh_pct` |
| Điện áp cell | Gửi **TỪNG cell** | Chưa lưu — xem §4 |
| Nhiệt độ cell | **Chỉ theo điểm lấy mẫu**, vài cell chung 1 điểm đo | Không được giả định "mỗi cell 1 nhiệt độ" |
| Cảnh báo BMS | **3 cấp** kèm mã lỗi | Khớp `alerts.severity` 1–3 của ta |
| Điện trở cách điện | Có (MΩ) | Chưa lưu — tín hiệu an toàn cho F-A4 |
| Hành vi khi sạc | Cắm sạc **đánh thức VCU**; CAN vẫn phát kể cả khi tắt khoá điện | Xác nhận chân "xe" của đối soát 3 chiều F-C6 là khả thi |
| Bảo hành | Lắp T-BOX bên thứ ba **không ảnh hưởng** bảo hành xe & pin | Cần văn bản chính thức (khuyến nghị của tài liệu) |

**Điểm đáng chú ý cho F-C6:** Tri-Ring khẳng định có thể ghi trọn một phiên sạc (SOC
đầu/cuối, điện áp/dòng sạc, kWh, sự kiện bắt đầu–kết thúc) **qua T-BOX trên xe, không bắt
buộc lấy từ trụ**. Điều này *củng cố* đối soát 3 chiều chứ không thay thế nó — vẫn cần
chân "trụ" và chân "thanh toán" để phát hiện lệch.

## 2. Năm câu hỏi kỹ thuật — TẤT CẢ đã hết chặn (2026-08-21)

> **D-13 chốt: G3 TỰ CHỌN T-BOX, không dùng K4-E.** Đây là câu trả lời cho mục 5 phần "Việc
> tiếp theo" ở cuối tài liệu này, và nó gỡ nốt TR-02/TR-04/TR-05: khi G3 chọn thiết bị thì ba
> câu đó không còn là câu hỏi cho Tri-Ring nữa — chúng là **tiêu chí chọn thiết bị**, dùng
> đúng bốn yêu cầu bắt buộc ở §3.0 dưới đây.
>
> ⚠️ **Thứ còn chặn thật KHÔNG nằm trong bảng này: file DBC.** Không có DBC thì không đọc được
> CAN của xe, dù dùng T-BOX nào. Đây mới là phần còn lại của Q1 và của tiêu chí **Gate 0 ①**.

| # | Câu hỏi | Vì sao chặn | Trạng thái |
|---|---|---|---|
| TR-01 | **Hệ toạ độ GPS: WGS-84 hay GCJ-02?** | GCJ-02 lệch **100–700 m** tại Việt Nam | ✅ **CHỐT = WGS-84** (§3.1) — phía G3 chọn hệ GPS |
| TR-02 | **Giao thức truyền lên server: GB/T 32960 hay MQTT/JSON?** | Quyết định hình dạng adapter ingest. Xem §5. | ✅ **HẾT CHẶN** qua D-13 — G3 chọn thiết bị nên chọn luôn giao thức |
| TR-03 | **Timestamp có phải UTC không?** | TQ là UTC+8, VN UTC+7 | ✅ **CHỐT = GMT+7 + múi giờ tường minh** (§3.2) — T-BOX do VN chọn |
| TR-04 | **K4-E cấu hình gửi dữ liệu về server tại Việt Nam được không?** | Nếu không, phải đổi terminal — ảnh hưởng kiến trúc backend | ✅ **HẾT CHẶN** qua D-13 + D-16 — yêu cầu bắt buộc #4 khi mua sắm; hạ tầng đã chốt đặt tại VN |
| TR-05 | **Bộ đệm offline ≥48 giờ?** | NF-09 yêu cầu store-and-forward ≥48h | ✅ **HẾT CHẶN** qua D-13 — yêu cầu bắt buộc #3; nghiệm thu bằng **bench test** |

> **Hai quyết định 2026-08-04 đổi thế cờ:** phía Việt Nam chọn **hệ GPS** và chọn **model
> T-BOX**. TR-01/TR-03 do đó không còn phải chờ Tri-Ring trả lời — chúng trở thành **yêu cầu
> kỹ thuật trong hồ sơ mua sắm**. TR-04/TR-05 cũng nhẹ đi vì ta chọn thiết bị đáp ứng được,
> thay vì hỏi xem K4-E có làm được không.

Ưu tiên trung bình: tương thích SIM Việt Nam (Viettel/Vinaphone/MobiFone) với K4-E · tần
suất phát bản tin khi chạy/khi đỗ · danh sách PGN/SPN cụ thể (chờ **file DBC**, dự kiến
tháng 8/2026, **chú thích tiếng Trung** — cần bản dịch).

## 3. Bản sửa phòng vệ ĐÃ LÀM trong code

Hai rủi ro trên là loại **hỏng âm thầm**: dữ liệu trông vẫn bình thường, chỉ sai. Không đợi
câu trả lời được, vì khi có dữ liệu thật trộn vào rồi thì không tách lại được nữa.

### 3.0 YÊU CẦU BẮT BUỘC cho hồ sơ mua sắm T-BOX

Phía Việt Nam chọn thiết bị, nên bốn dòng dưới đây phải nằm trong **đặc tả kỹ thuật mời
thầu**, không phải kỳ vọng ngầm:

| # | Yêu cầu | Vì sao |
|---|---|---|
| 1 | Toạ độ xuất ra là **WGS-84 thô**, KHÔNG áp GCJ-02 | Nhiều module GNSS sản xuất tại TQ bật phép lệch này theo mặc định/firmware. Nhận nhầm thì lệch 100–700 m vĩnh viễn |
| 2 | Timestamp mang **múi giờ tường minh** (`Z` hoặc `+07:00`), đồng hồ đồng bộ NTP | Thiếu múi giờ thì ingest phải đoán → lệch 7 tiếng khi chạy trong Docker |
| 3 | Bộ đệm offline **≥48 giờ**, gửi bù giữ nguyên timestamp gốc | NF-09; tuyến biên giới sóng yếu |
| 4 | Cấu hình được **địa chỉ server tại Việt Nam** + SIM nhà mạng VN | TR-04; nếu không thì dữ liệu không về được |

### 3.1 Hệ toạ độ — `devices.he_toa_do` (migration 0029)

`telematics_readings.position` là `geography(Point, 4326)`, tức đã ngầm khẳng định WGS-84.
Ghi toạ độ GCJ-02 vào đó sẽ làm geofence (F-A5), gợi ý trạm (F-D2) và bản đồ đội (F-E1)
sai đều 100–700 m mà không có dấu hiệu gì.

Đã thêm enum `he_toa_do` = `wgs84` | `gcj02` | `chua_ro`, cột trên bảng `devices`, mặc định
`wgs84` (đúng với simulator Phase 1 — simulator phát WGS-84 thật). Trả về trong
`GET /devices/health`.

> **Sau khi TR-01 chốt = WGS-84**, cột này đổi vai: không còn là "chưa biết chính sách nào"
> mà là **"đã kiểm chứng thiết bị CỤ THỂ này chưa"**. Chính sách đã rõ, nhưng một lô hàng
> vẫn có thể về với firmware bật GCJ-02. Quy trình: đặt `chua_ro` khi nhập kho → bench test
> đối chiếu với một mốc toạ độ đã biết → mới đổi sang `wgs84`. Toạ độ của thiết bị còn
> `chua_ro` không được dùng cho geofence hay điều hướng.
>
> Cách phát hiện GCJ-02 trên bàn test: đặt xe/thiết bị tại một điểm đã biết chính xác toạ độ
> (mốc trắc địa, hoặc điểm đo bằng máy GNSS RTK). Lệch **đều 100–700 m theo một hướng** là
> dấu hiệu GCJ-02; lệch vài mét ngẫu nhiên là sai số GPS bình thường. Một điểm đơn lẻ không
> có mốc so sánh thì **không** phân biệt được — nên phải test, không thể nhìn dữ liệu mà đoán.

### 3.2 Đồng hồ thiết bị chạy trước — metric `g3_ingest_lech_dong_ho_total`

`IngestMetrics.observeLag()` trước đây chỉ có `Math.max(0, lagSeconds)`: lag **âm** (thiết bị
gửi giờ sớm hơn máy chủ) bị kẹp về 0 và biến mất hoàn toàn khỏi metric. Một T-BOX gửi giờ
UTC+8 gắn nhãn UTC sẽ làm mọi bản ghi sớm 1 giờ mà NF-01 vẫn xanh.

Hậu quả không phải chuyện hiển thị: ADR-010 mô tả đúng kịch bản này — khung giờ ToU của
chính sách sạc bị đối chiếu lệch giờ và hệ thống **gắn cờ vi phạm bảo hành oan** gần như
toàn bộ phiên sạc đêm.

Nay: lệch quá `LECH_DONG_HO_TOI_DA_GIAY` (120s) thì tăng counter riêng + cảnh báo console
một lần, nêu thẳng nghi ngờ UTC+8 và khuyến cáo không bật job gắn cờ vi phạm. **Không chặn
bản ghi** — NF-09 cấm mất dữ liệu.

**Sau khi TR-03 chốt (GMT+7):** thêm một lớp chặn nữa ở validator — `ts` **bắt buộc mang
múi giờ tường minh** (`Z` hoặc `+07:00`), thiếu thì vào quarantine. Lý do: chuỗi ISO thiếu
múi giờ KHÔNG bị `Date.parse` coi là lỗi, nó hiểu theo giờ **máy chạy ingest**. Máy dev ở
Asia/Bangkok (+07) ra đúng, container Docker mặc định UTC ra lệch **đúng 7 tiếng** — lỗi
nằm im cho tới lúc đổi chỗ chạy.

Ba tầng thời gian, cố ý tách bạch:

| Tầng | Quy ước |
|---|---|
| Bản tin thiết bị | `ts` có múi giờ tường minh (`Z` hoặc `+07:00`) |
| Lưu trữ | `timestamptz` — PostgreSQL quy về UTC. **Không** lưu giờ địa phương |
| Hiển thị & nghiệp vụ | `Asia/Ho_Chi_Minh` (`APP_TIMEZONE`) — khung giờ ToU, báo cáo, portal |

"Để giờ GMT+7" là quy ước **vận hành và hiển thị**, không phải cách lưu: `timestamptz` quy
về UTC bên trong chính là thứ khiến so sánh/sắp xếp/tính khoảng không phụ thuộc nơi chạy.
Việt Nam không có giờ mùa hè nên GMT+7 cố định quanh năm.

## 4. Khoảng trống schema — CHƯA làm, chờ file DBC

GB/T 32960-2016 giàu hơn `telematics_readings` hiện tại. Ba trường đã xác nhận có sẵn nhưng
ta **chưa lưu**:

| Trường | Dùng cho | Vì sao chưa làm |
|---|---|---|
| Điện áp **từng cell** | F-A4 phát hiện cell yếu/lệch áp | Chưa biết số cell & tần suất → chưa chọn được cách lưu (mảng vs bảng con). Chờ DBC. |
| Nhiệt độ theo **điểm lấy mẫu** | F-A4 | Cần biết số điểm đo mỗi dòng xe. Chờ DBC. |
| Điện trở **cách điện** (MΩ) | F-A4 — tín hiệu an toàn điện | Thêm 1 cột là dễ, nhưng chưa có ngưỡng cảnh báo nào được ký. |

Ba mục này đi cùng **một** migration khi có DBC (tháng 8/2026), và **tăng
`TELEMETRY_SCHEMA_VERSION` lên 3** theo quy tắc 8 + NF-16. Cố tình chưa thêm cột rỗng bây
giờ: cột không ai ghi chỉ làm schema khó đọc.

Ngoài ra: cảnh báo BMS 3 cấp do **xe tự phát** — hiện hệ thống chỉ tự tính cảnh báo của
mình (F-A2/F-A4). Khi có DBC nên nhận cả cảnh báo gốc từ xe thay vì chỉ suy ra.

## 5. Giao thức lên server — seam đã sẵn, chưa phải đổi

`ITelematicsSource` (`packages/contracts/src/telematics-source.ts`) chỉ giao
`TelematicsEnvelope { topic, payload, receivedAtMs }` — không ràng buộc MQTT. Một adapter
GB/T 32960 (TCP nhị phân) cài đặt được cùng interface này, đúng quy tắc 2.

⚠️ Một chỗ hở nhỏ đã biết: `payload` khai là **JSON string**. Bản tin GB/T 32960 là nhị
phân, nên khi làm adapter thật sẽ phải nới kiểu (`string | Uint8Array`) hoặc để adapter tự
giải mã sang JSON trước khi đưa vào pipeline. Ghi lại ở đây để không ai tưởng seam này
miễn phí hoàn toàn.

## 6. Trạm sạc — NGOÀI phạm vi Tri-Ring

Tri-Ring chỉ xác nhận xe có giao tiếp CAN với trụ. **Không** có thông tin nào về giao thức
quản lý trụ (OCPP?), nhà cung cấp trụ, hay API trạm sạc.

Điều này **không mâu thuẫn** với CSMS OCPP 1.6J đang có: PRD v3 vẫn giữ OCPP (Q8 hỏi *phiên
bản* 1.6J hay 2.0.1, chứ không hỏi có dùng OCPP hay không). Nhưng nó xác nhận rằng lựa chọn
trụ sạc là **hạng mục công việc độc lập**, phải làm việc với nhà cung cấp trụ — chưa ai
xác nhận trụ thực tế sẽ nói OCPP.

## 7. Việc tiếp theo (theo khuyến nghị của chính tài liệu)

1. Gửi lại 5 câu hỏi TR-01…TR-05 bằng **email chính thức** thay vì chat, để có căn cứ theo dõi.
2. Họp kỹ thuật trực tuyến: kỹ sư điện + phần mềm tổng thành xe của Tri-Ring × backend +
   embedded phía Việt Nam.
3. Chốt lịch nhận **file DBC** khi xe mẫu debug xong (tháng 8/2026), kèm yêu cầu **dịch chú
   thích sang tiếng Anh**.
4. Chuẩn bị harness AMP 174917-2 + thiết bị test CAN (500K, J1939) để bench test.
5. ~~**Quyết định sớm:** dùng K4-E của Tri-Ring hay tự chọn T-BOX~~ → ✅ **ĐÃ QUYẾT 2026-08-21
   (D-13): G3 TỰ CHỌN T-BOX.** Việc còn lại là ra hồ sơ mời thầu thiết bị với 4 yêu cầu bắt
   buộc ở §3.0, cộng thêm một yêu cầu thứ 5 phát sinh từ D-16: **thiết bị phải nạp được chứng
   chỉ client** (mTLS cho NF-06 — không có điều khoản này thì NF-06 không thực hiện được dù
   backend đã sẵn sàng).
6. Tách luồng công việc trạm sạc thành hạng mục độc lập.
