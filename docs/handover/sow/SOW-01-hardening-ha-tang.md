# SOW-01 — Hardening & Hạ tầng vận hành

> **Gói thầu 1/4** · Điều kiện chung: `standards/INPUT-05-nha-thau.md` trong prompt-kit +
> [CLAUDE.md](../../../CLAUDE.md). Bối cảnh:
> [system-overview.md](../system-overview.md) · Hiện trạng: [feature-status.md](../feature-status.md).
>
> **Nghiệm thu bằng demo + test chạy trước mặt G3, không nghiệm thu bằng slide.**

## 1. Mục tiêu gói

Đưa hệ thống từ trạng thái *"chạy được trên máy dev"* sang *"chịu được pilot 20–30 xe
và đứng vững trước Gate 2"*. Gói này **không thêm tính năng nghiệp vụ nào** — toàn bộ là
bịt lỗ hổng, siết mạng, dựng khả năng vận hành.

Đây là gói **phải làm trước** SOW-02 và SOW-03 ở phần bảo mật đường truyền: không thể
cắm thiết bị thật vào một broker MQTT đang cho phép publish không cần xác thực.

## 2. Phạm vi công việc

### 2.1 Bịt lỗ hổng đã biết (nguồn: [debt-register.md](../debt-register.md))

| Mã | Nội dung | Mức |
|---|---|---|
| **N-01** | `GET /alerts` trả vị trí xe **không ghi audit log** — vi phạm quy tắc 5 & NF-06 | 🔴 |
| **N-02** | `POST /sos` chép vị trí xe vào `tickets.vehicle_context`, không audit | 🟠 |
| **N-03** | EMQX cho phép publish telemetry **không cần xác thực** — thiết bị giả mạo bơm được dữ liệu dùng cho quyết định bảo hành | 🟠 |
| **N-04** | API và mọi cổng `/metrics`, `/health` bind ra **toàn bộ mạng** thay vì 127.0.0.1 | 🟠 |
| **N-05** | **5 job chạy nền không có test nào** (devices, payments, reconciliation, tickets, violations) | 🟠 |
| **N-06** | 3 biến môi trường dùng trong mã nhưng thiếu trong `.env.example` — trong đó `PAYMENT_MOCK_SECRET` là secret | 🟡 |
| **N-07** | `HttpCsmsCommander` (cầu nối thanh toán → trụ sạc) không có test | 🟡 |
| **N-09** | `ocpp-sim` chỉ chạy **một phiên mỗi trụ** rồi heartbeat → **NF-02 chưa từng đo dưới tải** và job đối soát không có dữ liệu để chạy | 🟠 |
| **N-10 / N-12** | `npm run lint` đỏ · file rác `90%` vẫn đang được git theo dõi | 🟡 / ⚪ |
| **N-11** | 3 file mã nguồn thiếu mã F-xx ở đầu file (quy tắc 1) | ⚪ |
| **N-13** | `npm run loadtest` để lại **300 xe** trong DB; 280 xe ngừng phát khi lượt đo kết thúc → mọi lượt `demo:gate0` sau đó sinh **~280 cảnh báo tamper giả** và ~1430 thông báo | 🟡 |

Bổ sung phát hiện khi đóng gói bàn giao (chưa có trong debt-register):

- `.prettierignore` chưa loại trừ `.claude/worktrees/` → `npm run lint` đỏ trên máy dev
  dù CI xanh. Sửa cùng N-10.
- **`tools/demo-tuan11` không có test nào.** Lỗi khoá ngoại đã sửa ở Prompt 12 (mục 3b của
  debt-register) lẽ ra phải bị một test bắt. Xếp cùng nhóm N-05.

### 2.2 Ngưỡng NF chưa có gì

| Mã | Yêu cầu PRD | Hiện trạng |
|---|---|---|
| **NF-05** | TLS 1.2+ khi truyền · mã hoá khi lưu · secret trong vault | Toàn bộ chạy HTTP/MQTT trần trên localhost; secret trong `infra/.env` |
| **NF-06** | mTLS / token định danh **theo từng thiết bị**, **thu hồi được** khi mất thiết bị | Cột `devices.mtls_identity` có sẵn, **chưa dùng** |
| **NF-03** | Uptime ≥99,5%/tháng · on-call rotation | Có 10 luật cảnh báo Prometheus nhưng **chưa nối Alertmanager** — cảnh báo chưa tới được người thật |
| **NF-15** | Backup **RPO ≤15 phút · RTO ≤4 giờ** · diễn tập khôi phục 2 lần/năm | **Chưa có script backup nào**; dữ liệu nằm trong volume Docker local |
| **NF-07** | Pen-test bên thứ ba, lỗi nghiêm trọng = 0 | Chưa thuê — nhà thầu **phối hợp và sửa**, việc thuê là của G3 |
| **NF-16** | Retention **cold 5 năm** (hot 12 tháng đã có) | Chưa có tầng cold |

### 2.3 Việc kèm theo

- Nối Alertmanager vào 10 luật cảnh báo đã có, định tuyến theo mức độ.
- Runbook vận hành: mất ingest, mất CSMS, DB đầy, khôi phục từ backup.
- Kịch bản diễn tập khôi phục dữ liệu, chạy được và có biên bản.

## 3. Ngoài phạm vi

Tính năng nghiệp vụ mới · tích hợp phần cứng (SOW-02) · thanh toán production (SOW-03) ·
màn hình app tài xế (SOW-04) · **thuê đơn vị pen-test** (G3 làm).

