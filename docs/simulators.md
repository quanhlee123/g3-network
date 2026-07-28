# Hướng dẫn Simulator xe (`simulators/vehicle-sim`)

> Tài liệu dành cho nhà thầu / dev mới. Simulator giả lập N xe tải điện gửi telemetry
> qua MQTT (EMQX) — thay cho phần cứng thật ở Phase 1. **Dữ liệu GIẢ 100%**: VIN tiền tố
> `G3-SIM`, tuyến đường Hà Nội–Lạng Sơn, không có SĐT/tiền thật (quy tắc 12, CLAUDE.md).

## Phạm vi & mã PRD

| Mã | Ý nghĩa với simulator |
|---|---|
| F-A1 | Nguồn dữ liệu telemetry realtime: SOC, GPS, tốc độ, odometer, nhiệt độ pin, điện áp, mã lỗi, `schema_version` |
| F-A2 | Kịch bản `drain` tạo chuỗi SOC cắt ngưỡng 30/20/10% để test cảnh báo phân cấp |
| F-A4 | Kịch bản `temp` đẩy nhiệt độ pin lên 60°C kèm mã lỗi `P0A80` |
| F-J3 | Kịch bản `power-loss` mô phỏng mất nguồn/tháo thiết bị (khác mất sóng) |
| NF-01 | Chu kỳ gửi mặc định 10s/xe |
| NF-04 | Chịu tải `--count 300` trên máy dev |
| NF-09 | Kịch bản `offline`: đệm store-and-forward, bù dữ liệu với **timestamp thiết bị gốc** |
| NF-16 | Mọi bản ghi có `schema_version` (hằng `TELEMETRY_SCHEMA_VERSION` trong `@g3/shared`) |

## Kiến trúc nhanh

- Topic telemetry: `g3/telemetry/{vin}` — 1 bản ghi JSON (`TelemetryRecord` trong `@g3/contracts`) mỗi 10s/xe.
- Topic trạng thái: `g3/status/{vin}` (retained) — `online` lúc khởi động, `offline` khi tắt.
  Riêng kịch bản `power-loss`, mỗi xe có kết nối MQTT riêng gắn **LWT**: broker tự phát
  `{"status":"offline","reason":"lwt"}` khi client rớt đột ngột không gửi DISCONNECT.
- `ts` trong bản ghi là **giờ thiết bị** lúc đo (ISO 8601 UTC) — khi bù dữ liệu sau mất sóng,
  `ts` giữ nguyên, KHÔNG phải giờ broker nhận (NF-09; NF-01 đo trễ bằng chênh lệch này).
- Mô phỏng thuần (không I/O) nằm ở `vehicle.ts`/`scheduler.ts`; MQTT thật chỉ ở
  `mqtt-publisher.ts` qua interface `TelemetryPublisher` của `@g3/contracts` (quy tắc 2).

## Chuẩn bị

```bash
npm install                                # tại thư mục gốc repo
docker compose -f infra/docker-compose.yml up -d emqx
```

- Broker mặc định `mqtt://localhost:1883` (đọc từ biến `MQTT_URL` nếu có, hoặc flag `--mqtt-url`).
- Dashboard EMQX: http://localhost:18083 (user `admin`, mật khẩu trong `infra/.env`).
- Không có broker → simulator báo lỗi tiếng Việt kèm hướng dẫn và thoát mã 1 (không treo).
- **Unit test không cần broker**: `npm test -w simulators/vehicle-sim`.

## Bảng flag CLI

Chạy qua script gốc: `npm run sim:vehicles -- <flags>`

