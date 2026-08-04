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
| `charging_policy.read` | `GET /charging-policies`, `.../{code}/versions`, `GET /vehicles/{id}/charging-policy` | *(không có dòng cho việc ĐỌC — xem R-09)* |
| `charging_policy.manage` | `POST /charging-policies`, `.../{code}/versions`, `.../{code}/ngung` | Cấu hình chính sách sạc (bảo hành) |
| `violation.read` | `GET /violations`, `GET /violations/{id}` | Xem trạng thái / báo cáo bảo hành — xem R-10 |
| `violation.run` | `POST /violations/run` | Xem trạng thái / báo cáo bảo hành (thao tác của Bảo hành) |
| `station.manage` | `POST /stations`, `PATCH /stations/{id}`, `POST|PATCH /stations/{id}/connectors…` | Quản lý danh mục & trạng thái trạm |
| `station.read` | `GET /stations/map` (F-C2 — bản đồ cho app) | Tìm & điều hướng trạm sạc |
| `reconciliation.read` | `GET /reports/kwh`, `GET /reconciliation/report` (F-C6) | Sản lượng điện / đối soát kWh |
| `payment.start` | `POST /payments/qr/start`, `POST /payments/session/{id}`, `.../ocpp-transaction/{id}` | Thanh toán phiên sạc / ví (MỚI) |
| `payment.read` | `GET /payments`, `GET /payments/chua-thu` | Thanh toán phiên sạc / ví (MỚI) |
| *(không có — công khai)* | `POST /payments/webhook/{cong}` | — · xác thực bằng **CHỮ KÝ HMAC**, xem R-11 |
| `device_health.read` | `GET /devices/health` | Sức khỏe thiết bị telematics |
| `vehicle.location.read` | `GET /vehicles/{id}/route` (F-A5 — lộ trình cũng là dữ liệu vị trí) | Xem trạng thái & vị trí xe |
| `geofence.read` / `.manage` | `GET /geofences`, `POST /geofences` | *(không có dòng tương ứng — xem R-07)* |
| `ticket.create` / `.read` / `.handle` | `POST /sos`, `GET /tickets`, `POST /tickets/{id}/nhan` | Ticket hỗ trợ & SOS (MỚI) — xem R-08 |
| `notification.read` | `GET /notifications`, `POST /notifications/{id}/da-doc` | *(không có dòng tương ứng — xem R-06)* |
| `reconciliation.read` / `.run` | `GET /reconciliation/results`, `POST /reconciliation/run` | Sản lượng điện / đối soát kWh |
| `alert.read` | `GET /alerts` (F-E1 — khối cảnh báo trên màn hình tổng quan) | Nhận cảnh báo pin / bất thường |
| `user.read` | `GET /users` (F-F1) | Tài khoản & phân quyền (RBAC) |
| `user.manage` | `POST /users`, `PATCH /users/{id}` (F-F1 — mời/khóa/gán vai trò) | Tài khoản & phân quyền (RBAC) — chỉ cột "✓" |
| `audit.read` | `GET /audit-logs` (F-F1, NF-06) | Quản trị dữ liệu & audit log — xem R-14 |
| `provisioning.manage` | `POST /provisioning`, `.../{id}/thiet-bi`, `.../consent`, `.../hoan-tat`, `.../that-bai`, `GET /provisioning…` (F-F2) | *(không có dòng tương ứng — xem R-16)* |
| `vehicle.location.read` | `GET /vehicles/map` (F-E1 — bản đồ toàn đội) | Xem trạng thái & vị trí xe — xem R-12 |

## Bảng quyền đã cài đặt

`own` = chỉ xe được gán · `fleet` = chỉ đội mình · `all` = toàn bộ · trống = TỪ CHỐI