## 4. Điều kiện tiên quyết & quyết định MỞ

| Mã | Nội dung | Chặn hạng mục nào |
|---|---|---|
| **Q6** | Ai vận hành CSKH & cứu hộ 24/7 | NF-03 — chưa biết định tuyến cảnh báo tới đâu, không cấu hình Alertmanager dứt điểm được |
| **D-12** | Vai trò nhận cảnh báo tháo thiết bị (ma trận chưa có "Quản lý rủi ro") | Phân quyền `device_tamper` |
| — | Chọn vault (chưa có mã quyết định) | NF-05 — **cần ADR trước khi code** |
| — | Hạ tầng triển khai thật (cloud nào, VPC, ai giữ khoá) | NF-05, NF-15 |

> Nếu một hạng mục phụ thuộc mục MỞ: **dừng lại và nêu ra trong báo cáo tuần**, không tự
> giả định. Đây là ranh giới trong CLAUDE.md, áp dụng cho nhà thầu y như đội nội bộ.

## 5. Definition of Done

Nghiệm thu từng mục, không nghiệm thu cả gói một lần.

### 5.1 Từ acceptance PRD

- [ ] **F-F1** — mọi truy cập dữ liệu vị trí xe qua API ghi audit log: ai · lúc nào · xe nào ·
      lý do. Chứng minh: gọi `GET /alerts` và `POST /sos` rồi đếm dòng `audit_logs` —
      phải khớp 1:1, có test tự động khoá lại.
- [ ] **F-J3** — cảnh báo tháo thiết bị gửi đúng vai trò đã được duyệt ở D-12 (không tự thêm
      vai trò mới — quy tắc 6).

### 5.2 Từ ngưỡng NF-xx

- [ ] **NF-05** — TLS 1.2+ trên mọi kênh truyền (API, MQTT, WebSocket OCPP); dữ liệu mã hoá
      khi lưu; **không còn secret nào ngoài vault**. `gitleaks git .` sạch trên toàn lịch sử.
- [ ] **NF-06** — mỗi thiết bị có định danh riêng (mTLS hoặc token theo thiết bị);
      **thu hồi một thiết bị thì thiết bị đó publish thất bại ngay**, chứng minh bằng demo trực tiếp.
- [ ] **NF-03** — cảnh báo đi hết đường tới người trực: bịt ingest → alert nổ → **người nhận
      được thật** (không phải chỉ hiện trên Grafana). Có tài liệu on-call rotation.
- [ ] **NF-15** — backup tự động đạt **RPO ≤15 phút**; diễn tập khôi phục đạt **RTO ≤4 giờ**,
      đo bằng đồng hồ trước mặt G3, có biên bản.
- [ ] **NF-16** — tầng cold 5 năm chạy được; dữ liệu quá 12 tháng chuyển sang cold mà truy vấn
      bảo hành vẫn lấy lại được.
- [ ] **NF-04 / NF-02** — sau khi sửa N-09, chạy lại `npm run loadtest -- --vehicles 300
      --stations 10 --minutes 30`: **NF-02 phải có mẫu trải đều cả lượt chạy**, không dồn vào
      phút đầu; NF-10 phải có phiên sạc thật để đối soát.
- [ ] **NF-18** — 5 job chạy nền và `HttpCsmsCommander` có test; `npm test` xanh toàn bộ.

### 5.3 Từ tiêu chí Gate

- [ ] **Gate 2 ②** — uptime ≥99,5% đo được trong suốt pilot, có số liệu Prometheus chứng minh.
- [ ] **Gate 2 ④** — pen-test bên thứ ba hoàn tất, **lỗi nghiêm trọng = 0**. Nhà thầu sửa
      hết phát hiện nghiêm trọng và chứng minh bằng lượt quét lại.
- [ ] **Gate 2 ⑤** — tuân thủ Nghị định 13/2023 ở phần kỹ thuật: mã hoá, kiểm soát truy cập,
      audit đầy đủ, retention đúng chính sách. Legal xác nhận phần văn bản (ngoài phạm vi gói).

### 5.4 Điều kiện chung mọi PR (quy tắc 1–12)

- [ ] Mỗi PR mang mã F-xx hoặc mã mục N-xx/NF-xx trong tên nhánh, commit, comment đầu file, mô tả PR.
- [ ] Test đi kèm **trong cùng PR** với code. Sửa test cũ cho "qua" thay vì sửa code = vi phạm nghiêm trọng.
- [ ] PR >500 dòng thay đổi phải chia nhỏ.
- [ ] Thay đổi kiến trúc/thư viện lớn → **ADR được duyệt trước khi code**.
- [ ] Biến môi trường mới → thêm vào `infra/.env.example` (không kèm giá trị thật) + ghi chú README.
- [ ] **Simulator và toàn bộ test mock tiếp tục xanh** (test hồi quy) sau mọi thay đổi.
- [ ] OpenAPI cập nhật: `npm run openapi:generate` cho diff rỗng.

## 6. Cách nghiệm thu

| Bước | Làm gì |
|---|---|
| 1 | Máy sạch của G3: `npm install` → `docker compose up -d` → `npm run demo:gate0` chạy hết, không lỗi |
| 2 | `npm test` xanh toàn bộ · `npm run lint` xanh · `gitleaks git .` sạch toàn lịch sử |
| 3 | Diễn tập trực tiếp: thu hồi 1 thiết bị · bịt ingest chờ alert tới người · khôi phục backup bấm đồng hồ |
| 4 | Đối chiếu từng ô checkbox mục 5 trước mặt G3 |
