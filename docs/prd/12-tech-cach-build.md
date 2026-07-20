# 12 · TECH STACK & CÁCH BUILD

> Nguồn: sheet "12. Tech & Cách build" — PRD v2.0. Chuyển đổi trung thực, không diễn giải lại.
> Lưu ý: đây là "stack GỢI Ý" của PRD. Stack ĐÃ CHỐT cho Phase 1 nằm ở [CLAUDE.md](../../CLAUDE.md) (modular monolith, Fastify, PostgreSQL+TimescaleDB+PostGIS, EMQX, Next.js, React Native/Expo) — muốn đổi phải có ADR.

Claude Code dựng KHUNG theo PRD → team Dev tối ưu, bảo mật, kiểm thử & tích hợp phần cứng thật · Cloud-native, API-first, modular monolith → microservices khi scale

## Stack gợi ý (team Dev quyết định cuối)

| Lớp | Công nghệ gợi ý | Lý do / Ghi chú v2.0 |
|---|---|---|
| Backend API | Node.js/TypeScript hoặc Python (FastAPI) | API-first; dễ tuyển; OpenAPI cho tài liệu |
| IoT ingest | MQTT broker (EMQX) + mTLS theo thiết bị | (v2.0) EMQX hỗ trợ xác thực chứng chỉ & quy mô tốt hơn Mosquitto khi >1.000 thiết bị |
| Trạm sạc | CSMS OCPP (SteVe làm nền hoặc tự xây) | OCPP 1.6J tối thiểu; cần remote start/stop cho luồng thanh toán QR (F-H1) |
| CSDL giao dịch | PostgreSQL + PostGIS | Quan hệ + truy vấn không gian; bảng phiên sạc/vi phạm append-only |
| CSDL chuỗi thời gian | TimescaleDB (ưu tiên, cùng hệ Postgres) / InfluxDB | Giảm số công nghệ vận hành; retention policy tự động (NF-16) |
| Nền tảng dữ liệu | Data Lake (S3-compatible) + Warehouse + ETL | Chuẩn hóa đa nguồn; phục vụ AI & báo cáo liên công ty |
| Web portal | React / Next.js | Dashboard đội xe & quản trị |
| Mobile app | React Native hoặc Flutter | 1 mã nguồn iOS/Android; ưu tiên tối ưu Android tầm trung (NF-13); offline cache (F-D5) |
| Bản đồ | VietMap / Google Maps / Mapbox | Chốt qua pilot đo chi phí (sheet 14 — Q5) |
| Thanh toán & hóa đơn | VNPay/Momo (tokenization) + nhà cung cấp HĐĐT | (v2.0) mới — không tự xử lý dữ liệu thẻ |
| Xác thực | OAuth2/JWT + RBAC; audit log | Theo sheet 9 |
| Hạ tầng | Docker + Kubernetes, CI/CD | Triển khai nhất quán; load test trước Gate 2 |
| Giám sát | Prometheus/Grafana + logging tập trung | Alert khi ingest gián đoạn (NF-14) |

## Trình tự build (khớp Release trong sheet 4)

| Bước | Phạm vi | Ghi chú |
|---|---|---|
| Bước 1 — Xương sống dữ liệu | Mô hình dữ liệu (sheet 8) + ingest MQTT mock + CSMS OCPP mock + API lõi | Luồng e2e giả lập chạy được là điều kiện Gate 0 |
| Bước 2 — Vòng an toàn | F-A1/A2/A4/A5 + F-F3 + F-I2 (SOS) + F-J1/J3 (thiết bị) | Ưu tiên số 1: không xe nào 'im lặng' hay hết pin mà hệ thống không biết |
| Bước 3 — Vòng tiền & bảo hành | F-B1–B3/B5 + F-C1/C2/C6 + F-H1 (thanh toán) | Doanh thu điện & bằng chứng bảo hành |
| Bước 4 — Trải nghiệm | F-D1/D2/D4 + F-E1 + F-F1/F2 | App tài xế & portal tối thiểu; onboarding ≤5 phút |
| Bước 5 — Sau roll-out (P1.1) | Phần còn lại theo sheet 4 | Theo phản hồi pilot & vận hành thật |

## Hướng dẫn cho Claude Code

• Đầu vào: PRD này + mô hình dữ liệu (sheet 8) + hợp đồng API định nghĩa trước theo module. • Scaffold theo module A–K; mỗi tính năng bám user story & acceptance (sheet 4); tag mã nguồn theo mã F-xx. • Mock telematics & OCPP qua interface — thay được bằng tích hợp thật không sửa logic nghiệp vụ. • Viết test cho luồng trọng yếu: cảnh báo pin, ghi phiên sạc, đối soát 3 chiều, thanh toán, SOS. • Không commit secret; cấu hình qua biến môi trường/vault. • Dev review bắt buộc: bảo mật, edge case, hiệu năng — khung Claude Code là điểm khởi đầu, không phải sản phẩm cuối.
