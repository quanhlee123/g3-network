# DECISION LOG — G3 Network Phase 1
Trạng thái: MỞ / ĐÃ CHỐT / HOÃN · Quyết định hợp lệ phải đủ 5 trường (xem INPUT-01)

| Mã | Câu hỏi | Phương án chọn | Lý do | Người quyết | Ngày | Ảnh hưởng (F-xx) | Trạng thái |
|---|---|---|---|---|---|---|---|
| D-01 | Có app tài xế ở P1 không? (thiết kế đề xuất cân nhắc bỏ; PRD để Must; Đức cũng ghi chú "cân nhắc app tài xế ở p1" tại F-D4, F-H1..H4, F-K1) | **CÓ — làm CẢ HAI: app tài xế (Expo) + portal đội xe (Next.js)**. App tài xế giữ đúng phạm vi P1.0: xem pin/SOC, bản đồ & điều hướng trạm, quét QR sạc–trả, SOS, nhận cảnh báo pin | Tài xế là người DUY NHẤT đứng cạnh xe khi pin cảnh báo và cạnh trụ khi sạc — không có app thì F-H1 (thanh toán phiên sạc) và F-I2 (SOS) không có mặt tiền, chỉ còn API. Portal đội xe phục vụ vai trò khác (quản lý đội), không thay thế được | PM (Quốc Anh) | 2026-08-03 | F-D1..D5, F-H1..H4, F-K1, F-I2, NSM | **ĐÃ CHỐT** (⚠️ chờ BLĐ phê chuẩn hình thức) |
| D-02 | Dùng thẻ RFID ở trụ sạc? (có trong bản vẽ thiết kế, không có trong PRD) | — | — | BLĐ + G3 Energy | — | F-H1, F-F1, phần cứng trụ | MỞ |
| D-03 | Định nghĩa "chuyến" cho chống spam cảnh báo | KHÔNG dùng khái niệm "chuyến": chống spam theo vòng đời cảnh báo — mỗi ngưỡng bắn 1 lần cho tới khi SOC hồi lên trên ngưỡng + 5% — xem ADR-006 | Trùng hành vi "1 lần/ngưỡng/chuyến" trong thực tế (giữa 2 lần tụt pin qua cùng ngưỡng luôn có 1 lần sạc), lại không phải định nghĩa thêm khái niệm mới; trạng thái nằm trong bảng alerts nên sống sót khi ingest restart | PM | 2026-07-29 | F-A2 | ĐÃ CHỐT |
| D-04 | Backend framework: Fastify hay NestJS | Fastify 5 + TypeBox | Nhẹ, OpenAPI tự sinh từ schema, hợp modular monolith — xem ADR-001 | PM (duyệt kế hoạch Prompt 01) | 2026-07-17 | apps/api | ĐÃ CHỐT |
| D-05 | F-A6 Hiệu suất vận hành: actor là ai? (ghi chú review của Đức: "Chưa rõ Actor") | — | — | PM | — | F-A6 | MỞ |
| D-06 | F-E3 Báo cáo sạc & bảo hành: cho đội xe hay cho admin tổng? (ghi chú review của Đức) | — | — | PM | — | F-E3 | MỞ |
| D-07 | F-E4 Quản lý tài xế & phân công: thống nhất mô hình quản lý (ghi chú review của Đức) | — | — | PM + BLĐ | — | F-E4, F-F1, 09-rbac | MỞ |
| D-08 | F-F2 Provisioning & F-J2 OTA config: làm rõ chức năng với người review (ghi chú của Đức: "Chưa hiểu chức năng") | — | — | PM + Dev | — | F-F2, F-J2 | MỞ |
| D-09 | Module I (CSKH & Dịch vụ): định hướng nghiệp vụ (ghi chú của Đức: "Chưa có ý tưởng" cho F-I1..I3; lưu ý F-I2 SOS là Must P1.0) | — | — | PM + CSKH Holding | — | F-I1, F-I2, F-I3 | MỞ |
| D-10 | Vùng địa lý của dữ liệu mô phỏng: seed đặt 3 trạm sạc quanh TP.HCM/Long An, còn vehicle-sim chạy tuyến Hà Nội – Lạng Sơn → "trạm gần nhất" trong cảnh báo pin ra 1.130 km (đúng về mặt tính toán, vô nghĩa về mặt vận hành) | Làm CẢ HAI: (1) seed bổ sung 3 trạm trên hành lang Hà Nội – Lạng Sơn, và (2) vehicle-sim thêm tuyến miền Nam đi qua 3 trạm TP.HCM/Long An, chọn bằng cờ `--route bac\|nam` | Mạng trạm phủ cả hai miền là hình ảnh thật của một nhà vận hành toàn quốc; đội xe giả lập chạy tuyến nào cũng có trạm trong tầm vài km, nên gợi ý trạm của F-A2 và điều hướng F-D2 mới có nghĩa | PM | 2026-07-29 | F-A2, F-D1, F-D2, F-C1, seed & simulator | ĐÃ CHỐT |
| D-11 | Hiệu suất sạc dùng cho đối soát 3 chiều — hệ số toàn hệ hay theo dòng xe/trạm, và ai hiệu chuẩn trong pilot | MỘT hệ số toàn hệ `CHARGE_EFFICIENCY`, giữ `1.0` ở Phase 1 (simulator lý tưởng), hiệu chuẩn bằng dữ liệu pilot trước Gate 1 — xem ADR-007 | Không có hệ số thì phần cứng thật sẽ báo lệch 5–8% ở 100% số phiên; chia theo dòng xe/trạm là phức tạp chưa có dữ liệu để biện minh | PM | 2026-07-29 | F-C6, NF-10 | ĐÃ CHỐT (⚠️ việc hiệu chuẩn vẫn là điều kiện Gate 1) |
| D-12 | Vai trò nhận cảnh báo tháo thiết bị: F-J3 và ADR-003 nói báo cho "Vận hành & **Quản lý rủi ro**", nhưng sheet 9 và enum `user_role` KHÔNG có vai trò "Quản lý rủi ro"; "Vận hành G3 Energy" (`energy_ops`) lại là vai trò trạm sạc, ở dòng "Xem trạng thái & vị trí xe" của sheet 9 là "—" | Tạm cấu hình `device_tamper` cho `admin` + `fleet_manager` + `cskh` (theo dòng "Sức khỏe thiết bị telematics" của sheet 9). KHÔNG tự thêm vai trò mới (quy tắc 6) | Quy trình thu hồi xe là việc của bộ phận rủi ro, mà bộ phận đó chưa có chỗ trong ma trận phân quyền → cần người quyết trước khi cấp quyền xem vị trí/thiết bị cho một vai trò mới | PM + Vận hành (+ Legal nếu vai trò mới được xem vị trí xe) | — | F-J3, F-F3, 09-rbac | MỞ |
| D-13 | Thiết bị telematics: dùng **K4-E của Tri-Ring** hay **G3 tự chọn T-BOX** bên thứ ba? (mục 5 phần "Việc tiếp theo" của [tri-ring-tbox.md](integrations/tri-ring-tbox.md)) | **G3 TỰ CHỌN T-BOX.** Ra hồ sơ mời thầu thiết bị với 4 yêu cầu bắt buộc ở [tri-ring-tbox.md §3.0](integrations/tri-ring-tbox.md): (1) toạ độ WGS-84 thô, (2) timestamp có múi giờ tường minh + NTP, (3) đệm offline ≥48h giữ timestamp gốc, (4) cấu hình được server tại VN + SIM nhà mạng VN | Ba câu hỏi TR-02/TR-04/TR-05 khi đó **không còn phải chờ Tri-Ring trả lời** — chúng thành tiêu chí chọn thiết bị, tức G3 tự quyết được. Rủi ro nặng nhất của đường K4-E là phải **đổi terminal giữa chừng dự án** nếu hoá ra nó không gửi được về server VN (TR-04). Tri-Ring đã xác nhận lắp T-BOX bên thứ ba **không ảnh hưởng bảo hành xe & pin** (cần lấy văn bản chính thức) | PM (Quốc Anh) | 2026-08-21 | F-G1, F-A1, F-F2, NF-01, NF-09, TR-02, TR-04, TR-05 | **ĐÃ CHỐT** |
| D-14 | Q9 (nhà cung cấp hoá đơn điện tử) đang MỞ — có để cả gói SOW-03 đứng chờ không? | **KHÔNG. Tách SOW-03 làm 2 chặng.** Chặng 1 khởi động ngay: viết interface `IEInvoiceProvider` trong `packages/contracts` + ít nhất 1 mock chạy được. Chặng 2 cắm adapter thật khi Kế toán Holding chốt vendor | Interface và mock **không phụ thuộc vendor** — đó chính là điểm của quy tắc 2. Để cả gói đứng chờ một quyết định kế toán là lãng phí. Tiêu chí chọn vendor giữ nguyên thứ tự: (1) trùng hệ kế toán Holding đang dùng để khỏi đối soát 2 hệ thống, (2) có API + sandbox, (3) chi phí mỗi hoá đơn | PM | 2026-08-21 | F-H3, SOW-03 | **ĐÃ CHỐT** (⚠️ Q9 vẫn MỞ, chỉ hết chặn chặng 1) |
| D-15 | Wireframe app tài xế chưa nộp (yêu cầu gửi Thiết kế 2026-08-03) — SOW-04 chờ hay đi tiếp? | **Đi tiếp.** Xin Thiết kế nộp trước **3 màn ưu tiên** SCR-02 (ba con số lớn), SCR-05 (luồng QR 3 bước), SCR-08 (SOS) làm chuẩn phong cách. **7 màn còn lại nhà thầu SOW-04 vẽ theo**, G3 duyệt từng màn theo ràng buộc NF-12/NF-13 | Chính [YEU-CAU-WIREFRAME.md](design/YEU-CAU-WIREFRAME.md) đã đề nghị 3 màn này là đủ để khởi động. Để cả gói mobile đứng chờ một người là rủi ro lịch trình lớn nhất của SOW-04 | PM | 2026-08-21 | F-D1..D5, F-H1, F-I2, NF-12, NF-13, SOW-04 | **ĐÃ CHỐT** |
| D-16 | Hạ tầng triển khai đặt ở đâu, và dùng secret manager nào? (chặn NF-05, NF-06, NF-15 của SOW-01) | **Host tại Việt Nam** (VNG Cloud / Viettel IDC / FPT Cloud / CMC — chọn nhà cung cấp cụ thể ở bước mua sắm) + **HashiCorp Vault tự dựng** — xem [ADR-014](adr/ADR-014-ha-tang-trien-khai-va-vault.md) | Hai lý do độc lập cùng chỉ về một hướng: (1) **TR-04 yêu cầu thiết bị gửi về server tại VN** và Gate 2 ⑤ yêu cầu tuân thủ NĐ 13/2023, trong khi AWS/GCP/Azure **đều không có region tại VN**; (2) **NF-06 cần mTLS/chứng chỉ theo từng thiết bị, thu hồi được** — Vault có sẵn PKI engine làm đúng việc đó, còn giải pháp secret-only nào cũng phải dựng thêm một CA riêng, tức hai hệ thống thay vì một | PM (⚠️ cần Legal xác nhận phần NĐ13 và BLĐ duyệt ngân sách hạ tầng) | 2026-08-21 | NF-05, NF-06, NF-15, TR-04, SOW-01 | **ĐÃ CHỐT** (⚠️ ADR-014 đang NHÁP, chờ duyệt) |