| Flag | Mặc định | Ý nghĩa |
|---|---|---|
| `--count` | `1` | Số xe giả lập (VIN đánh số `{prefix}-0001`…) |
| `--scenario` | `normal` | `normal` \| `drain` \| `offline` \| `temp` \| `power-loss` |
| `--vin-prefix` | `G3-SIM` | Tiền tố VIN giả (cấm `/ + #` và khoảng trắng) |
| `--interval-ms` | `10000` | Chu kỳ gửi mỗi xe (ms), tối thiểu 100 |
| `--drain-minutes` | `30` | (drain) SOC tụt 100% → 5% trong số phút này |
| `--offline-after-minutes` | `1` | (offline) chạy bình thường bao lâu rồi mới mất sóng |
| `--offline-minutes` | `120` | (offline) thời gian mất sóng (mặc định 2 giờ theo đề) |
| `--temp-ramp-minutes` | `10` | (temp) thời gian nhiệt độ leo từ ~32°C lên 60°C |
| `--power-loss-after-minutes` | `2` | (power-loss) chạy bao lâu rồi cắt nguồn đột ngột |
| `--seed` | `42` | Seed ngẫu nhiên — cùng seed cho ra cùng dữ liệu |
| `--mqtt-url` | env `MQTT_URL` | Ghi đè địa chỉ broker |

## Cách quan sát dữ liệu

- **Dashboard EMQX** (dễ nhất): http://localhost:18083 → *Monitoring → WebSocket Client* →
  Subscribe topic `g3/telemetry/#` (và `g3/status/#`).
- **CLI** (nếu có mosquitto-clients): `mosquitto_sub -h localhost -t "g3/telemetry/#" -v`
- Số liệu tổng: dashboard *Cluster Overview* (messages in/out rate, connections).
- Simulator tự log tóm tắt mỗi ~6 tick: số xe online, SOC trung bình, msg/s, số bản ghi đang đệm.

## Từng kịch bản

### a) `normal` — vận hành bình thường
```bash
npm run sim:vehicles -- --count 20 --scenario normal
```
20 xe chạy dọc QL1A Hà Nội–Lạng Sơn (khứ hồi), tốc độ 40–70 km/h, SOC hao theo km,
nhiệt độ pin 28–35°C, `fault_codes` rỗng. Dùng làm nền cho demo bản đồ/ingest.

### b) `drain` — tụt pin dần (test cảnh báo phân cấp F-A2)
```bash
# Nghiệm thu nhanh: tụt 100% → 5% trong 5 phút, gửi mỗi 2s
npm run sim:vehicles -- --count 3 --scenario drain --drain-minutes 5 --interval-ms 2000
```
SOC giảm **tuyến tính, không tăng ngược**, lần lượt cắt ngưỡng 30% → 20% → 10% → chạm sàn 5%
thì xe dừng bánh (speed = 0) nhưng vẫn phát telemetry. Hệ cảnh báo phải bắn đúng 1 lần/ngưỡng
(chống spam — phía consumer xử lý, simulator chỉ bảo đảm dữ liệu sạch).

### c) `offline` — mất sóng 2 giờ rồi bù (test NF-09 store-and-forward)
```bash
# Đúng đề bài (mất sóng 2h): chạy 1 phút, mất sóng 120 phút, tự bù khi có sóng lại
npm run sim:vehicles -- --count 5 --scenario offline
# Nghiệm thu nhanh: mất sóng 3 phút
npm run sim:vehicles -- --count 5 --scenario offline --offline-minutes 3
```
Trong lúc "mất sóng" xe **vẫn đo mỗi 10s** và đệm trong bộ nhớ; broker không nhận gì.
Khi có sóng lại, simulator log `bù N bản ghi với timestamp gốc` và xả toàn bộ buffer FIFO
**trước** bản ghi live. Kiểm tra trên subscriber: các bản ghi bù có `ts` (giờ thiết bị) cũ dần
về quá khứ dù vừa mới nhận — tuyệt đối không mất bản ghi nào. Test tự động:
`scheduler.test.ts` mô phỏng đủ 2 giờ (780 tick) và khẳng định 0 mất mát.

### d) `temp` — nhiệt độ pin bất thường (test F-A4)
```bash
npm run sim:vehicles -- --count 1 --scenario temp --temp-ramp-minutes 5
```
Nhiệt độ pin leo đều từ ~32°C lên **60°C** rồi giữ; từ 55°C bản ghi kèm mã lỗi `P0A80`.
Hệ phát hiện bất thường phải sinh cảnh báo + log snapshot khi vượt ngưỡng an toàn.

