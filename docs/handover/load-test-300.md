# Load test 300 xe — kết quả đo (NF-04)

> Tài liệu này do `npm run loadtest` sinh ra. Chạy lại là ghi đè.
> Cách chạy lại nằm ở cuối file. Dữ liệu GIẢ 100% (quy tắc 12).

- **Bắt đầu:** 2026-08-19T11:15:27.594Z
- **Kết thúc:** 2026-08-19T11:45:29.421Z
- **Thời lượng thực đo:** 30.0 phút (đặt 30 phút)
- **Tải:** 300 xe · 10 trụ sạc · xe gửi mỗi 10s
- **Chu kỳ lấy mẫu:** 15s · 120 mẫu

## 1. Kết luận theo ngưỡng PRD

| Mã | Yêu cầu | Ngưỡng | Đo được | Kết luận |
|---|---|---|---|---|
| NF-01 | Độ trễ telematics xe → hệ thống | ≤30s p95 (mục tiêu ≤10s) | 0.66s (đỉnh p95 cửa sổ 5 phút) | ✅ ĐẠT |
| NF-02 | Độ trễ trạng thái trụ (OCPP) | ≤30s | 0.47s (p95 trên 30 mẫu) | ⚠️ KHÔNG ĐỦ MẪU — xem mục 3 |
| NF-04 | 300 xe đồng thời, không đổi kiến trúc | 300 xe | 54.000 bản ghi hợp lệ, 30.0 bản tin/giây | ✅ ĐẠT |
| NF-10 | Lệch đối soát 3 chiều | <1% | _lượt chạy này chưa có metric đếm 24h_ | ⚠️ KHÔNG ĐO ĐƯỢC |
| NF-14 | Dashboard + alert ingest gián đoạn | có | Prometheus + Grafana + 10 luật alert | ✅ ĐẠT |

**Mục tiêu ≤10s của NF-01:** ✅ đạt cả mục tiêu (0.66s ≤ 10s)

## 2. Độ trễ ingest (NF-01)

Hai cách đo song song, cố ý không gộp:

| Cách đo | Giá trị | Ghi chú |
|---|---|---|
| p95 cửa sổ 5 phút — ĐỈNH | 0.658s | Chính xác từng mẫu. **Đây là con số dùng để kết luận NF-01.** |
| p95 cửa sổ 5 phút — p95 của các mẫu | 0.646s | Bỏ ảnh hưởng của 1–2 mẫu đỉnh cá biệt |
| p95 cửa sổ 5 phút — lúc kết thúc | 0.427s | Trạng thái cuối lượt chạy |
| Histogram p50 | 0.500s | Nội suy từ bucket |
| Histogram p95 | 0.950s | Nội suy từ bucket — **thô**, xem cảnh báo dưới |
| Histogram p99 | 0.990s | Nội suy từ bucket |
| Trung bình (sum/count) | 0.258s | Không bị bucket làm nhòe |

> ⚠️ **Giới hạn của cột histogram:** bucket của `g3_ingest_lag_seconds` là `[1, 5, 10, 30, 60, 300, 3600]`. Nếu phân vị rơi vào khoảng 10→30 thì sai số nội suy có thể tới hàng chục giây. Vì vậy kết luận NF-01 ở mục 1 lấy theo gauge p95 (`g3_ingest_lag_p95_5m_seconds`, tính trên từng mẫu), không lấy theo histogram.

## 3. Thông lượng, cảnh báo và trạm sạc

| Chỉ số | Giá trị |
|---|---|
| Bản ghi ghi mới (valid) | 54.000 |
| Bản ghi trùng/gửi bù (duplicate) | 0 |
| Bản tin bị cách ly (quarantine) | 20 |
| Thông lượng trung bình | 29.98 bản tin/giây |
| Cảnh báo bắn ra trong lượt chạy | 0 |
| Trễ cảnh báo — p95 | _không đo được_ |
| Trễ cảnh báo — trung bình | _không đo được_ |
| Bản tin OCPP đã xử lý | 710 |
| Trễ trạng thái trụ — p95 | 0.47s |
| Trễ trạng thái trụ — trung bình | 0.10s |
| Số mẫu đo NF-02 | 30 tổng · **0 ở nửa sau lượt chạy** |
| Trụ đang kết nối lúc kết thúc | 10 / 10 |
| RAM ingest (đỉnh RSS) | 233 MB |
| CPU ingest (tổng giây) | 89.3s |

