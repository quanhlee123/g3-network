# Ánh xạ endpoint API ↔ ma trận phân quyền sheet 9

> Nguồn quyền là [docs/prd/09-rbac.md](../prd/09-rbac.md) — file đó là bản chuyển đổi trung
> thực từ PRD v2.0 và **không được sửa** ở đây. Tài liệu này chỉ ghi lại *endpoint nào ứng với
> dòng nào* và **những chỗ tôi phải suy luận** — các mục `[CẦN REVIEW]` cần người duyệt.
>
> Cài đặt: [apps/api/src/auth/permissions.ts](../../apps/api/src/auth/permissions.ts).
> Nguyên tắc: **mặc định TỪ CHỐI** (quy tắc 6, CLAUDE.md) — vai trò nào không được liệt kê
> tường minh thì không có quyền; route nào quên khai báo quyền cũng bị chặn.

## Quyền và dòng sheet 9 tương ứng

| Quyền (`permission`) | Endpoint | Dòng sheet 9 |
|---|---|---|
| `vehicle.read` | `GET /vehicles`, `GET /vehicles/{id}/telemetry/latest`, `.../history` | Xem trạng thái & vị trí xe |
| `vehicle.location.read` | `GET /vehicles/{id}/location` | Xem trạng thái & vị trí xe |
| `station.read` | `GET /stations`, `GET /stations/{id}` | Tìm & điều hướng trạm sạc ∪ Quản lý danh mục & trạng thái trạm |
| `charging_session.read` | `GET /charging-sessions` | Sản lượng điện / đối soát kWh ∪ Xem trạng thái / báo cáo bảo hành |
| `device_health.read` | `GET /devices/health` | Sức khỏe thiết bị telematics |
| `vehicle.location.read` | `GET /vehicles/{id}/route` (F-A5 — lộ trình cũng là dữ liệu vị trí) | Xem trạng thái & vị trí xe |
| `geofence.read` / `.manage` | `GET /geofences`, `POST /geofences` | *(không có dòng tương ứng — xem R-07)* |
| `ticket.create` / `.read` / `.handle` | `POST /sos`, `GET /tickets`, `POST /tickets/{id}/nhan` | Ticket hỗ trợ & SOS (MỚI) — xem R-08 |
| `notification.read` | `GET /notifications`, `POST /notifications/{id}/da-doc` | *(không có dòng tương ứng — xem R-06)* |
| `reconciliation.read` / `.run` | `GET /reconciliation/results`, `POST /reconciliation/run` | Sản lượng điện / đối soát kWh |

## Bảng quyền đã cài đặt

`own` = chỉ xe được gán · `fleet` = chỉ đội mình · `all` = toàn bộ · trống = TỪ CHỐI

| Quyền | Tài xế | QL đội | Vận hành Energy | Bảo hành | CSKH | Admin | Sale |
|---|---|---|---|---|---|---|---|
| `vehicle.read` | own | fleet | — | all | all | all | all |
| `vehicle.location.read` | own | fleet | **—** | all | all *(cần ticket mở)* | all | all |
| `station.read` | all | all | all | — | — | all | — |
| `charging_session.read` | own | fleet | all | all | all | all | — |
| `device_health.read` | — | fleet | — | — | all | all | — |
| `reconciliation.read` | — | fleet | all | — | — | all | — |
| `reconciliation.run` | — | — | all | — | — | all | — |

## Quyết định tách `vehicle.read` khỏi `vehicle.location.read`

Sheet 9 gộp "trạng thái **&** vị trí xe" thành một dòng. API tách làm hai vì:

1. **Quy tắc 5 chỉ có đúng một chỗ để thực thi.** Toạ độ chỉ ra khỏi hệ thống qua
   `GET /vehicles/{id}/location`, nơi bắt buộc có `reason` và luôn ghi `audit_logs`.
   Nếu toạ độ đi kèm mọi endpoint xe thì mỗi endpoint đều phải nhớ ghi audit — sớm muộn sẽ quên.
2. **Nghị định 13/2023 — thu thập tối thiểu.** Màn hình chỉ cần SOC/quãng đường (dashboard đội,
   cảnh báo pin) không kéo theo dữ liệu vị trí của tài xế.

Hệ quả: vai trò nào có "V" ở dòng đó thì có **cả hai** quyền — bảng trên không nới rộng quyền
so với sheet 9, chỉ chia nhỏ đường ra của dữ liệu.

## [CẦN REVIEW] — các điểm cần người duyệt xác nhận