## Q1–Q12 — chép nguyên trạng từ PRD sheet 14 ([docs/prd/14-decisions.md](prd/14-decisions.md))

| Mã | Câu hỏi | Phương án / Khuyến nghị (từ PRD) | Lý do | Người quyết | Deadline | Ảnh hưởng (F-xx)¹ | Trạng thái |
|---|---|---|---|---|---|---|---|
| Q1 | Đặc tả telematics Tri-Ring: trường dữ liệu, tần suất, giao thức, quyền truy cập BMS, môi trường test | Khuyến nghị: đưa thành phụ lục hợp đồng phân phối; yêu cầu môi trường mock từ Tri-Ring; nếu trễ → phương án B gateway OBD (sheet 13) | — | BLĐ G3 + Tri-Ring | 20/07/2026 (Gate 0) | F-G1, F-A1..A6 | MỞ |
| Q2 | Ai vận hành CSMS trạm sạc: G3 Network xây/vận hành hay G3 Energy thuê ngoài rồi tích hợp? | Khuyến nghị: G3 Network sở hữu CSMS (dựa SteVe) — vì đối soát 3 chiều & thanh toán QR cần kiểm soát sâu | — | BLĐ G3 Energy + Network | Q1/2026 | F-G2, F-C2, F-H1 | MỞ |
| Q3 | Giá gói Standard (VNĐ/xe/tháng) & chính sách gói năm | Mô hình giá dựa chi phí vận hành/xe (hạ tầng + bản đồ + SMS) đo từ pilot + khảo sát mức sẵn sàng chi trả | — | BLĐ + Sale | Trước Gate 2 | F-H4 | MỞ |
| Q4 | Chính sách xử lý vi phạm sạc: chỉ cảnh báo hay có chế tài (giảm quyền lợi, tính phí)? | Khuyến nghị P1: cảnh báo + hồ sơ; chế tài để hợp đồng quyết — phần mềm chỉ cung cấp bằng chứng | — | Legal + Bảo hành Mobility | Trước roll-out | F-B3, F-B5, F-B6 | MỞ |
| Q5 | Chọn nhà cung cấp bản đồ: VietMap vs Google vs Mapbox | Đo trong pilot: chi phí/xe/tháng, chất lượng bản đồ tuyến vận tải & vùng biên; khuyến nghị nghiêng VietMap nếu đạt chất lượng | — | PM + Dev | Cuối pilot (Gate 1) | F-D1..D3 | MỞ |
| Q6 | Đơn vị chịu trách nhiệm CSKH & cứu hộ 24/7: Holding tự vận hành hay thuê ngoài? | SOS ≤5 phút đòi hỏi trực 24/7 — cần quyết ngân sách & quy trình trước pilot (diễn tập là điều kiện Gate 2) | — | BLĐ Holding | Trước pilot | F-I1, F-I2 | MỞ |
| Q7 | Consent & chính sách dữ liệu tài xế (Nghị định 13/2023): văn bản pháp lý, luồng đồng ý khi kích hoạt | Legal soạn; tích hợp vào onboarding F-F2; đặc biệt với tài xế làm thuê (không phải chủ xe) | — | Legal | Trước pilot | F-F2, F-G4, NF-08 | MỞ |
| Q8 | Phiên bản OCPP: chỉ 1.6J hay yêu cầu 2.0.1 ngay từ mua sắm đợt đầu? | Khuyến nghị: vận hành 1.6J, điều khoản mua sắm yêu cầu trụ nâng cấp được 2.0.1 (bảo mật & Plug&Charge tương lai) | — | G3 Energy + Dev | Cùng hồ sơ mua sắm trụ | F-G2 | MỞ |
| Q9 | Nhà cung cấp hóa đơn điện tử & luồng kế toán doanh thu điện | Chọn 1 trong các nhà cung cấp HĐĐT phổ biến; khớp quy trình kế toán Holding | — | Kế toán Holding | Trước Gate 2 | F-H3 | MỞ |
| Q10 | Cấu trúc pháp lý & giấy phép cho sàn vận tải P2 (điều kiện KD, e-contract) | Legal nghiên cứu từ 2026 để không chặn Gate 3 | — | Legal | Trước Gate 3 (2027) | Module L–N (P2) | MỞ |
| Q11 | MOU nguồn cung/cầu 'mồi' P2 với InterLOG & HS Logistics: phạm vi, cam kết khối lượng | Đàm phán 2026–2027; là điều kiện cứng của Gate 3 | — | BLĐ | Trước Gate 3 | Module L (P2) | MỞ |
| Q12 | Chính sách giữ/khóa xe từ xa phục vụ thu hồi: ranh giới pháp lý & an toàn | Chỉ thao tác khi xe dừng & theo quy trình pháp lý; tuyệt đối không can thiệp khi xe đang chạy; Legal xác nhận | — | Legal + Vận hành | Trước roll-out | F-A5, F-J3 | MỞ |

