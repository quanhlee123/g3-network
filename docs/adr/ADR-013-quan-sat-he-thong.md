# ADR-013: Quan sát hệ thống — ba nguồn metric, và cách phát hiện "ingest gián đoạn"

Ngày: 2026-08-19 · Người đề xuất: Claude Code (Prompt 11, NF-14) · Người duyệt: (chờ duyệt) · Trạng thái: NHÁP

## Bối cảnh

NF-14 yêu cầu **"Dashboard sức khỏe hệ thống & pipeline; alert khi ingest gián đoạn"**, kèm
gợi ý công cụ "Prometheus/Grafana + logging". Phase 1 chỉ cần mức KHUNG.

Ba ràng buộc định hình quyết định:

1. **Hệ có ba tiến trình chạy dài, không phải một.** `apps/api` (Fastify), `services/ingest`
   (MQTT), `services/csms` (WebSocket OCPP). Ingest và CSMS **không** phải Fastify nên không
   dùng lại được route `/health` sẵn có của API.
2. **Một số con số chỉ database mới biết.** Số cảnh báo đang mở, số phiên đối soát lệch —
   không tiến trình nào giữ chúng trong bộ nhớ, và chúng phải đúng cả sau khi service khởi
   động lại.
3. **Kiểu hỏng nguy hiểm nhất của NF-14 là hỏng ÂM THẦM.** Ingest đứt không làm ai báo lỗi:
   API vẫn trả 200, portal vẫn hiện dữ liệu — chỉ là dữ liệu cũ dần. Không ai phát hiện cho
   tới khi có người hỏi "sao xe này 3 tiếng rồi không thấy nhúc nhích?".

## Quyết định

### 1. Ba nguồn metric, phân vai để không đếm trùng

| Nguồn | Trả lời câu hỏi | Cách lấy số |
|---|---|---|
| `services/ingest` (:9464) | Dòng dữ liệu xe có chảy không, nhanh không? | Đếm trong tiến trình, ngay tại chỗ xử lý |
| `services/csms` (:9465) | Trạng thái trụ về có kịp không? | Đếm trong tiến trình |
| `apps/api` (:3000) | TỒN KHO nghiệp vụ trong DB đang thế nào? | **Truy vấn DB mỗi lần scrape** |

Một chỉ số chỉ có **một** nguồn chịu trách nhiệm. Ví dụ cảnh báo: ingest đếm *cảnh báo vừa
bắn* (counter, cho biết nhịp), API đếm *cảnh báo đang mở* (gauge, cho biết tồn kho). Hai con
số này khác nhau về bản chất nên không bao giờ phải đối chiếu xem cái nào đúng.

Cổng `/health` + `/metrics` dùng chung nằm ở `packages/observability` (`OpsServer`), để ba
service không mỗi nơi tự chế một kiểu.

### 2. "Ingest gián đoạn" phát hiện bằng gauge MỐC THỜI GIAN, không bằng `rate()`

`services/ingest` xuất `g3_ingest_last_message_timestamp_seconds` — unix time của bản tin
hợp lệ gần nhất. Luật cảnh báo:

```promql
time() - g3_ingest_last_message_timestamp_seconds > 120
```

### 3. `/health` trả HTTP 503 khi phụ thuộc hỏng, và mỗi phép kiểm tra có trần thời gian riêng

Probe hạ tầng đọc **mã trạng thái**, không parse JSON. Mỗi phép kiểm tra (DB, MQTT) có trần
2 giây; quá hạn tính là hỏng chứ không treo — probe treo tệ hơn probe báo hỏng, vì
orchestrator không phân biệt được "đang chờ" với "đã chết".

### 4. Dashboard và nguồn dữ liệu Grafana là MÃ NGUỒN, nạp từ file, `allowUiUpdates: false`

Sửa trên giao diện Grafana sẽ không được lưu ngược lại file. Muốn đổi thì sửa
`infra/monitoring/grafana/dashboards/g3-tong-quan.json` và đi qua PR.

### 5. Phase 1 KHÔNG nối Alertmanager

10 luật cảnh báo đã viết và Prometheus đã nạp, nhưng chúng chỉ hiện trên giao diện
Prometheus/Grafana — **chưa gửi tới người nào**.

## Lý do & các phương án đã loại

**Vì sao không dùng `rate()` để bắt ingest đứt.** Đây là điểm dễ sai nhất và cũng là lý do
chính của ADR này. Cách viết bản năng là:

```promql
rate(g3_ingest_records_total[5m]) == 0
```