| # | Vấn đề | Đã làm gì | Cần ai quyết |
|---|---|---|---|
| R-01 | **Sale được xem vị trí xe.** Sheet 9 ghi "V" cho Sale ở dòng "Xem trạng thái & vị trí xe". Vai trò bán hàng cần toạ độ realtime của tài xế để làm gì thì PRD không nói. Theo nguyên tắc "thu thập tối thiểu" (NF-08, Nghị định 13/2023) đây là quyền khó biện minh, và mọi lần xem đều để lại dấu vết có tên người xem. | Giữ **đúng sheet 9** (không tự siết), đã ghi chú trong `permissions.ts` | PM + Legal |
| R-02 | **Danh sách phiên sạc cho Sale.** Sheet 9 cho Sale "V" ở dòng *Xem trạng thái / báo cáo bảo hành* — nhưng đó là **báo cáo** bảo hành, không phải danh sách phiên sạc thô. | Chọn phương án chặt hơn: Sale **không** có `charging_session.read`. Khi có F-E3 (báo cáo bảo hành) sẽ mở quyền trên đúng endpoint báo cáo. | PM |
| R-03 | **Tài xế xem danh sách trạm.** Dòng "Tìm & điều hướng trạm sạc" = ✓ nhưng dòng "Quản lý danh mục & trạng thái trạm" = —. | Cho `station.read` (chỉ đọc); các thao tác ghi/CRUD trạm sẽ là quyền riêng `station.manage` khi xây F-C1 phần ghi. | — (đã rõ) |
| R-04 | **`reconciliation.read` phạm vi `fleet` cho QL đội.** Sheet 9 ghi "V\*" ở dòng "Sản lượng điện / đối soát kWh". Ký hiệu \* nghĩa là "chỉ trong đội mình" → lọc theo `customer_id` của xe trong phiên sạc. | Đã cài đặt theo cách đó | PM xác nhận |
| R-08 | **Ticket cho Vận hành / Bảo hành / Sale (F-I2).** Sheet 9 dòng "Ticket hỗ trợ & SOS" cho ba vai trò này "V" kèm chú thích phạm vi trong ngoặc — *V (trạm)*, *V (bảo hành)*, *V* — nhưng không nói rõ "ticket về trạm" hay "ticket bảo hành" được lọc theo tiêu chí nào. | Chọn phương án CHẶT hơn (cùng cách xử lý như R-02): ba vai trò này **chưa** có `ticket.read`. Đã cấp: Tài xế `own` (tạo/xem), QL đội `fleet` (tạo/xem), CSKH `all` (xem + XỬ LÝ), Admin `all`. Khi làm F-I1/F-I3 sẽ mở quyền trên đúng bộ lọc. | PM + CSKH Holding (nằm trong D-09 đang MỞ) |
| R-07 | **`geofence.read` / `geofence.manage` (F-A5).** Sheet 9 không có dòng nào cho geofence — vùng giám sát là khái niệm của "quy trình rủi ro G3" (nguồn của F-A5/F-J3) chứ không phải của ma trận quyền. | Đặt **ngang mức với quyền xem vị trí xe**: ai giám sát được vị trí đội mình thì đặt được vùng cho đội mình. QL đội = `fleet` (chỉ tạo vùng cho đội mình hoặc xe của đội mình, có test); Admin = `all` và là vai trò DUY NHẤT tạo được vùng áp dụng toàn hệ. Các vai trò khác: TỪ CHỐI. | PM + Vận hành |
| R-06 | **`notification.read` cho MỌI vai trò (F-F3).** Sheet 9 không có dòng nào cho "thông báo của tôi" — ma trận đó nói về quyền xem dữ liệu xe/trạm, còn hộp thư là dữ liệu của chính người đăng nhập. Chặn người dùng đọc thông báo gửi cho họ thì cảnh báo an toàn vô nghĩa. | Cấp cho cả 7 vai trò với phạm vi **`own`** cứng: truy vấn luôn khoá theo `user_id` của token, không nhận `user_id` từ query — không ai xem hộp thư người khác, kể cả admin. Đặt riêng trong `QUYEN_CUA_MOI_VAI_TRO` (permissions.ts) để thấy rõ đây là ngoại lệ có chủ ý. | PM xác nhận |
| R-05 | **Bảo hành & CSKH không thấy trạm sạc.** Sheet 9 để "—" ở cả hai dòng về trạm cho hai vai trò này, dù CSKH hỗ trợ tài xế hết pin thì cần biết trạm nào còn trống. | Giữ đúng sheet 9 (từ chối). Nếu vận hành thực tế cần, mở qua ADR. | CSKH Holding |

## Ghi audit — hành vi chính xác

| Tình huống | HTTP | Dòng `audit_logs` |
|---|---|---|
| Xem vị trí thành công | 200 | `vehicle_location.read` — user, xe, lý do, ticket (nếu có) |
| Vai trò không có quyền (vd Vận hành Energy) | 403 | `vehicle_location.denied` — chặn ngay ở guard, mã xe nằm trong `metadata` |
| Xe ngoài phạm vi | 404 | `vehicle_location.denied` |
| CSKH thiếu ticket đang mở | 403 | `vehicle_location.denied` |
| Thiếu tham số `reason` | 400 | **không có** — request bị chặn ở tầng schema, chưa chạm tới dữ liệu xe |
| Xe chưa có bản ghi vị trí | 404 | `vehicle_location.read` với `metadata.ket_qua = chua_co_du_lieu_vi_tri` |

Lý do ghi cả lần **bị từ chối**: hồ sơ "ai đã *cố* xem vị trí tài xế" có giá trị điều tra không
kém "ai đã xem" — đây là yêu cầu của quyền chủ thể dữ liệu trong Nghị định 13/2023.