> **Trễ cảnh báo đo ở đâu:** histogram `g3_alert_latency_seconds` của services/ingest, đo từ ts THIẾT BỊ của bản ghi kích hoạt tới lúc ghi xong dòng `alerts`. Không đo lại được từ database: cột `alerts.triggered_at` cố ý lưu GIỜ THIẾT BỊ (để bằng chứng bảo hành nói đúng thời điểm xe chạm ngưỡng), nên hiệu `triggered_at − payload.do_luc` luôn bằng 0 và **không** phải độ trễ.

> ⚠️ **NF-02 chưa được đo dưới tải — đọc kỹ chỗ này trước khi tin con số p95 ở trên.**
>
> `simulators/ocpp-sim` chạy **đúng một** phiên sạc mỗi trụ rồi chuyển sang chỉ gửi heartbeat (xem `simulators/ocpp-sim/src/index.ts`: `runSession()` gọi một lần, sau đó `setInterval` chỉ còn `heartbeat()`). Vì vậy toàn bộ 30 StatusNotification dồn vào khoảng một phút đầu: nửa sau của 30 phút chạy chỉ phát sinh thêm 0 mẫu.
>
> Nghĩa là con số p95 ở trên nói về **lúc 10 trụ cùng khởi động**, KHÔNG nói về NF-02 khi hệ đang gánh 300 xe suốt 30 phút. Nó vẫn là số thật và vẫn có ích (chứng minh đường OCPP thông), nhưng **chưa đủ để nghiệm thu NF-02**.
>
> Muốn đo thật thì `ocpp-sim` phải lặp phiên liên tục — đây là việc **chưa làm**, đã ghi vào [debt-register.md](debt-register.md).

## 4. Lỗi và bất thường quan sát được

- ⚠️ 20 bản tin bị cách ly, lý do:
  - `vin_khong_ton_tai: G3-SIM-0001` × 1
  - `vin_khong_ton_tai: G3-SIM-0002` × 1
  - `vin_khong_ton_tai: G3-SIM-0003` × 1
  - `vin_khong_ton_tai: G3-SIM-0004` × 1
  - `vin_khong_ton_tai: G3-SIM-0005` × 1
  - `vin_khong_ton_tai: G3-SIM-0006` × 1
  - `vin_khong_ton_tai: G3-SIM-0007` × 1
  - `vin_khong_ton_tai: G3-SIM-0008` × 1
  - …và 12 lý do khác — xem bảng `telemetry_quarantine`

## 5. Nếu vỡ ngưỡng — nguyên nhân nghi ngờ & đề xuất

NF-01 không vỡ ngưỡng, nên mục này không có đề xuất tối ưu. **NF-02 thì không phải "không vỡ" — nó CHƯA ĐO ĐƯỢC**, xem cảnh báo ở mục 3.

**Cảnh báo về phạm vi kết luận** — lượt chạy này KHÔNG chứng minh được:

- Hệ chịu được **1.200+ xe** (mốc 2029 của NF-04). Mới đo ở mốc 300 xe.
- Hệ chịu được khi **mất sóng hàng loạt rồi gửi bù cùng lúc** (NF-09) — kịch bản này
  dồn dữ liệu 48 giờ của nhiều xe vào cùng một khoảnh khắc, khác hẳn tải đều.
- Hệ chịu được với **dữ liệu tích lũy nhiều tháng** trong `telematics_readings`.
  Database ở lượt chạy này gần như trống, nên chưa chạm giới hạn về index và I/O.
- **Đối soát 3 chiều (NF-10) chạy được dưới tải.** Không có phiên sạc mới nào phát
  sinh trong lượt chạy (cùng nguyên nhân với NF-02: `ocpp-sim` không lặp phiên), nên
  job đối soát không có gì để đối soát.

## 6. Cách chạy lại

```bash
docker compose -f infra/docker-compose.yml up -d
npm run db:migrate && npm run db:seed
npm run loadtest -- --vehicles 300 --stations 10 --minutes 30
```

Lệnh trên tự bật `services/ingest`, `services/csms`, `apps/api`, hai simulator, đo,
rồi tắt sạch và ghi đè chính file này. Log từng tiến trình nằm ở `load-test-logs/`.

Xem trực quan trong lúc chạy: Grafana <http://localhost:3001> → dashboard
"G3 Network — Sức khỏe hệ thống & đường dữ liệu".