¹ Cột "Ảnh hưởng (F-xx)" của Q1–Q12 do người chuyển đổi suy ra từ ngữ cảnh PRD (sheet 14 không có cột này) — cần review xác nhận.

## Q13–Q18 — MỚI ở PRD v3.0 (sheet 14, nền vàng: "phát sinh từ chỉ đạo của Lãnh đạo")

> ⚠️ Repo đang giữ bản chuyển đổi PRD **v2.0** trong `docs/prd/`. Sáu quyết định dưới đây
> chép từ **PRD v3.0**; phần `docs/prd/` chưa được cập nhật sang v3 — xem mục "Delta v2→v3".

| Mã | Câu hỏi | Phương án / Khuyến nghị (từ PRD v3) | Người quyết | Deadline | Ảnh hưởng | Trạng thái |
|---|---|---|---|---|---|---|
| Q13 | Chính sách **giá điện động** theo nguồn phát & khung giờ: ai sở hữu biểu giá, biên độ chênh cao/thấp điểm? | G3 Energy sở hữu biểu giá, G3 Network cung cấp công cụ hiển thị & điều hướng nhu cầu. Chênh lệch ≥15% mới đủ đổi hành vi tài xế; công bố trước để tránh khiếu nại (NF-19) | BLĐ G3 Energy + Network | Trước Gate 2 | F-C8, F-D6, NF-19 | MỞ |
| Q14 | Có làm **"HƯỚNG THỨ 2"** (phần mềm lập kế hoạch vận tải miễn phí + trợ lý ghép chuyến qua Zalo) song song P1 không? | CÓ nhưng **KHÔNG chen vào P1.0**: đội & ngân sách riêng, khởi động sau Gate 2. Đo bằng số nhà xe & số chuyến lập kế hoạch, không đo doanh thu | BLĐ + PM | Trước Gate 2 | (ngoài P1) | MỞ |
| Q15 | Chia sẻ dữ liệu & bản đồ với đối tác ngoài (Hanel, Be…): phạm vi, chiều trao đổi, chi phí, tuân thủ NĐ 13/2023 | Bắt đầu từ **bản đồ** (dễ định giá, ít rủi ro pháp lý), sau mới tới dữ liệu luồng di chuyển dạng tổng hợp/ẩn danh. Legal rà trước khi tích hợp; luôn giữ phương án chỉ dùng dữ liệu nội bộ | BLĐ + Legal | Bản đồ: trước Gate 2 · Dữ liệu: trước Gate 3 | Q5, F-D1..D3, NF-08 | MỞ |
| Q16 | Dịch vụ phi vận tải cho lái xe (ăn, giặt đồ, nghỉ, phụ kiện dùng điện) — G3 tự làm hay chỉ làm kênh? | Chỉ làm **KÊNH** (marketplace) và ăn chia, không tự vận hành. Tiện nghi dùng điện trên xe do G3 Mobility quyết cấu hình & an toàn điện | BLĐ Holding + G3 Mobility | 2027 (trước khi mở P2) | (P2) | MỞ |
| Q17 | Kết nối vận tải **đường sông**: tự tích hợp, hợp tác hay chưa làm? | Khảo sát nhu cầu chủ hàng trong pilot P2; nếu làm thì tích hợp API đối tác, **không** tự xây phần mềm vận tải thủy | BLĐ + PM P2 | Trước Gate 3 | (P2) | MỞ |
| Q18 | Đơn vị vận hành mạng lưới **sửa chữa & cứu hộ** cho F-I4: xưởng G3, đại lý Tri-Ring hay đối tác bên thứ ba theo khu vực? | Chốt cùng Q6 (CSKH 24/7). SLA tiếp nhận ≤15 phút phải khả thi trên **toàn tuyến khai thác** — nếu không thì công bố mức phủ thật thay vì hứa quá năng lực. Hợp đồng đối tác là điều kiện Gate 2 | BLĐ Holding + G3 Mobility | Trước roll-out | F-I4, NF-21, Q6 | MỞ |

