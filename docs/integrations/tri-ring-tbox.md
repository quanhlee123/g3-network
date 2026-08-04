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

## 2. CHƯA TRẢ LỜI — đang chặn (ưu tiên cao)

| # | Câu hỏi | Vì sao chặn |
|---|---|---|
| TR-01 | **Hệ toạ độ GPS: WGS-84 hay GCJ-02?** | GCJ-02 lệch **100–700 m** tại Việt Nam. Xem §3 — đã có bản sửa phòng vệ. |
| TR-02 | **Giao thức truyền lên server: GB/T 32960 hay MQTT/JSON?** | Quyết định hình dạng adapter ingest. Xem §5. |
| TR-03 | **Timestamp có phải UTC không?** | TQ là UTC+8, VN UTC+7. Xem §3 — đã có bản sửa phòng vệ. |
| TR-04 | **K4-E cấu hình gửi dữ liệu về server tại Việt Nam được không?** | Nếu không, phải đổi terminal — ảnh hưởng kiến trúc backend. |
| TR-05 | **Bộ đệm offline ≥48 giờ?** | NF-09 yêu cầu store-and-forward ≥48h. Chưa xác nhận thiết bị làm được. |

Ưu tiên trung bình: tương thích SIM Việt Nam (Viettel/Vinaphone/MobiFone) với K4-E · tần
suất phát bản tin khi chạy/khi đỗ · danh sách PGN/SPN cụ thể (chờ **file DBC**, dự kiến
tháng 8/2026, **chú thích tiếng Trung** — cần bản dịch).

## 3. Bản sửa phòng vệ ĐÃ LÀM trong code

Hai rủi ro trên là loại **hỏng âm thầm**: dữ liệu trông vẫn bình thường, chỉ sai. Không đợi
câu trả lời được, vì khi có dữ liệu thật trộn vào rồi thì không tách lại được nữa.

### 3.1 Hệ toạ độ — `devices.he_toa_do` (migration 0029)

`telematics_readings.position` là `geography(Point, 4326)`, tức đã ngầm khẳng định WGS-84.
Ghi toạ độ GCJ-02 vào đó sẽ làm geofence (F-A5), gợi ý trạm (F-D2) và bản đồ đội (F-E1)
sai đều 100–700 m mà không có dấu hiệu gì.

Đã thêm enum `he_toa_do` = `wgs84` | `gcj02` | `chua_ro`, cột trên bảng `devices`, mặc định
`wgs84` (đúng với simulator Phase 1 — simulator phát WGS-84 thật). Trả về trong
`GET /devices/health`.

> **Việc phải làm khi có thiết bị thật:** đặt `he_toa_do = 'chua_ro'` cho mọi K4-E lúc nhập
> kho, và **chỉ** đổi sang giá trị thật khi Tri-Ring xác nhận bằng văn bản. Toạ độ của
> thiết bị `chua_ro` không được dùng cho geofence hay điều hướng.

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
5. **Quyết định sớm:** dùng K4-E của Tri-Ring hay tự chọn T-BOX — ảnh hưởng trực tiếp kiến
   trúc backend và khả năng đưa dữ liệu về server Việt Nam.
6. Tách luồng công việc trạm sạc thành hạng mục độc lập.