Nó **không** làm được việc. Prometheus không phân biệt được một counter *đứng yên* với một
counter *không tồn tại*: nếu chính tiến trình ingest chết, chuỗi thời gian biến mất khỏi
Prometheus, biểu thức không khớp gì cả, và luật **không kêu** — đúng lúc phải kêu to nhất.
Gauge mốc-thời-gian không có vấn đề đó: chừng nào Prometheus còn scrape được thì
`time() - gauge` vẫn lớn dần; còn nếu scrape cũng chết thì luật `ServiceKhongPhanHoi`
(`up == 0`) bắt.

**Vì sao API truy vấn DB mỗi lần scrape thay vì đếm trong RAM.** Đếm trong RAM rẻ hơn nhưng
sai sau mỗi lần khởi động lại, và mù trước mọi thay đổi do người vận hành làm tay trên DB.
Với các con số dùng để **quyết định vận hành** (còn bao nhiêu cảnh báo nguy cấp chưa xử lý),
sai kiểu đó nguy hiểm hơn là tốn vài truy vấn mỗi 15 giây. Kèm rào chắn: trần 5 giây cho cả
lượt truy vấn, và nếu đọc DB hỏng thì **vẫn trả metric** kèm cờ
`g3_api_metrics_scrape_error = 1` — mất hẳn target thì khó chẩn đoán hơn là thấy cờ báo lỗi.

**Vì sao thêm gauge p95 thay vì chỉ dùng histogram.** Bucket của `g3_ingest_lag_seconds` là
`[1, 5, 10, 30, 60, 300, 3600]`. Ngưỡng NF-01 là 30s, rơi đúng vào một mép bucket rất rộng
(10→30): `histogram_quantile` nội suy tuyến tính trong đó có thể sai hàng chục giây — tức là
sai đủ để đảo ngược kết luận "đạt hay vỡ NF-01". Gauge
`g3_ingest_lag_p95_5m_seconds` tính p95 thật trên từng mẫu của cửa sổ 5 phút. Giữ **cả hai**:
histogram cho hình dạng phân bố, gauge cho việc kết luận ngưỡng.

**Phương án đã loại:**

- *Một registry Prometheus toàn cục dùng chung* — loại vì nhiều instance app trong cùng tiến
  trình test sẽ đụng nhau ở registry mặc định của `prom-client` và ném "metric đã tồn tại".
  Mỗi nơi một `Registry` riêng.
- *Thêm cột `ingested_at` vào `telematics_readings` để đo trễ hậu kiểm* — loại vì đó là
  migration đụng hypertable đang có dữ liệu, trong khi metric trong tiến trình đã đo đúng
  định nghĩa NF-01 ("timestamp thiết bị vs ingest"). Nếu về sau cần truy vết trễ theo từng
  xe thì mở lại phương án này bằng ADR riêng.
- *Đẩy log tập trung (Loki/ELK) ngay Phase 1* — hoãn. NF-14 có nhắc "log tập trung", nhưng
  Phase 1 chạy 3 tiến trình trên một máy, `docker compose logs` và `load-test-logs/` đủ dùng.
  Thêm một kho log nữa lúc này là chi phí vận hành không đổi lấy được gì.

## Hệ quả

**Chấp nhận:**

- Mỗi lần Prometheus scrape `apps/api` là 5 truy vấn DB. Ở chu kỳ 15 giây là 20 truy vấn/phút
  — không đáng kể so với tải ingest (đo được ~27 bản tin/giây × nhiều truy vấn mỗi bản tin).
- `infra/monitoring/prometheus.yml` **hardcode cổng** `9464`/`9465`/`3000`. Prometheus không
  đọc biến môi trường trong file cấu hình, nên đổi cổng ở `infra/.env` mà quên sửa file này
  thì target sẽ DOWN. Đã ghi cảnh báo ngay trong file, trong `.env.example` và trong README.
- Prometheus scrape service chạy **trên máy** qua `host.docker.internal`. Trên Linux cần
  `extra_hosts: host-gateway` (đã thêm). Khi nào đóng gói service vào compose thì đổi lại
  thành tên service.

**Việc phát sinh (chưa làm, đã ghi vào `docs/handover/debt-register.md`):**

- Nối Alertmanager — chặn bởi **Q6** (ai trực 24/7) đang MỞ trong `docs/DECISION-LOG.md`.
- `/metrics` và `/health` hiện nghe trên mọi interface mạng (N-04 trong sổ nợ).
- Chưa có metric cho `apps/portal` và `apps/mobile` (client-side). Phase 1 không cần.

**Ảnh hưởng tài liệu:** `README.md` (mục "Quan sát hệ thống"),
`docs/architecture/system-overview.mmd` + `.md` (khối `quansat`), `infra/.env.example`
(4 biến mới).