**Q5 được sửa ở v3:** danh sách nhà cung cấp bản đồ bổ sung **"bản đồ do Be cung cấp"**, và
khuyến nghị đổi thành *"nghiêng phương án nội địa (VietMap/Be) nếu đạt chất lượng"*.
→ Củng cố quyết định của Prompt 10: portal **không** gắn cứng nhà cung cấp bản đồ nào
(xem `apps/portal/lib/ban-do.ts`).

## TR-01…TR-05 — câu hỏi kỹ thuật Tri-Ring (KHÔNG CÒN CHẶN từ 2026-08-21)

> Nguồn: [docs/integrations/tri-ring-tbox.md](integrations/tri-ring-tbox.md) — tổng hợp trao
> đổi 21–31/07/2026. Đây là phần **chưa trả lời** của Q1 (đặc tả telematics Tri-Ring), tách
> ra thành từng câu để theo dõi được.
>
> **Cả 5 mã đều đã hết chặn.** TR-01/TR-03 chốt ngày 2026-08-04 (phía VN chọn hệ GPS và model
> T-BOX). TR-02/TR-04/TR-05 hết chặn ngày 2026-08-21 qua **D-13** — khi G3 tự chọn T-BOX thì
> ba câu này không còn là câu hỏi cho Tri-Ring nữa, chúng là **tiêu chí chọn thiết bị**.
>
> ⚠️ Thứ còn chặn thật sự **không nằm trong bảng này**: **file DBC** (dự kiến 8/2026, chú
> thích tiếng Trung, cần dịch). Không có DBC thì không đọc được CAN của xe, dù dùng T-BOX nào.
> Đây mới là phần còn lại của Q1 và của tiêu chí **Gate 0 ①**.

| Mã | Câu hỏi | Rủi ro nếu không trả lời | Đã phòng vệ thế nào | Trạng thái |
|---|---|---|---|---|
| TR-01 | Hệ toạ độ GPS: **WGS-84 hay GCJ-02**? | GCJ-02 lệch **100–700 m** tại VN → geofence, gợi ý trạm, bản đồ đội đều sai đều mà không có dấu hiệu | **ĐÃ CHỐT = WGS-84** (xem dưới). Migration 0029 `devices.he_toa_do` giữ nguyên để kiểm chứng từng thiết bị | **ĐÃ CHỐT** |
| TR-02 | Giao thức lên server: **GB/T 32960 hay MQTT/JSON**? | Quyết định hình dạng adapter ingest | `ITelematicsSource` đã trừu tượng hoá; chỗ hở nhỏ: `payload` khai là JSON string, GB/T là nhị phân | **HẾT CHẶN** qua D-13 — G3 tự chọn T-BOX nên tự chọn luôn giao thức. Vẫn phải nới `payload` sang `string \| Uint8Array` nếu thiết bị trúng thầu nói nhị phân |
| TR-03 | Timestamp có phải **UTC** không? | TQ UTC+8 vs VN UTC+7 → lệch 1 giờ → **gắn cờ vi phạm bảo hành oan** toàn bộ phiên sạc đêm (ADR-010) | **ĐÃ CHỐT = giờ vận hành GMT+7, bản tin phải mang múi giờ tường minh** (xem dưới) | **ĐÃ CHỐT** |
| TR-04 | K4-E cấu hình gửi dữ liệu về **server tại Việt Nam** được không? | Nếu không → phải đổi terminal, ảnh hưởng kiến trúc backend | — | **HẾT CHẶN** qua D-13 + D-16 — thành **yêu cầu bắt buộc #4** trong hồ sơ mời thầu T-BOX, và hạ tầng đã chốt đặt tại VN |
| TR-05 | Bộ đệm offline **≥48 giờ**? | NF-09 yêu cầu store-and-forward ≥48h; chưa xác nhận thiết bị làm được | — | **HẾT CHẶN** qua D-13 — thành **yêu cầu bắt buộc #3** trong hồ sơ mời thầu T-BOX; nghiệm thu bằng bench test, không bằng lời hứa của nhà cung cấp |

### TR-01 ĐÃ CHỐT (2026-08-04, PM) — hệ toạ độ **WGS-84 (EPSG:4326)**

Phía G3 (Việt Nam) là bên chọn hệ thống GPS, nên không phải nhận theo Tri-Ring nữa.

**Chọn WGS-84 vì:** đó là hệ mà chính vệ tinh GPS phát ra (mọi module GNSS xuất WGS-84 ở
mức thô) · là SRID 4326 mà PostGIS đang dùng · là hệ của mọi nhà cung cấp bản đồ trong danh
sách Q5 (VietMap, Google, Mapbox, Be) · và là hệ của OpenStreetMap.

