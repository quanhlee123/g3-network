# 5 · PHASE 1 — YÊU CẦU PHI CHỨC NĂNG (đã siết ngưỡng cụ thể)

> Nguồn: sheet "5. P1 - Phi chức năng" — PRD v2.0. Chuyển đổi trung thực, không diễn giải lại.

| Mã | Hạng mục | Yêu cầu | Mục tiêu / Ngưỡng | Ghi chú |
|---|---|---|---|---|
| NF-01 | Hiệu năng | Độ trễ telematics xe → hệ thống | ≤ 30s p95 (mục tiêu ≤10s) khi xe online | Đo bằng timestamp thiết bị vs ingest |
| NF-02 | Hiệu năng | Độ trễ trạng thái trụ sạc (OCPP) | ≤ 30s | Available/Charging/Faulted |
| NF-03 | Khả dụng (SLA) | Uptime nền tảng | ≥ 99.5%/tháng; cảnh báo pin & trạm sạc là luồng ưu tiên cao nhất | Vận hành 24/7; on-call rotation |
| NF-04 | Mở rộng | Quy mô xe & thiết bị đồng thời | 300 xe (2026) → 1.200+ xe (2029) không đổi kiến trúc | Ingest MQTT chịu tải; load test trước Gate 2 (v2.0) |
| NF-05 | Bảo mật | Mã hóa & quản lý khóa | TLS 1.2+ khi truyền; mã hóa khi lưu; secret trong vault, không hardcode | — |
| NF-06 | Bảo mật | Định danh & xác thực THIẾT BỊ | mTLS/chứng chỉ hoặc token duy nhất theo thiết bị; thu hồi được khi mất thiết bị | (v2.0) Chặn thiết bị giả mạo bơm dữ liệu — dữ liệu này dùng cho quyết định bảo hành |
| NF-07 | Bảo mật | Kiểm thử xâm nhập (pen-test) | Bắt buộc trước Gate 2; lỗi nghiêm trọng = 0 mới go-live | (v2.0) Thuê bên thứ ba |
| NF-08 | Riêng tư & Tuân thủ | Bảo vệ dữ liệu cá nhân | Tuân thủ Nghị định 13/2023: consent khi kích hoạt, thông báo mục đích, thu thập tối thiểu, quyền của chủ thể dữ liệu | Privacy-by-design; tài xế biết mình bị giám sát vì mục đích gì |
| NF-09 | Tin cậy / Offline | Đệm & đồng bộ khi mất sóng | Store-and-forward trên thiết bị ≥48 giờ dữ liệu; không mất bản ghi | Vùng sâu/biên giới; (v2.0) định lượng 48h |
| NF-10 | Toàn vẹn dữ liệu | Đối soát 3 chiều trụ (OCPP) ↔ xe (telematics) ↔ thanh toán | Sai lệch kWh <1%; cảnh báo tự động khi lệch | (v2.0) thêm chiều thanh toán; phục vụ bảo hành & doanh thu |
| NF-11 | Toàn vẹn dữ liệu | Bằng chứng vi phạm bất biến | Bản ghi phiên sạc & vi phạm không sửa được (append-only/immutable) | (v2.0) giá trị đối chiếu khi tranh chấp bảo hành theo hợp đồng |
| NF-12 | UX | Giao diện tài xế ngoài trời, tiếng Việt | Chữ lớn, tương phản cao, thao tác 1 tay; tác vụ chính ≤3 chạm | Mobile-first |
| NF-13 | Tương thích | iOS/Android & trình duyệt | Android 10+/iOS 15+ (đa số tài xế dùng Android tầm trung); Chrome/Edge/Safari | (v2.0) nêu rõ ưu tiên Android |
| NF-14 | Quan sát hệ thống | Monitoring, log tập trung, alert vận hành | Dashboard sức khỏe hệ thống & pipeline; alert khi ingest gián đoạn | Prometheus/Grafana + logging |
| NF-15 | Sao lưu & Khôi phục | Backup & DR | RPO ≤ 15 phút · RTO ≤ 4 giờ; diễn tập khôi phục 2 lần/năm | (v2.0) v1.0 để 'xác định khi triển khai' — nay chốt ngưỡng |
| NF-16 | Vòng đời dữ liệu | Retention & schema versioning | Hot 12 tháng (time-series) / cold 5 năm (theo thời hạn bảo hành); schema dữ liệu có version & tương thích ngược | (v2.0) dữ liệu bảo hành phải giữ trọn vòng đời bảo hành 5 năm |
| NF-17 | Bản địa hóa | Ngôn ngữ & định dạng | Tiếng Việt mặc định; VNĐ/km/kWh; sẵn sàng đa ngữ (GMS: Lào, Trung) | — |
| NF-18 | Bảo trì | Mã nguồn module hóa, test, tài liệu API | Tách module rõ; test luồng trọng yếu (cảnh báo pin, phiên sạc, đối soát, thanh toán); OpenAPI | Phục vụ Dev hoàn thiện sau Claude Code |

> Ghi chú chuyển đổi [CẦN LÀM RÕ]: một số tính năng ở sheet 4 tham chiếu "NF-15" cho nội dung *đối soát chéo/toàn vẹn dữ liệu* (F-B2, persona Bảo hành) và "NF-06/sheet 9" cho *audit log vị trí* — theo bảng này, đối soát 3 chiều là NF-10, bằng chứng bất biến là NF-11, còn NF-15 là Backup & DR. Có thể đánh số NF trong sheet 4 lệch so với sheet 5; cần người review xác nhận, KHÔNG tự sửa mã.
