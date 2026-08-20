# Sổ nợ kỹ thuật — rà soát toàn repo theo CLAUDE.md

**Ngày rà soát:** 2026-08-19 · **Phạm vi:** toàn bộ repo `g3-network`, sau Prompt 11.

> Tài liệu này viết để **anh chọn thứ tự sửa**, không phải để tự sửa. Không hạng mục nào
> trong đây đã được sửa, trừ hai chỗ ghi rõ "ĐÃ SỬA trong Prompt 11".
>
> Nguyên tắc viết: **trung thực**. Hạng mục nào tôi chỉ nghi mà chưa chứng minh được thì
> ghi rõ là nghi. Cuối tài liệu có mục 5 liệt kê những thứ tôi **đã kiểm và thấy SẠCH** —
> đọc mục đó để biết bản rà soát này đã sờ tới đâu, chứ không phải chỉ liệt kê cái xấu.

## Cách đọc mức độ

| Mức | Nghĩa là gì | Xử lý |
|---|---|---|
| 🔴 **NGHIÊM TRỌNG** | Chạm tới AN TOÀN, TIỀN hoặc PHÁP LÝ. Nếu để nguyên tới lúc có xe thật thì có thể gây thiệt hại không sửa lại được | Sửa trước Gate 2 |
| 🟠 **CAO** | Vi phạm rõ một quy tắc trong CLAUDE.md, hoặc bịt một lỗ hổng kiểm soát | Sửa trong Phase 1 |
| 🟡 **TRUNG BÌNH** | Nợ thật nhưng chưa gây hại ngay; càng để lâu càng đắt | Xếp lịch |
| ⚪ **THẤP** | Dọn dẹp, tiện nghi | Làm khi rảnh tay |

---

## 1. Vi phạm quy tắc 1–12 (CLAUDE.md)

### 🔴 N-01 · Quy tắc 5 — `GET /alerts` trả VỊ TRÍ XE mà không ghi audit log

- **Quy tắc bị vi phạm:** số 5 — *"Mọi truy cập dữ liệu VỊ TRÍ XE qua API phải ghi audit log"*
  (NF-06, Nghị định 13/2023).
- **Ở đâu:** [`apps/api/src/routes/alerts.ts:90`](../../apps/api/src/routes/alerts.ts) —
  trường `payload: Type.Unknown()` được trả về **nguyên vẹn** từ cột `alerts.payload`.
- **Vì sao đó là vị trí xe:**
  - Cảnh báo `geofence` nhét thẳng toạ độ vào payload:
    [`services/ingest/src/geofence.ts:127`](../../services/ingest/src/geofence.ts) →
    `{ lat, lng, … }`.
  - Cảnh báo pin nhét `tram_goi_y` (trạm gần nhất + số km):
    [`services/ingest/src/battery-alerts.ts`](../../services/ingest/src/battery-alerts.ts) —
    "cách trạm Bắc Giang 3,2 km" là định vị xe với sai số vài km.
- **Vì sao NGHIÊM TRỌNG, không phải chỉ khó coi:** vai trò `cskh` được cấu hình
  `'vehicle.location.read': { scope: 'all', requireOpenTicket: true }` — nghĩa là **phải có
  ticket đang mở mới được xem vị trí**. Nhưng cũng chính vai trò đó có
  `'alert.read': { scope: 'all' }` **không kèm điều kiện gì**. Nên CSKH lấy được vị trí xe
  qua `/alerts` mà (a) không cần ticket, (b) không để lại dấu vết trong `audit_logs`.
  Toàn bộ cơ chế kiểm soát của quy tắc 5 bị đi vòng qua bằng một endpoint khác.
- **Bằng chứng đọc được:** [`apps/api/src/auth/permissions.ts:213–229`](../../apps/api/src/auth/permissions.ts).
- **Đề xuất (chưa làm):** ba hướng, cần anh chọn —
  1. Lọc payload trước khi trả: bỏ `lat`/`lng`/`tram_goi_y` trừ khi người gọi có
     `vehicle.location.read` hợp lệ (kèm ticket nếu là CSKH). *Ít rủi ro nhất.*
  2. Ghi `audit_logs` cho mọi lần `/alerts` trả về cảnh báo có toạ độ. *Giữ nguyên dữ liệu,
     nhưng làm phình bảng audit.*
  3. Không lưu toạ độ trong `alerts.payload` nữa, chỉ lưu `reading_id` trỏ về
     `telematics_readings`. *Sạch nhất về mô hình dữ liệu, nhưng cần migration và sửa cả
     ingest lẫn portal.*