**Vì sao KHÔNG chọn VN-2000** dù đó là hệ quy chiếu quốc gia của Việt Nam: VN-2000 dành cho
đo đạc — bản đồ địa chính, hồ sơ đất đai, công trình. Nó không phải hệ mà thiết bị GNSS phát
ra, cũng không phải hệ mà bản đồ nền dùng, nên đưa vào luồng giám sát realtime chỉ thêm một
lần chuyển đổi và một chỗ để sai. Khi nào phải nộp dữ liệu cho cơ quan nhà nước theo VN-2000
thì chuyển đổi ở bước xuất báo cáo, không đổi cách lưu.

**GCJ-02 bị loại.** Đó là phép làm lệch bắt buộc với bản đồ dân dụng *trong lãnh thổ Trung
Quốc*, không có giá trị pháp lý hay kỹ thuật nào ở Việt Nam.

**Việc kéo theo — phải đưa vào hồ sơ mua sắm T-BOX:** yêu cầu thiết bị xuất toạ độ **WGS-84
thô, không áp GCJ-02**. Nhiều module GNSS sản xuất tại Trung Quốc bật phép lệch này theo mặc
định hoặc theo firmware. Không ghi vào hợp đồng thì rất dễ nhận thiết bị đã lệch sẵn.
Cột `devices.he_toa_do` giữ nguyên, nhưng đổi ý nghĩa: nay `chua_ro` là **"chưa kiểm chứng
trên thiết bị cụ thể này"**, không còn là "chưa quyết chính sách".

### TR-03 ĐÃ CHỐT (2026-08-04, PM) — giờ vận hành **GMT+7**, bản tin mang múi giờ tường minh

T-BOX do phía Việt Nam chọn nên đặt theo giờ Việt Nam. Việt Nam **không có giờ mùa hè**, nên
GMT+7 cố định quanh năm — bỏ được cả một lớp lỗi mà các nước có DST phải xử lý.

Cách hiện thực, tách làm ba tầng để không lẫn:

| Tầng | Quy ước | Đã có chưa |
|---|---|---|
| **Bản tin từ thiết bị** | `ts` phải mang **múi giờ tường minh**: `...Z` hoặc `...+07:00` | ✅ validator ép, thiếu thì vào quarantine |
| **Lưu trữ** | `timestamptz` (PostgreSQL quy về UTC) — **không đổi** | ✅ đã đúng từ migration 0003 |
| **Hiển thị & logic nghiệp vụ** | `Asia/Ho_Chi_Minh` (khung giờ ToU, báo cáo, portal) | ✅ `APP_TIMEZONE`, ADR-010 |

⚠️ **Điểm dễ hiểu nhầm — vì sao KHÔNG lưu thẳng giờ GMT+7 trong DB:** "để giờ GMT+7" là quy
ước *vận hành và hiển thị*, không phải cách lưu. `timestamptz` luôn quy về UTC bên trong;
đó là thứ khiến so sánh, sắp xếp và tính khoảng thời gian không phụ thuộc nơi chạy. Đổi sang
lưu giờ địa phương sẽ phá đối soát 3 chiều (F-C6) và cả bằng chứng bảo hành append-only.

⚠️ **Cái bẫy đã bịt:** chuỗi ISO **thiếu** múi giờ (vd `2026-08-04T14:30:00`) KHÔNG bị
`Date.parse` coi là lỗi — nó hiểu theo giờ **máy chạy ingest**. Máy dev ở Asia/Bangkok (+07)
ra đúng; container Docker mặc định **UTC** ra lệch **đúng 7 tiếng**. Lỗi nằm im cho tới lúc
đổi chỗ chạy, rồi biểu hiện thành gắn cờ vi phạm sạc oan (ADR-010). Nay validator bắt buộc
có múi giờ, có test khoá lại.

## Delta PRD v2.0 → v3.0 (chưa chuyển đổi vào `docs/prd/`)

`docs/prd/` hiện là bản chuyển đổi **v2.0**. So với **v3.0** (file
`G3 Network_Định hướng và Yêu cầu sản phẩm app__PRD__v3.xlsx`):

- **7 tính năng MỚI**, đều gắn nhãn "(MỚI v3.0)": `F-A7` dự báo tiêu hao pin & quãng đường
  theo địa hình · `F-A8` báo cáo hiệu quả sạc theo lái xe · `F-A9` nhận diện chuyến chạy
  rỗng · `F-C7` dự báo tải trạm & điều hướng phân tải · `F-C8` giá điện động theo nguồn &
  khung giờ · `F-D6` gợi ý thời điểm/trạm sạc tối ưu chi phí · `F-I4` kết nối mạng lưới sửa
  chữa & cứu hộ.
- **3 yêu cầu phi chức năng MỚI**: `NF-19` minh bạch giá điện (giá hiển thị = giá tính tiền,
  lưu log biểu giá theo từng phiên **≥5 năm**) · `NF-20` chất lượng mô hình dự báo (sai số
  quãng đường còn lại ≤10% p50 / ≤15% p90) · `NF-21` SLA tích hợp đối tác dịch vụ (tiếp nhận
  ≤15 phút, đổi đối tác theo khu vực **không phải sửa mã nguồn**).
- **6 quyết định MỚI** Q13–Q18 (bảng trên) + Q5 được sửa.

**Chưa có tính năng nào trong số này được xây** — toàn bộ là phạm vi mới, phần lớn phụ thuộc
quyết định đang MỞ (Q13 giá điện, Q15 dữ liệu đối tác). Cần một prompt riêng để chuyển đổi
PRD v3 vào `docs/prd/` trước khi lập kế hoạch xây.

⚠️ `NF-19` có ảnh hưởng tới phần **đã xây**: hiện đơn giá điện là một hằng số môi trường
(`CHARGING_PRICE_VND_PER_KWH`) dùng cho đối soát F-C6. NF-19 đòi **lưu biểu giá áp dụng theo
từng phiên và giữ ≥5 năm**. Khi làm F-C8 phải chuyển từ hằng số sang bảng biểu giá có version
(cùng kiểu `charging_policies` đã làm cho F-B1), nếu không sẽ không chứng minh được
"giá hiển thị = giá tính tiền" cho một phiên trong quá khứ.