### e) `power-loss` — mất nguồn đột ngột (test F-J3, phân biệt với mất sóng)
```bash
npm run sim:vehicles -- --count 3 --scenario power-loss --power-loss-after-minutes 1
```
Mỗi xe kết nối MQTT riêng, khai báo LWT trên `g3/status/{vin}`. Sau mốc cấu hình, simulator
**hủy thẳng socket** — không DISCONNECT, không "goodbye". Subscribe `g3/status/#` sẽ thấy
broker tự phát `{"status":"offline","reason":"lwt"}` sau ~1,5× keepalive (keepalive 15s ⇒
trong vòng ~25s). Đối chứng: tắt bằng Ctrl+C sẽ ra `{"status":"offline","reason":"graceful"}` —
đây chính là tín hiệu để phân biệt "mất nguồn/tháo thiết bị" với "tắt máy bình thường".
Lưu ý: kịch bản này mở 1 kết nối/xe — dùng `--count` vừa phải (≤50); yêu cầu 300 xe (NF-04)
áp cho các kịch bản dùng kết nối chung (`normal`, `drain`, `offline`, `temp`).

## Demo end-to-end với service ingest (F-G1 — Prompt 05)

```bash
docker compose -f infra/docker-compose.yml up -d   # DB + EMQX
npm run db:migrate && npm run db:seed              # seed tạo VIN G3-SIM-VIN-0001..0020
npm run start -w services/ingest                   # cửa sổ 1: ingest MQTT → DB
npm run sim:vehicles -- --count 5 --vin-prefix G3-SIM-VIN   # cửa sổ 2: 5 xe seed gửi dữ liệu
```

> **Lưu ý VIN:** ingest chỉ nhận VIN có trong bảng `vehicles` (seed dùng tiền tố
> `G3-SIM-VIN`). Chạy sim với `--vin-prefix` mặc định `G3-SIM` sẽ ra VIN `G3-SIM-0001`
> không tồn tại → toàn bộ vào `telemetry_quarantine` (đúng thiết kế chống thiết bị lạ,
> xem ADR-004) — dùng chính điều này để demo luồng quarantine.

Quan sát:

- Số bản ghi vào DB: `SELECT count(*) FROM telematics_readings;`
- Độ trễ NF-01 (p95 ≤30s): http://localhost:9464/metrics → `g3_ingest_lag_seconds`
  (bucket `le="30"` phải chiếm ~100% khi xe online).
- Thiết bị online/offline (F-J1/F-J3): `SELECT device_serial, last_seen_at, power_status
  FROM devices;` — chạy kịch bản `power-loss` sẽ thấy `power_status = 'lost'` sau ~25s.
- Bản tin hỏng: `SELECT reason, count(*) FROM telemetry_quarantine GROUP BY reason;`
  và alert: `SELECT * FROM alerts WHERE type = 'data_quality';`

## Nghiệm thu NF-04 — 300 xe / 10 phút trên máy dev

Lệnh: `npm run sim:vehicles -- --count 300 --scenario normal`

| Chỉ số | Kết quả (đo 2026-07-21, máy dev Windows 11, EMQX 5.8 Docker local) |
|---|---|
| Số xe / chu kỳ | 300 xe, 10s/bản ghi, 1 kết nối MQTT dùng chung |
| Thời gian chạy | ~10 phút (614s quan sát) — 55 tick |
| Bản ghi telemetry broker nhận | **16.500 / 16.500 kỳ vọng (300 xe × 55 tick) — 0 mất** |
| Thông lượng | ~27 msg/s ổn định (QoS 1) |
| CPU tiến trình sim | ~0,5% một nhân (tổng ~3,4 CPU-giây cho cả 10 phút) |
| RAM tiến trình sim | 75–80 MB, đi ngang (không rò rỉ) |
| Kết luận | Máy dev không nghẽn; còn dư địa lớn cho mốc 1.200 xe (2029) |

## Trụ sạc ảo OCPP 1.6J (`simulators/ocpp-sim`) + CSMS (`services/csms`) — F-G2