- **Không tự sửa vì:** hướng 1 và 3 đổi hợp đồng API (payload đang là `Unknown`, portal
  đang đọc gì trong đó thì phải kiểm), hướng 2 đổi khối lượng ghi audit. Đây là quyết định
  về quyền riêng tư, không phải quyết định kỹ thuật thuần.

### 🟠 N-02 · Quy tắc 5 — `POST /sos` chép vị trí xe vào `tickets.vehicle_context`, không audit

- **Ở đâu:** [`apps/api/src/modules/tickets/sos.ts:34–35`](../../apps/api/src/modules/tickets/sos.ts)
  đọc `ST_Y(position)`, `ST_X(position)` rồi ghi vào cột `tickets.vehicle_context`;
  [`apps/api/src/routes/tickets.ts:72`](../../apps/api/src/routes/tickets.ts) gọi nó mà
  không gọi `writeAuditLog`.
- **Nhẹ hơn N-01 ở chỗ:** `GET /tickets` **không** trả `vehicle_context` ra ngoài (đã kiểm),
  và người bấm SOS chính là tài xế của xe đó.
- **Nhưng vẫn là nợ:** toạ độ được **sao chép sang một bảng khác**, nơi ai đọc thẳng DB
  cũng thấy, và không có dòng nào trong `audit_logs` nói ai đã làm việc sao chép đó.
- **Đề xuất:** ghi 1 dòng audit `action = 'vehicle_location.copied_to_ticket'` ngay trong
  `taoSos`, kèm `ticket_id`.

### 🟠 N-03 · Quy tắc 12 + NF-06 — EMQX cho phép publish telemetry KHÔNG cần xác thực

- **Kiểm chứng trực tiếp:**
  ```
  $ docker exec g3-emqx emqx ctl conf show authentication
  authentication = []
  $ docker exec g3-emqx emqx ctl listeners
  tcp:default   listen_on : 0.0.0.0:1883
  ```
- **Nghĩa là:** bất kỳ máy nào trong cùng mạng LAN đều publish được lên
  `g3/telemetry/{vin}` với VIN bất kỳ, và `services/ingest` sẽ ghi thẳng vào
  `telematics_readings`.
- **Vì sao đáng lo hơn vẻ ngoài:** dữ liệu này là **bằng chứng bảo hành**. NF-06 viết rõ
  lý do: *"Chặn thiết bị giả mạo bơm dữ liệu — dữ liệu này dùng cho quyết định bảo hành"*.
  Cột `devices.mtls_identity` đã có trong schema từ migration 0001 nhưng **chưa chỗ nào
  dùng tới** — mới là chỗ để dành.
- **Phase 1 chấp nhận được tới đâu:** đang chạy simulator trên máy cá nhân nên chưa gây
  hại. Nhưng NF-07 (pen-test, lỗi nghiêm trọng = 0) là điều kiện Gate 2, và đây gần như
  chắc chắn sẽ là phát hiện đầu tiên của bên pen-test.
- **Đề xuất:** bật authentication của EMQX ở mức tối thiểu (username/password theo thiết bị,
  đọc từ biến môi trường) rồi mới tính tới mTLS. Cần 1 ADR vì đụng cách provisioning (F-F2)
  cấp thông tin đăng nhập cho thiết bị.

### 🟠 N-04 · Quy tắc 12 — API và mọi cổng `/metrics`, `/health` đang bind ra toàn bộ mạng