## Nhật ký thay đổi
- **2026-08-21 · PM (Quốc Anh) · Chốt D-13…D-16 — gỡ chặn cả 4 gói thầu.**
  Bốn quyết định lấy sau khi rà [docs/handover/sow/](handover/sow/) và
  [tri-ring-tbox.md](integrations/tri-ring-tbox.md):
  - **D-13 — G3 tự chọn T-BOX**, không dùng K4-E. Hệ quả lớn nhất: **TR-02/TR-04/TR-05 hết
    chặn** vì chúng thành tiêu chí mua sắm thay vì câu hỏi chờ Tri-Ring trả lời.
  - **D-14 — tách SOW-03 làm 2 chặng**, chặng interface + mock khởi động ngay, không chờ Q9.
  - **D-15 — SOW-04 đi tiếp** với 3 màn wireframe ưu tiên, 7 màn còn lại nhà thầu vẽ + G3 duyệt.
  - **D-16 — host tại Việt Nam + HashiCorp Vault** ([ADR-014](adr/ADR-014-ha-tang-trien-khai-va-vault.md),
    NHÁP). TR-04 và NĐ 13/2023 cùng chỉ về VN, mà AWS/GCP/Azure đều không có region tại VN;
    NF-06 cần PKI theo thiết bị nên Vault gộp được hai nhu cầu vào một hệ thống.
  - **Số mục MỞ: 28 → 25.** Không còn nhóm nào **chặn hoàn toàn** một gói thầu. Ba phụ thuộc
    còn lại đều có đường đi vòng đã ghi rõ trong SOW: **file DBC** (SOW-02 — chặn phần đọc
    CAN, không chặn đặc tả mua sắm và adapter), **Q9** (SOW-03 — chỉ chặn chặng 2), **Q5**
    (SOW-04 — không chặn P1.0 vì F-D2 được phép mở app bản đồ ngoài).
- **2026-08-20 · Claude Code (Prompt 12) · Gói bàn giao nhà thầu.**
  Thêm [docs/handover/](handover/): `system-overview.md`, `feature-status.md` (đối chiếu
  **46 mã F-xx** với mã nguồn và test thật), `README.md` mục lục, và **4 gói thầu** trong
  `sow/` kèm Definition of Done lấy từ acceptance PRD + ngưỡng NF-xx + tiêu chí Gate 1/2.
  - **Đếm lại số mục MỞ trong chính file này: 28**, không phải 19 — 7 mã D-xx + **18 mã Q-xx**
    (Q1–Q18; con số 12 cũ có từ trước khi PRD v3.0 thêm Q13–Q18) + 3 mã TR-xx. Đã sửa cả ở
    `debt-register.md`.
  - **Đính chính `docs/architecture/system-overview.md`**: bảng map khối khai có *Map adapter*
    và *E-invoice adapter* trong `packages/contracts` — **không tồn tại cả hai**. Ảnh hưởng
    trực tiếp tới giá SOW-03 và SOW-04 (phải viết interface từ đầu, không phải thay mock).
  - **[CẦN LÀM RÕ]** `docs/prd/04-p1-chuc-nang.md` ghi *"tổng 23 tính năng"* cho P1.0 nhưng
    liệt kê **25 mã**. Đây là phạm vi hợp đồng của gói thầu — cần người viết PRD xác nhận.
  - **Sửa một lỗi chỉ lộ ra khi CHẠY**: `demo:tuan11` hỏng từ lượt chạy thứ hai vì hàm dọn
    dẹp bỏ sót 2 trong 4 bảng tham chiếu `charging_sessions`. Đã kiểm chứng bằng 3 lượt chạy
    liên tiếp trên DB bẩn. Ghi thêm **N-13** (dữ liệu load test làm nhiễu demo về sau, chưa
    sửa) → sổ nợ nay có **13 hạng mục**.
  - Cả 3 demo đã chạy kiểm chứng, mỗi demo **hai lượt liên tiếp**: gate0 HOÀN TẤT ·
    tuan8 9/9 ĐẠT · tuan11 12/12 ĐẠT.
- **2026-08-19 · Claude Code (Prompt 11, NF-04 + NF-14) · Load test 300 xe, khung quan sát hệ thống, sổ nợ kỹ thuật.**
  Thêm [ADR-013](adr/ADR-013-quan-sat-he-thong.md) (NHÁP): ba nguồn metric phân vai rõ
  (ingest = nhịp dòng dữ liệu · csms = nhịp OCPP · api = tồn kho đọc thẳng từ DB), và
  **"ingest gián đoạn" bắt bằng gauge mốc-thời-gian chứ không bằng `rate()`** — vì
  Prometheus không phân biệt được counter *đứng yên* với counter *không tồn tại*, nên cách
  viết bản năng `rate(...) == 0` sẽ im lặng đúng lúc ingest chết.
  - **Kết quả load test** ([docs/handover/load-test-300.md](handover/load-test-300.md)):
    NF-01 ĐẠT với biên rất rộng. **NF-02 thì KHÔNG kết luận được** — `ocpp-sim` chạy đúng
    một phiên mỗi trụ rồi chỉ heartbeat, nên chỉ có 30 mẫu dồn vào phút đầu. Báo cáo ghi
    "KHÔNG ĐỦ MẪU" thay vì ghi ĐẠT.
  - **Chưa nối Alertmanager** — 10 luật cảnh báo đã chạy trên Prometheus nhưng chưa gửi tới
    người nào, vì **Q6 (ai trực CSKH & cứu hộ 24/7) vẫn MỞ**. Không tự quyết kênh trực.
  - **Không tự tối ưu gì** sau load test: NF-01/NF-02 không vỡ nên không có gì để tối ưu, và
    prompt yêu cầu nêu đề xuất chứ không tự sửa.
  - Thêm [docs/handover/debt-register.md](handover/debt-register.md) — 12 hạng mục nợ, phân
    mức, **không sửa hạng mục nào**. Nặng nhất: `GET /alerts` trả toạ độ xe trong
    `payload` mà không ghi audit log, đi vòng qua đúng cơ chế `requireOpenTicket` của
    quy tắc 5 / NF-06.