Trụ ảo kết nối `ws://localhost:9220/ocpp/{mãTrạm}` (subprotocol `ocpp1.6`), mã trạm và
idTag khớp seed: trạm `G3-ST-001…003`, idTag = VIN GIẢ `G3-SIM-VIN-0001…` (ADR-005 —
idTag lạ bị CSMS từ chối). Message hỗ trợ: BootNotification, Heartbeat, StatusNotification,
StartTransaction, MeterValues (Energy/SoC/Power), StopTransaction,
RemoteStartTransaction/RemoteStopTransaction.

```bash
docker compose -f infra/docker-compose.yml up -d && npm run db:migrate && npm run db:seed
npm run start -w services/csms          # cửa sổ 1: CSMS (WS 9220 + HTTP nội bộ 9221)
npm run sim:ocpp -- --stations 3        # cửa sổ 2: 3 trụ, kịch bản normal
```

| Flag | Mặc định | Ý nghĩa |
|---|---|---|
| `--stations` | `1` | Số trụ (mã `G3-ST-001`… phải có trong DB — seed tạo sẵn 3) |
| `--scenario` | `normal` | `normal` \| `faulted` \| `disconnect` |
| `--interval-ms` | `2000` | Chu kỳ MeterValues (ms) |
| `--session-ticks` | `6` | Số tick MeterValues của 1 phiên |
| `--power-kw` | `120` | Công suất sạc mô phỏng |
| `--csms-url` | env `CSMS_URL` hoặc `ws://localhost:9220` | Địa chỉ CSMS |

### Kịch bản & nghiệm thu Prompt 05

- **`normal`** — phiên sạc trọn vẹn. Kiểm tra: `SELECT * FROM charging_sessions ORDER BY
  recorded_at DESC LIMIT 3;` → đúng 1 dòng/trụ, `energy_kwh` = (meterStop−meterStart)/1000,
  SOC đầu/cuối khớp log sim.
- **`faulted`** — trụ hỏng GIỮA phiên (StatusNotification `Faulted` + Stop reason `Other`).
  Nghiệm thu NF-02 tự bấm giờ: xem log sim in lúc phát Faulted rồi
  `SELECT status, updated_at FROM connectors;` — chênh lệch ≤30s (thực tế ≪1s; test tự động
  `session.test.ts` cũng tự bấm giờ khẳng định ≤30s).
- **`disconnect`** — đứt WS đột ngột giữa phiên (terminate, không close frame), công tơ trụ
  vẫn chạy offline, nối lại và gửi **StopTransaction bù**: vẫn ra ĐÚNG 1 dòng
  `charging_sessions` với kWh đủ cả phần sạc lúc mất kết nối. Khi đứt, connectors về
  `Unavailable`; nối lại thì trở về theo StatusNotification.
- **RemoteStart (chuẩn bị F-H1)** — sau khi phiên kịch bản xong, sim giữ kết nối:

```bash
curl -X POST http://localhost:9221/internal/remote-start -H "Content-Type: application/json" -d '{"stationCode":"G3-ST-001","connectorId":1,"idTag":"G3-SIM-VIN-0001"}'
```

→ trụ tự mở phiên mới; `remote-stop` với `transactionId` để dừng.

## Sự cố thường gặp

| Triệu chứng | Nguyên nhân / cách xử lý |
|---|---|
| `Không kết nối được MQTT broker tại mqtt://localhost:1883` | EMQX chưa chạy → `docker compose -f infra/docker-compose.yml up -d emqx` |
| Không thấy message trên dashboard | Subscribe sai topic — dùng wildcard `g3/telemetry/#` (phân biệt hoa thường) |
| Kịch bản offline "không thấy gì" | Đúng thiết kế: trong cửa sổ mất sóng broker không nhận gì; chờ hết `--offline-minutes` sẽ thấy loạt bản ghi bù dồn về |
| LWT không xuất hiện ngay khi power-loss | Broker chỉ phát LWT sau ~1,5× keepalive (~25s) — hành vi chuẩn MQTT |
| Muốn dữ liệu lặp lại được | Cố định `--seed` (mặc định 42) |