- **Ở đâu:**
  - [`apps/api/src/index.ts:64`](../../apps/api/src/index.ts) — `host: '0.0.0.0'`
  - [`packages/observability/src/ops-server.ts`](../../packages/observability/src/ops-server.ts) —
    `server.listen(port)` không nêu host ⇒ Node mặc định nghe mọi interface
  - [`services/csms/src/http.ts:53`](../../services/csms/src/http.ts) — cổng
    RemoteStart/RemoteStop nội bộ, cũng nghe mọi interface
  - Hai script demo (`tools/demo-gate0`, `tools/demo-tuan8`) cùng kiểu.
- **Nghĩa là:** ai ngồi chung Wi-Fi quán cà phê với máy đang chạy demo đều gọi được
  `POST /internal/remote-start` để **bật một trụ sạc**, và đọc được toàn bộ `/metrics`.
- **Sắc thái cần nói cho đúng:** `0.0.0.0` là *toàn bộ interface của máy*, **không phải**
  internet công cộng — muốn ra internet còn cần NAT/port-forward. Nên đây là vi phạm tinh
  thần quy tắc 12 chứ chưa phải "đã expose ra internet". Prometheus và Grafana **đã** bind
  `127.0.0.1` (làm trong Prompt 11).
- **Đề xuất:** thêm biến `BIND_HOST` mặc định `127.0.0.1`; muốn test từ điện thoại thật
  qua LAN thì đặt tường minh. Một chỗ sửa, nhiều file dùng.

### 🟠 N-05 · Quy tắc 7 — 5 job chạy nền không có test nào

- **Ở đâu (mỗi file là một `setInterval` giữ cho tính năng sống):**

  | File | Giữ tính năng gì | Test |
  |---|---|---|
  | `apps/api/src/modules/reconciliation/scheduler.ts` | Đối soát 3 chiều NF-10 | ❌ 0 |
  | `apps/api/src/modules/tickets/scheduler.ts` | Đồng hồ SLA 5 phút của SOS (F-I2) | ❌ 0 |
  | `apps/api/src/modules/violations/scheduler.ts` | Gắn cờ vi phạm sạc (F-B5) | ❌ 0 |
  | `apps/api/src/modules/payments/scheduler.ts` | Nối giao dịch với phiên về muộn (F-H1) | ❌ 0 |
  | `apps/api/src/modules/devices/scheduler.ts` | Quét thiết bị im lặng (F-J1) | ❌ 0 |

- **Điều dễ hiểu nhầm:** *phần logic* của cả 5 việc này **đã có test rất kỹ**
  (`reconcile.test.ts` 17 test, `detect.test.ts` 18 test, `health-scan.test.ts` 16 test…).
  Cái thiếu là **phần bấm giờ**: chưa test câu hỏi *"một lượt chạy ném lỗi thì cái hẹn giờ
  còn sống không, hay chết luôn và từ đó không ai đối soát nữa mà cũng không ai biết?"*
- **Vì sao là nợ thật:** quy tắc 7 liệt kê đối soát 3 chiều và SOS là luồng trọng yếu bắt
  buộc có test. Một scheduler chết âm thầm thì mọi test logic ở trên đều vô nghĩa trong
  vận hành thật — và triệu chứng duy nhất là "sao dạo này không thấy cảnh báo lệch nữa".
- **Đề xuất:** mỗi scheduler 3 test dùng đồng hồ giả của vitest — (a) chạy đúng chu kỳ,
  (b) một lượt ném lỗi thì lượt sau vẫn chạy, (c) `dung()` thì dừng hẳn.

### 🟡 N-06 · Quy tắc 3 — 3 biến môi trường dùng trong mã nhưng thiếu trong `.env.example`

| Biến | Dùng ở | Vì sao đáng ngại |
|---|---|---|
| `PAYMENT_MOCK_SECRET` | `packages/payments` | Là **secret ký webhook** của cổng giả. Không có trong file mẫu ⇒ máy mới không biết phải đặt, và người ta sẽ để mặc định |
| `PAYMENT_MOCK_PAY_URL` | `packages/payments` | Địa chỉ trang trả tiền giả |
| `CSMS_URL` | `simulators/ocpp-sim` | Địa chỉ CSMS cho trụ ảo |

- **Quy tắc 3 nói:** *"Mọi biến mới phải thêm vào `infra/.env.example` (KHÔNG kèm giá trị
  thật) và ghi chú trong README"*. `NODE_ENV` cũng nằm ngoài danh sách nhưng đó là biến
  chuẩn của Node — không tính.