- **2026-08-04 · Claude Code · Nhận tài liệu kỹ thuật Tri-Ring + PRD v3.0.** Ghi TR-01…TR-05,
  Q13–Q18 và delta v2→v3 vào log này; tạo [docs/integrations/tri-ring-tbox.md](integrations/tri-ring-tbox.md).
  **Hai bản sửa phòng vệ trong code** (không quyết thay ai, chỉ để hỏng-âm-thầm thành hỏng-kêu-to):
  - `devices.he_toa_do` (migration 0029) — TR-01 chưa trả lời, mà trộn GCJ-02 vào kho SRID 4326
    là hỏng **không cứu lại được**: trong bảng không còn gì phân biệt hàng nào theo hệ nào.
  - metric `g3_ingest_lech_dong_ho_total` — TR-03 chưa trả lời. Phát hiện: `observeLag()` kẹp
    lag ÂM về 0, nên một T-BOX gửi UTC+8 gắn nhãn UTC (sớm 1 giờ) vẫn cho NF-01 **xanh** trong
    khi ADR-010 nói đúng hậu quả là gắn cờ vi phạm bảo hành oan toàn bộ phiên sạc đêm.
  - **KHÔNG làm**: 7 tính năng mới của v3 (F-A7…F-I4) và schema GB/T 32960 mở rộng (điện áp
    từng cell, nhiệt độ theo điểm đo, điện trở cách điện) — chờ file DBC tháng 8/2026 và các
    quyết định đang MỞ. Lý do chưa thêm cột rỗng: cột không ai ghi chỉ làm schema khó đọc.
- **2026-08-03 · PM (Quốc Anh) · CHỐT D-01 = CÓ — làm CẢ HAI: app tài xế + portal đội xe.** Gỡ chặn Prompt 09 (F-D1/D2/D4) và phần mặt tiền của F-H1..H4, F-K1, F-I2. Ghi chú về thẩm quyền: cột "Người quyết" của D-01 ghi là **BLĐ**; quyết định này do PM đưa ra theo đúng tiền lệ D-03/D-04/D-10/D-11 — **cần BLĐ phê chuẩn hình thức trước Gate 1**, vì D-01 kéo theo ngân sách app store, bản đồ (Q5) và trực CSKH 24/7 (Q6). Nếu BLĐ lật lại, phần hỏng là mặt tiền app; backend F-H1/F-I2 đã làm vẫn dùng được cho portal.
  - **KHÔNG gỡ được các chặn khác**: Prompt 09 vẫn dừng vì **chưa có wireframe** trong `docs/design/screens/` — chuẩn **INPUT-03 §2** (bộ prompt-kit, ngoài repo) quy định wireframe là đầu vào bắt buộc trước Prompt 09, và chính Prompt 09 yêu cầu dừng nếu thiếu. Xem [yêu cầu wireframe](design/YEU-CAU-WIREFRAME.md).
  - Vẫn MỞ và vẫn giới hạn phạm vi app: **Q5** (nhà cung cấp bản đồ — F-D1/D2 đi qua interface `IMapProvider`, Phase 1 dùng Google free tier), **D-02** (RFID ở trụ — không đổi luồng tiền), **D-09/Q6** (ai trực CSKH 24/7 — nút SOS gọi được API nhưng chưa có người thật đầu bên kia), **Q9** (hoá đơn điện tử hợp lệ cho F-H3), **Q3** (giá gói F-H4).
- 2026-08-03 · Claude Code · Lập [PHIẾU THẨM ĐỊNH](PHIEU-THAM-DINH.md) — gom TOÀN BỘ giá trị do Claude Code tự đặt (ngưỡng an toàn pin, tiêu chí "thường xuyên", rate-limit, đơn giá điện GIẢ), 9 ADR đang nháp, 11 mục phân quyền phải suy luận, và các mục MỞ đang chặn việc — kèm cột "hỏng thế nào nếu sai" và cách áp giá trị mới sau khi ký (không cần sửa code).
- 2026-07-17 · Claude Code (Prompt 01) · Chốt D-04 = Fastify theo kế hoạch Prompt 01 được PM duyệt; chi tiết tại docs/adr/ADR-001-chon-fastify.md.
- 2026-07-17 · Claude Code (Prompt 01) · Q1..Q12 chưa chép được vì PRD chưa có trong repo (docs/prd/ trống, chờ Prompt 02).
- 2026-07-18 · Claude Code (Prompt 02) · Chép Q1–Q12 nguyên trạng từ PRD sheet 14 (trạng thái MỞ); thêm D-05..D-09 từ ghi chú review của Đức (docs/prd/review-notes-duc.md); bổ sung F-H2..H4, F-K1 vào phạm vi ảnh hưởng D-01 theo ghi chú của Đức.
- 2026-07-28 · Claude Code (Prompt 06) · D-03 vẫn MỞ nhưng Gate 0 ③ bắt buộc có cảnh báo pin: PM duyệt kế hoạch dùng **quy tắc tạm** không đụng định nghĩa "chuyến" (chống spam theo vòng đời cảnh báo + biên trễ 5% SOC) — chi tiết và các câu hỏi cần chốt ở [ADR-006](adr/ADR-006-chong-spam-canh-bao-pin.md). Khi D-03 chốt thì sửa `dedup_key` và hàm `quyetDinhCanhBao`.
- 2026-07-28 · Claude Code (Prompt 06) · Thêm D-10 (vùng địa lý dữ liệu mô phỏng) và D-11 (hiệu suất sạc trong đối soát) — cả hai phát hiện khi chạy thật demo Gate 0. D-11 có ADR nháp [ADR-007](adr/ADR-007-hieu-suat-sac-doi-soat.md) và là điều kiện của Gate 1.
- **2026-07-29 · PM · CHỐT D-03, D-10, D-11 và DUYỆT [ADR-006](adr/ADR-006-chong-spam-canh-bao-pin.md) + [ADR-007](adr/ADR-007-hieu-suat-sac-doi-soat.md)** (cả hai chuyển NHÁP → ĐÃ DUYỆT):
  - **D-03**: bỏ hẳn khái niệm "chuyến" cho F-A2 — quy tắc trong ADR-006 thành quyết định chính thức. Không phát sinh thay đổi code.
  - **D-10**: làm cả hai hướng — seed thêm trạm phía Bắc *và* vehicle-sim thêm tuyến miền Nam.
  - **D-11**: một hệ số hiệu suất sạc toàn hệ, giữ 1.0 ở Phase 1. Không phát sinh thay đổi code.
  - Còn MỞ trong ADR-007 (không chặn Prompt 06): ai hiệu chuẩn hệ số trong pilot, và nguồn đơn giá điện thật (liên quan Q3/Q9).