| Quyền | Tài xế | QL đội | Vận hành Energy | Bảo hành | CSKH | Admin | Sale |
|---|---|---|---|---|---|---|---|
| `vehicle.read` | own | fleet | — | all | all | all | all |
| `vehicle.location.read` | own | fleet | **—** | all | all *(cần ticket mở)* | all | all |
| `station.read` | all | all | all | — | — | all | — |
| `station.manage` | — | — | **all** | — | — | all | — |
| `payment.start` | own | fleet | — | — | — | all | — |
| `payment.read` | own | fleet | — | — | all | all | — |
| `charging_session.read` | own | fleet | all | all | all | all | — |
| `charging_policy.read` | own | fleet | — | all | — | all | — |
| `charging_policy.manage` | — | — | — | **all** | — | all | — |
| `violation.read` | own | fleet | — | all | all | all | — |
| `violation.run` | — | — | — | all | — | all | — |
| `device_health.read` | — | fleet | — | — | all | all | — |
| `reconciliation.read` | — | fleet | all | — | — | all | — |
| `reconciliation.run` | — | — | all | — | — | all | — |
| `alert.read` | own | fleet | — | all | all | all | — |
| `user.read` | — | fleet | — | — | — | all | — |
| `user.manage` | — | **—** | — | — | — | all | — |
| `audit.read` | — | — | all | all | — | all | — |
| `provisioning.manage` | — | — | — | — | — | **all** | — |

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
| R-16 | **Ai được KÍCH HOẠT THIẾT BỊ theo VIN (F-F2).** Sheet 9 không có dòng nào cho provisioning, cũng không có vai trò "nhân viên hiện trường" — trong khi Hành trình 1 bước 1 nói rõ việc này do "nhân viên G3" làm tại chỗ lúc bàn giao xe. | Chọn phương án CHẶT (cùng cách xử lý R-02/R-08/R-10): `provisioning.manage` **chỉ Admin**. Gán thiết bị vào xe là thao tác quyết định dữ liệu xe đó chảy về đâu, và ghi consent thay tài xế là chạm dữ liệu cá nhân (Nghị định 13/2023) — không nới cho vai trò nào khác khi chưa có người chịu trách nhiệm rõ. Khi tổ chức chốt vai trò nhân viên bàn giao thì thêm đúng vai trò đó. | PM + Vận hành (ai cầm máy đi bàn giao xe?) |
| R-14 | **Vận hành Energy & Bảo hành đọc được NHẬT KÝ TRUY CẬP VỊ TRÍ (F-F1).** Sheet 9 cho cả hai "V" ở dòng "Quản trị dữ liệu & audit log". Nhưng nhật ký chứa VIN và mã xe của mọi lượt xem vị trí — trong khi Vận hành Energy còn *không có* quyền `vehicle.location.read` (dòng "Xem trạng thái & vị trí xe" = "—"). Thành ra vai trò không được xem vị trí lại đọc được hồ sơ ai đã xem vị trí xe nào. | Giữ **đúng sheet 9** (không tự siết, cùng cách xử lý R-01), đã ghi chú trong `permissions.ts`. Nhật ký KHÔNG chứa toạ độ — chỉ chứa VIN, người xem và lý do — nên mức lộ lọt thấp hơn hẳn quyền xem vị trí. Nếu Legal thấy vẫn quá rộng thì siết xuống chỉ Admin là đổi một dòng. | PM + Legal |
| R-15 | **Đọc nhật ký có phải ghi nhật ký không (meta-audit).** Quy tắc 5 nói "mọi truy cập dữ liệu VỊ TRÍ XE phải ghi audit log". Bảng `audit_logs` không chứa toạ độ, nên đọc nó không phải là truy cập dữ liệu vị trí — nhưng nó cho biết ai đã xem xe nào. | Hiện **KHÔNG** ghi meta-audit: mỗi lần mở màn hình nhật ký lại sinh thêm một dòng nhật ký sẽ làm bảng tự phình theo cấp số nhân và lấp mất dòng thật. Đã ghi chú ngay trong `routes/audit-logs.ts` để người sau không tưởng là quên. | Legal quyết có cần meta-audit không |
| R-12 | **CSKH và BẢN ĐỒ TOÀN ĐỘI (F-E1).** Sheet 9 cho CSKH xem vị trí xe "khi có ticket đang mở", và ticket luôn gắn với MỘT xe. Bản đồ toàn đội không có khái niệm "ticket của cả đội" — nếu cho qua thì một ticket bất kỳ trở thành giấy phép xem vị trí mọi tài xế, đúng điều ghi chú phạm vi của sheet 9 muốn ngăn. | Chọn phương án CHẶT hơn: `GET /vehicles/map` trả **403** cho mọi vai trò có `requireOpenTicket` (hiện là CSKH), và vẫn ghi audit dòng `vehicle_location.denied`. CSKH đi đường cũ `GET /vehicles/{id}/location?ticket_id=…` — không mất chức năng hỗ trợ nào. Có test. | PM + Legal (liên quan D-09 đang MỞ) |
| R-13 | **Một dòng audit cho một lần xem BẢN ĐỒ.** Quy tắc 5 nói "mọi truy cập dữ liệu vị trí phải ghi audit: ai, lúc nào, **xe nào**, lý do". Bản đồ đội 20 xe nếu ghi 20 dòng mỗi lần mở trang chủ thì nhật ký chỉ còn nhiễu, không điều tra được nữa. | `GET /vehicles/map` ghi **một** dòng `vehicle_location.read` với `vehicle_id = NULL`, `metadata.endpoint = 'map'`, `metadata.so_xe` và `metadata.vehicle_ids` là danh sách xe đã hiện. Cột "xe nào" vẫn trả lời được, chỉ nằm trong metadata. Màn hình xem audit (F-F1) hiển thị đúng như vậy. | PM + Legal xác nhận cách ghi này đủ cho NF-06 |
| R-08 | **Ticket cho Vận hành / Bảo hành / Sale (F-I2).** Sheet 9 dòng "Ticket hỗ trợ & SOS" cho ba vai trò này "V" kèm chú thích phạm vi trong ngoặc — *V (trạm)*, *V (bảo hành)*, *V* — nhưng không nói rõ "ticket về trạm" hay "ticket bảo hành" được lọc theo tiêu chí nào. | Chọn phương án CHẶT hơn (cùng cách xử lý như R-02): ba vai trò này **chưa** có `ticket.read`. Đã cấp: Tài xế `own` (tạo/xem), QL đội `fleet` (tạo/xem), CSKH `all` (xem + XỬ LÝ), Admin `all`. Khi làm F-I1/F-I3 sẽ mở quyền trên đúng bộ lọc. | PM + CSKH Holding (nằm trong D-09 đang MỞ) |
| R-07 | **`geofence.read` / `geofence.manage` (F-A5).** Sheet 9 không có dòng nào cho geofence — vùng giám sát là khái niệm của "quy trình rủi ro G3" (nguồn của F-A5/F-J3) chứ không phải của ma trận quyền. | Đặt **ngang mức với quyền xem vị trí xe**: ai giám sát được vị trí đội mình thì đặt được vùng cho đội mình. QL đội = `fleet` (chỉ tạo vùng cho đội mình hoặc xe của đội mình, có test); Admin = `all` và là vai trò DUY NHẤT tạo được vùng áp dụng toàn hệ. Các vai trò khác: TỪ CHỐI. | PM + Vận hành |
| R-06 | **`notification.read` cho MỌI vai trò (F-F3).** Sheet 9 không có dòng nào cho "thông báo của tôi" — ma trận đó nói về quyền xem dữ liệu xe/trạm, còn hộp thư là dữ liệu của chính người đăng nhập. Chặn người dùng đọc thông báo gửi cho họ thì cảnh báo an toàn vô nghĩa. | Cấp cho cả 7 vai trò với phạm vi **`own`** cứng: truy vấn luôn khoá theo `user_id` của token, không nhận `user_id` từ query — không ai xem hộp thư người khác, kể cả admin. Đặt riêng trong `QUYEN_CUA_MOI_VAI_TRO` (permissions.ts) để thấy rõ đây là ngoại lệ có chủ ý. | PM xác nhận |
| R-09 | **Ai được ĐỌC chính sách sạc (F-B1).** Sheet 9 chỉ có dòng "Cấu hình chính sách sạc (bảo hành)" — tức quyền GHI (✓ Bảo hành, ✓ Admin, còn lại "—"). Không có dòng nào nói ai được *xem* nội dung chính sách. | Ghi: đúng sheet 9, chỉ Bảo hành + Admin. Đọc: thêm **Tài xế (`own`)** và **QL đội (`fleet`)**, chỉ thấy chính sách áp cho xe trong phạm vi của họ — vì F-B5 bắt buộc cảnh báo vi phạm phải "nêu rõ hành vi & cách khắc phục", mà nói người ta vi phạm rồi không cho xem quy định đã vi phạm thì cảnh báo vô nghĩa. Vận hành Energy, CSKH, Sale: **TỪ CHỐI** (chặt hơn, cùng cách xử lý R-02/R-08). | PM + Bảo hành Mobility |
| R-11 | **Webhook thanh toán là route CÔNG KHAI (F-H1).** Đây là ngoại lệ của quy tắc 6 (mặc định TỪ CHỐI) ngoài health/docs/đăng nhập. Cổng thanh toán không đăng nhập được vào hệ mình nên không thể yêu cầu token. | Xác thực bằng **CHỮ KÝ HMAC** của cổng — `docWebhook()` ném lỗi khi sai, và có test cho cả ba ca: chữ ký sai, thiếu chữ ký, sửa số tiền sau khi ký. Endpoint luôn trả HTTP 200 (kết quả nằm trong body) vì trả 4xx/5xx sẽ khiến cổng retry vô hạn. Không có đường ghi nào khác vào bảng giao dịch từ bên ngoài. | PM + Bảo mật (pen-test NF-07 nên soi endpoint này trước tiên) |
| R-10 | **Sale và hồ sơ vi phạm sạc (F-B3).** Sheet 9 cho Sale "V" ở dòng "Xem trạng thái / báo cáo bảo hành", mà hồ sơ vi phạm là một phần của báo cáo đó. | Chọn phương án CHẶT hơn, cùng cách xử lý R-02: Sale **không** có `violation.read`. Bản ghi vi phạm kèm bằng chứng chứa cả telemetry trong phiên — quá nhiều cho nhu cầu bán hàng theo nguyên tắc thu thập tối thiểu (NF-08). Khi có F-E3 (báo cáo bảo hành tổng hợp) sẽ mở quyền trên đúng endpoint báo cáo. | PM + Legal |
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