- **Đề xuất:** thêm 3 dòng vào `.env.example` (để trống với `PAYMENT_MOCK_SECRET`) + bảng
  biến trong README. Nhỏ, nhưng đúng chỗ dễ quên nhất.

### 🟡 N-07 · Quy tắc 2 — `HttpCsmsCommander` (cầu nối thanh toán → trụ sạc) không có test

- **Ở đâu:** [`apps/api/src/modules/payments/csms-client.ts`](../../apps/api/src/modules/payments/csms-client.ts)
  — bản cài đặt `ICsmsCommander`, gọi `fetch` sang HTTP nội bộ của CSMS.
- **Vì sao đáng chú ý:** đây là đúng đoạn *"tài xế đã trả tiền → trụ phải nhả điện"*.
  Interface có mock, mock có test; **bản thật thì chưa**. Chưa ai kiểm điều gì xảy ra khi
  CSMS trả 500, hay khi request treo (có timeout không?).
- **Đề xuất:** test với một HTTP server giả — trường hợp thành công, CSMS trả lỗi, và CSMS
  không trả lời trong X giây.

### 🟡 N-08 · NF-09 — buffer store-and-forward KHÔNG có giới hạn, và mốc 48 giờ chưa được test

- **Ở đâu:** [`simulators/vehicle-sim/src/buffer.ts`](../../simulators/vehicle-sim/src/buffer.ts) —
  `#records: TelemetryRecord[]` chỉ có `push`, không có trần.
- **Hai vấn đề tách bạch:**
  1. **Không có trần:** NF-09 yêu cầu đệm ≥48 giờ. Ở chu kỳ 10 giây, 48 giờ = **17.280 bản
     ghi/xe**. Mất sóng lâu hơn nữa thì mảng cứ lớn mãi cho tới khi hết RAM. Trên simulator
     thì chỉ là một tiến trình Node chết; trên **T-BOX thật** thì đúng cái nó phải sống sót.
  2. **Chưa test tới ngưỡng:** test dài nhất hiện có là `offlineMinutes: 120` — **2 giờ**,
     bằng 1/24 yêu cầu. Nghĩa là con số 48 giờ trong PRD chưa từng được kiểm chứng lần nào.
- **Đề xuất:** thêm trần theo *số giờ dữ liệu* (không phải số bản ghi — chu kỳ có thể đổi),
  chính sách đầy thì bỏ bản ghi CŨ NHẤT hay MỚI NHẤT phải do anh chọn (bỏ cũ nhất giữ được
  bức tranh gần đây; bỏ mới nhất giữ được liên tục lịch sử). Cộng 1 test chạy đủ 48 giờ ảo.

### 🟠 N-09 · NF-02 chưa từng được đo DƯỚI TẢI — `ocpp-sim` chỉ chạy một phiên rồi nghỉ

- **Ở đâu:** [`simulators/ocpp-sim/src/index.ts:108–120`](../../simulators/ocpp-sim/src/index.ts)
  — `await Promise.allSettled(sims.map((sim) => sim.runSession()))` gọi **đúng một lần**,
  sau đó chỉ còn `setInterval(… heartbeat())`.
- **Hậu quả đo được, không phải suy đoán:** trong lượt load test 30 phút vừa chạy, tổng số
  `StatusNotification` là **30** (10 trụ × 3 lần đổi trạng thái), tất cả trong khoảng
  **một phút đầu**. Kiểm chứng bằng Prometheus:
  ```
  g3_ocpp_status_lag_seconds_count  →  30, đứng yên suốt 30 phút
  ```
- **Nghĩa là:** con số "p95 trễ trạng thái trụ = 0,47s ✅ ĐẠT" nói về **lúc 10 trụ cùng
  khởi động khi hệ còn rảnh**, KHÔNG nói về NF-02 khi hệ đang gánh 300 xe. Báo cáo
  [load-test-300.md](load-test-300.md) đã được sửa để **không** kết luận ĐẠT cho NF-02 mà
  ghi "KHÔNG ĐỦ MẪU".