- 2026-07-30 · Claude Code (Prompt 07, F-I2) · **D-09 và Q6 vẫn MỞ — đã dựng KHUNG KỸ THUẬT, không tự quyết nghiệp vụ.** F-I2 là Must P1.0 nên không hoãn được: đã làm endpoint SOS (tự đính kèm mã lỗi/SOC/vị trí/cảnh báo đang mở từ DB), ticket ưu tiên CAO, đồng hồ SLA 5 phút và leo thang khi chưa ai nhận. Phần **chưa làm vì thuộc D-09/Q6**: quy trình gọi lại, phân ca trực 24/7, cam kết dịch vụ thật, và kênh hotline dự phòng khi app không có mạng (tiêu chí F-I2 có nhắc "fallback gọi hotline"). Cùng tiền lệ mà PM đã duyệt ở ADR-006: làm phần không phụ thuộc quyết định mở, ghi rõ phần còn lại.
- 2026-07-30 · Claude Code (Prompt 07, F-A4) · Thêm [ADR-009](adr/ADR-009-nguong-bat-thuong-pin.md) (NHÁP): ngưỡng phát hiện bất thường pin để trong bảng `anomaly_rules`, và **ba con số mặc định (55°C · 30V/60s · danh sách mã lỗi BMS) CHƯA được nhà sản xuất pin thẩm định** — PRD không cho con số, đặc tả BMS Tri-Ring vẫn ở Q1 (MỞ). Cần người ký ba ngưỡng này trước Gate 1; tới lúc đó cảnh báo F-A4 chỉ là tín hiệu vận hành, không dùng làm căn cứ bảo hành.
- 2026-07-30 · Claude Code (Prompt 07, F-A2) · **Câu chữ Prompt 7.1 đã bị D-03 thay thế — KHÔNG làm theo.** Prompt 7.1 yêu cầu định nghĩa "chuyến" (= chạy lại sau ≥30 phút nghỉ) và ghi vào ADR, nhưng D-03 đã CHỐT ngày 2026-07-29 là **bỏ hẳn** khái niệm "chuyến" cho F-A2 ([ADR-006](adr/ADR-006-chong-spam-canh-bao-pin.md) đã DUYỆT). Prompt-kit soạn trước ngày chốt. Người dùng xác nhận giữ D-03 → chống spam vẫn theo SOC hồi phục + biên trễ, không phát sinh khái niệm mới. Ngưỡng thì chuyển từ hằng số cứng sang bảng `battery_alert_thresholds` (migration 0018) — đây là yêu cầu *khác* của 7.1 và không đụng D-03.
- 2026-08-03 · Claude Code (Prompt 08.4, F-H1) · **D-01, D-02, Q2, Q3, Q9 VẪN MỞ — đã làm phần BACKEND không phụ thuộc chúng.** Đã có: luồng quét QR → RemoteStart → sạc → StopTransaction → tạo giao dịch → thanh toán → webhook idempotent, với 2 cài đặt `IPaymentGateway` (mock nội bộ + VNPay **SANDBOX**). **Chưa làm vì thuộc quyết định mở**: màn hình quét QR trên điện thoại (D-01 — app tài xế), đường thẻ RFID ở trụ (D-02), đơn giá điện thật và hoá đơn điện tử hợp lệ (Q3/Q9 — hiện dùng giá GIẢ). **Chưa làm vì Ranh giới CLAUDE.md**: cổng production (có rào chắn kỹ thuật từ chối khởi động), lưu dữ liệu thẻ (interface cố tình không có trường nào, có test quét OpenAPI + schema DB), và Momo (giao nhà thầu). Thêm [ADR-012](adr/ADR-012-thanh-toan-sandbox.md) (NHÁP) giải thích vì sao giao dịch neo vào phiên OCPP chứ không vào phiên sạc.
- 2026-08-01 · Claude Code (Prompt 08.2, F-B3/F-B5) · **Q4 VẪN MỞ — đã dựng KHUNG BẰNG CHỨNG, KHÔNG tự quyết chế tài.** Hệ thống hiện chỉ ghi vi phạm kèm bằng chứng bất biến và cảnh báo tài xế/chủ xe kèm cách khắc phục. **Chưa làm vì thuộc Q4**: trừ điểm tuân thủ, đổi `vehicles.warranty_state`, tính phí, hay bất kỳ chế tài tự động nào. Phần đã làm nằm gọn trong khuyến nghị của chính PRD cho Q4 ("P1: cảnh báo + hồ sơ; chế tài để hợp đồng quyết"). Thêm [ADR-011](adr/ADR-011-tieu-chi-vi-pham-sac.md) (NHÁP) — trong đó **ngưỡng "thường xuyên" 3 lần / 30 ngày là do Claude Code đặt, CHƯA được Bảo hành Mobility / nhà sản xuất pin / Legal thẩm định**; cùng loại vấn đề với ADR-009, cần ký trước Gate 1. Tới lúc đó, kết luận `soc_above_max`/`soc_below_min` chỉ là tín hiệu nhắc tài xế, không phải căn cứ từ chối bảo hành.
- 2026-08-01 · Claude Code (Prompt 08.1, F-B1) · Thêm [ADR-010](adr/ADR-010-version-chinh-sach-sac.md) (NHÁP): cách đánh version chính sách sạc (tạo version mới là INSERT thuần, trigger chặn sửa đè & xoá), thứ tự ưu tiên phạm vi **xe > đội > dòng xe**, quy tắc kế thừa ngưỡng khi lên version, và múi giờ của khung giờ ToU (`APP_TIMEZONE`, mặc định `Asia/Ho_Chi_Minh`). Ba điểm này PRD không nói nhưng không quyết thì không code được — cần PM + Bảo hành Mobility duyệt. **Q4 vẫn MỞ và ADR-010 KHÔNG đụng tới**: ADR chỉ định nghĩa chính sách là gì và version nào áp cho phiên nào, phần chế tài vi phạm để Prompt 08.2 nêu lại.
- 2026-07-30 · Claude Code (Prompt 07, F-F3) · Thêm **D-12**: F-J3 yêu cầu báo tamper cho "Quản lý rủi ro" nhưng vai trò đó không tồn tại trong sheet 9 lẫn enum `user_role` → tạm cấu hình cho `admin`/`fleet_manager`/`cskh`, không tự thêm vai trò. Thêm [ADR-008](adr/ADR-008-rate-limit-thong-bao.md) (NHÁP) về rate-limit thông báo: chỉ chặn kênh chen ngang, không chặn in-app, không bao giờ chặn severity 3.