- **Vì sao xếp CAO:** NF-02 là một trong hai ngưỡng hiệu năng mà Gate 2 nghiệm thu. Hiện
  không có cách nào đo nó dưới tải, nên không ai biết nó đạt hay không.
- **Đề xuất:** thêm cờ `--loop` (hoặc `--sessions N`) cho `ocpp-sim` để trụ lặp chu kỳ
  cắm → sạc → rút liên tục. Việc này còn có tác dụng phụ đáng giá: sinh phiên sạc liên tục
  thì **job đối soát 3 chiều (NF-10) mới có dữ liệu thật để chạy** — hiện nó cũng đang
  không có phiên mới nào trong lúc load test.

### 🟡 N-10 · `npm run lint` đang ĐỎ vì một file rác ngoài repo

- **Triệu chứng:**
  ```
  $ npm run lint ; echo $?
  [warn] .claude/worktrees/dreamy-faraday-431fb7/.claude/settings.local.json
  1
  ```
- **Chuyện gì xảy ra:** `.claude/worktrees/` là thư mục làm việc tạm của công cụ, **đã nằm
  trong `.gitignore`** nên không vào git — nhưng `.prettierignore` thì chưa loại nó, mà
  prettier đọc `.prettierignore` chứ không đọc `.gitignore`.
- **Vì sao xếp TRUNG BÌNH chứ không THẤP:** Definition of Done bắt "toàn bộ test xanh".
  Một lệnh gác cổng lúc nào cũng đỏ vì lý do vô nghĩa thì chỉ vài hôm là mọi người quen mắt
  bỏ qua nó — và hôm nó đỏ thật thì không ai để ý.
- **Đề xuất:** thêm 1 dòng `.claude` vào `.prettierignore`. Sửa 1 dòng, nhưng tôi không tự
  làm vì anh đã dặn không sửa hàng loạt — và đây là thứ nên gộp chung một lượt dọn.

### ⚪ N-11 · Quy tắc 1 — 3 file mã nguồn thiếu mã F-xx ở đầu file

- `apps/api/src/generate-openapi.ts` · `tools/demo-gate0/src/index.ts` ·
  `tools/demo-tuan8/src/khung-gio.ts`
- (`apps/portal/next-env.d.ts` là file Next.js tự sinh — không tính.)
- **Đề xuất:** thêm dòng chú thích đầu file. `generate-openapi.ts` thuộc quy tắc 11
  (sinh OpenAPI), hai file demo thuộc NF-18.

### ⚪ N-12 · File rác `90%` ở gốc repo

- File rỗng 0 byte, tạo ngày 2026-08-03, gần như chắc chắn do gõ nhầm lệnh shell
  (`... > 90%`). Không ảnh hưởng gì, nhưng nó nằm ngay gốc repo nên ai clone về cũng thấy.
- **Đề xuất:** xoá. Tôi không tự xoá vì CLAUDE.md cấm xoá/ghi đè thứ không phải của mình
  mà chưa hỏi.

---

## 2. Ngưỡng NF chưa có gì (không phải "sót", mà là "chưa tới lượt")

Những mục này **chưa vi phạm quy tắc nào** — Phase 1 cố ý chưa làm. Liệt kê ở đây để
trước Gate 2 không ai tưởng là đã xong.

| Mã | Yêu cầu | Hiện trạng | Ai chặn |
|---|---|---|---|
| NF-05 | TLS 1.2+ khi truyền · mã hóa khi lưu · secret trong vault | Tất cả chạy HTTP/MQTT trần trên localhost. Secret nằm trong `infra/.env` (gitignore), chưa có vault | Cần quyết chọn vault |
| NF-06 | mTLS / token theo thiết bị, **thu hồi được** | Cột `devices.mtls_identity` có sẵn, chưa dùng. Xem N-03 | Cần ADR |
| NF-07 | Pen-test bên thứ ba, lỗi nghiêm trọng = 0 | Chưa thuê | BLĐ |
| NF-15 | Backup RPO ≤15 phút · RTO ≤4 giờ · diễn tập 2 lần/năm | Chưa có script backup nào; volume Docker local | Cần quyết hạ tầng triển khai |
| NF-03 | Uptime ≥99,5%/tháng · on-call rotation | Đã có metric và 10 luật cảnh báo (Prompt 11), **chưa nối Alertmanager** nên cảnh báo chưa tới được người | Q6 (ai trực 24/7) đang MỞ |
| NF-12 | Giao diện tài xế: chữ lớn, tương phản cao, ≤3 chạm | `apps/mobile` **mới có khung**: cấu hình, tầng API, đăng nhập OTP, bảng 10 màn hình. **Chưa vẽ màn hình nào** | Chờ wireframe của Thiết kế — đã ghi rõ trong `App.tsx` và `docs/design/YEU-CAU-WIREFRAME.md` |

## 3. Tính năng đang chờ quyết định MỞ

`docs/DECISION-LOG.md` còn **28 mục** ở trạng thái MỞ, đếm lại ngày 2026-08-20:
**7 mã D-xx** (D-02, D-05, D-06, D-07, D-08, D-09, D-12) · **18 mã Q-xx** (Q1–Q18) ·
**3 mã TR-xx** (TR-02, TR-04, TR-05).

> ✏️ **Đính chính:** bản trước của mục này ghi "12 mục Q-xx" — con số đó có từ trước khi
> PRD v3.0 bổ sung Q13–Q18 vào sheet 14, và không tính 3 câu hỏi kỹ thuật Tri-Ring.
> Phát hiện khi đóng gói bàn giao nhà thầu (Prompt 12).

Theo mục "Ranh giới" của CLAUDE.md tôi không tự quyết. Ba mục chặn việc trước mắt nhất:

| Mã | Chặn gì |
|---|---|
| **Q6** — ai vận hành CSKH & cứu hộ 24/7 | Chưa nối được cảnh báo tới người thật (NF-03, NF-14) — luật alert đã có nhưng chưa biết gửi đi đâu |
| **D-12** — vai trò nhận cảnh báo tháo thiết bị | `device_tamper` đang tạm cấu hình cho `admin`+`fleet_manager`+`cskh`; ma trận phân quyền chưa có vai trò "Quản lý rủi ro" |
| **Q5** — chọn nhà cung cấp bản đồ | Cảnh báo pin đang gợi ý trạm bằng khoảng cách **đường chim bay** (PostGIS), không phải quãng đường thật theo tuyến |

Và bốn mục **chặn thẳng vào gói thầu** (xem [sow/](sow/)):

| Mã | Chặn gói nào |
|---|---|
| **Q1 · TR-02 · TR-04 · TR-05** | **SOW-02** không khởi động được — chưa có đặc tả telematics thì không viết được adapter |
| **Q9** | **SOW-03** — chưa chọn nhà cung cấp hóa đơn điện tử, toàn bộ F-H3 đứng |
| **Q5** + wireframe của Thiết kế | **SOW-04** — chưa có bản đồ và chưa có wireframe thì không dựng được 10 màn hình |
| **Chọn vault** (chưa có mã quyết định) | **SOW-01** — NF-05 cần ADR trước khi code |

## 3a. 🟡 N-13 · Dữ liệu load test làm nhiễu demo về sau — **chưa sửa**

Phát hiện khi chạy `demo:gate0` để kiểm chứng gói bàn giao (Prompt 12). Chính demo tự bắt được:

```
⚠ 280 cảnh báo tamper trong khi chỉ 1 xe bị cắt nguồn — cần xem lại
│ Cảnh báo nghi tháo thiết bị (F-J3)        │   280 │
│ Thông báo đã gửi tới người dùng (F-F3)    │  1430 │
```

**Nguyên nhân.** `npm run loadtest` seed **300 xe** `G3-SIM-VIN-nnnn` và để lại trong DB
(`npm run db:seed` bình thường chỉ tạo 21 xe). Khi lượt load test kết thúc, 280 xe đó ngừng
gửi telemetry **mà không có LWT** — đúng chữ ký "bản tin cuối bình thường rồi im bặt" mà
F-J3 dùng để phân biệt tháo thiết bị với mất sóng (ADR-003). Nên mỗi lượt `demo:gate0` sau
đó sinh 280 cảnh báo tamper và ~1430 thông báo.

**Đây KHÔNG phải lỗi logic F-J3** — với dữ liệu nó nhìn thấy thì kết luận đúng. Nhưng nó là
**bẫy vận hành**: nhà thầu chạy load test một lần rồi demo trước mặt G3 sẽ có một màn hình
đầy cảnh báo giả.

**Cách né ngay bây giờ** — reset DB trước khi demo:

```bash
docker compose -f infra/docker-compose.yml down -v && docker compose -f infra/docker-compose.yml up -d && npm run db:migrate && npm run db:seed
```

**Đề xuất sửa** (chưa làm, để người quyết): `tools/load-test` dọn 300 xe của chính nó khi kết
thúc, hoặc `demo:gate0` chỉ tính cảnh báo trên các xe thuộc lượt chạy hiện tại. Điểm cộng của
hiện trạng: bảng tóm tắt của demo **tự nêu bất thường** thay vì im lặng cho qua — giữ tính chất
này khi sửa.

## 3b. ĐÃ SỬA trong Prompt 12 — `demo:tuan11` không chạy lại được lần thứ hai

Phát hiện khi **chạy thật** lúc đóng gói bàn giao, không phát hiện được bằng đọc mã:

```
✖ Demo hỏng: update or delete on table "charging_sessions" violates foreign key
  constraint "reconciliation_results_session_id_fkey" on table "reconciliation_results"
```

**Nguyên nhân.** Hàm dọn dẹp của `tools/demo-tuan11/src/index.ts` xoá phiên sạc demo cũ theo
thứ tự `alerts → violations → violation_checks → charging_sessions`, nhưng **bốn** bảng tham
chiếu `charging_sessions`, không phải hai: còn `reconciliation_results` và
`payment_transactions`.

**Vì sao không ai thấy sớm hơn.** Lần chạy ĐẦU trên DB sạch luôn xanh — lúc đó chưa job nào
quét qua phiên vừa dựng. Chỉ từ lần chạy THỨ HAI, sau khi job đối soát của `apps/api` đã kịp
chạy, khoá ngoại mới chặn. Đúng loại lỗi mà "chạy demo hai lần" bắt được còn đọc mã thì không.

**Đã sửa:** thêm hai lệnh xoá trước khi xoá `charging_sessions` (cả hai bảng đều không có
trigger append-only nên không phải tắt/bật gì). **Đã kiểm chứng bằng 3 lượt chạy liên tiếp
trên DB bẩn: 12/12 tiêu chí ĐẠT cả ba lượt.**

> ⚠️ Còn nợ: `tools/demo-tuan11` **không có test nào**. Lỗi này lẽ ra phải bị một test bắt.
> Xếp cùng nhóm với N-05 (5 job chạy nền không có test).

## 4. Hai chỗ ĐÃ SỬA trong Prompt 11 (ghi để khỏi tìm lại)

1. **`gitleaks` báo 2 leak giả** trong `tools/load-test/src/bao-cao.ts`: tên metric
   `g3_reconciliation_results` và `g3_reconciliation_lech_max_pct` bị luật `generic-api-key`
   bắt vì entropy cao. Đã đánh dấu `// gitleaks:allow` **từng dòng** kèm giải thích —
   cố ý không cho cả file vào allowlist, để file vẫn bị quét bình thường về sau.
2. **`scripts/setup-env.mjs` chỉ sinh được `JWT_SECRET`.** Đã tổng quát hoá thành danh sách
   biến cần sinh, thêm `GRAFANA_ADMIN_PASSWORD` — máy mới `npm install` xong là
   `docker compose up` chạy được ngay, `.env.example` vẫn để trống (quy tắc 3).

---

## 5. Đã kiểm và thấy SẠCH

Đọc mục này để biết bản rà soát đã sờ tới đâu — "không có tên trong mục 1" khác hẳn với
"chưa ai nhìn tới".

| Quy tắc | Kiểm bằng cách nào | Kết quả |
|---|---|---|
| **1** — mã F-xx trong file | Quét 5 dòng đầu của mọi file `.ts` không phải test | Sạch, trừ 3 file ở N-10 |
| **2** — tích hợp ngoài qua `packages/contracts` | Tìm `import mqtt`, `from 'ws'`, `fetch(` trong logic nghiệp vụ | Sạch. Ba chỗ chạm thư viện ngoài đều là **file adapter** và tự ghi rõ điều đó: `mqtt-source.ts`, `ws-server.ts` (*"CHỈ file này đụng lib ws"*), `csms-client.ts` (cài đặt `ICsmsCommander`) |
| **3** — không hardcode secret | `npm run gitleaks` | **Sạch** (sau khi xử lý 2 báo động giả ở mục 4) |
| **4** — `charging_sessions`, `violations` append-only | Đọc migration 0005 + 0006 | Cả hai bảng đều có `TRIGGER … BEFORE UPDATE OR DELETE` gọi `forbid_update_delete()` — chặn ở **tầng DB**, không phải chỉ ở ứng dụng. Có `packages/db/src/append-only.test.ts` |
| **6** — RBAC mặc định TỪ CHỐI | `apps/api/src/app.test.ts:75` — test *"MỌI route đã đăng ký đều khai báo public / authenticated / permission"* | Sạch. Route `/metrics` mới thêm cũng khai `public: true` và qua được test này |
| **8** — `schema_version` từ ngày 1 | Đọc migration 0003 | `schema_version smallint NOT NULL DEFAULT 1`, đang ở v2 sau migration 0021 |
| **9** — migration đánh số, không sửa file cũ | `git log --name-only -- packages/db/migrations` | **Sạch tuyệt đối**: 29 migration, mỗi file xuất hiện đúng **một** commit. Chưa file nào bị sửa sau khi merge |
| **11** — OpenAPI cập nhật | Chạy `npm run openapi:generate`, xem `git status` | `openapi.json` **không đổi** ⇒ đặc tả đang khớp mã. `/metrics` cố ý ẩn (`schema: { hide: true }`) vì là endpoint hạ tầng |
| **12** — dữ liệu giả | Tìm SĐT/VIN trông thật | Sạch. Chỉ có `0912345678` trong chuỗi *hướng dẫn nhập liệu* của `apps/mobile/src/i18n/vi.ts` |
| **7** — test luồng trọng yếu | Đếm test theo từng luồng | Phần **logic** phủ tốt: cảnh báo pin 25 test · pipeline ingest 26 · đối soát 17 · vi phạm 18 · thanh toán 17 (**có cả** "webhook đến 2 lần" và "webhook đến trước khi phiên đóng") · SOS 13 · RBAC 16. Chỗ thiếu là **scheduler** (N-05) và `HttpCsmsCommander` (N-07) |
| TODO/FIXME bỏ quên | Quét `TODO|FIXME|HACK|XXX|@ts-ignore` toàn repo | **Không có cái nào** trong mã tự viết. Hai `eslint-disable` còn lại đều có lý do ghi tại chỗ; `@ts-ignore` chỉ nằm trong `apps/portal/.next/` (Next.js tự sinh) |

---

## 6. Nếu phải chọn thứ tự, tôi đề nghị thế này

Đây là gợi ý, quyền chọn là của anh.

1. **N-01** (vị trí xe rò qua `/alerts`) — vì nó vô hiệu hoá một kiểm soát đã có, và là
   thứ Legal sẽ hỏi đầu tiên khi rà Nghị định 13.
2. **N-10** (`lint` đỏ) — 1 dòng, làm ngay để cổng gác không bị nhờn.
3. **N-09** (`ocpp-sim` lặp phiên) — mở khoá việc đo NF-02 dưới tải VÀ cấp dữ liệu thật cho
   job đối soát NF-10. Một việc, gỡ hai chỗ mù.
4. **N-05** (test scheduler) — bảo vệ những gì Prompt 06–08 đã dựng khỏi chết âm thầm.
5. **N-06** (3 biến env) — nhỏ, và `PAYMENT_MOCK_SECRET` là secret.
6. **N-03 + N-04** (xác thực MQTT, bind host) — nên gộp một đợt "siết mạng", cần ADR.
7. Còn lại xếp theo lịch.
