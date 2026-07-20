# 8 · MÔ HÌNH DỮ LIỆU & TÍCH HỢP

> Nguồn: sheet "8. Dữ liệu & Tích hợp" — PRD v2.0. Chuyển đổi trung thực, không diễn giải lại.

v2.0 bổ sung: thực thể Thiết bị & Giao dịch thanh toán · versioning schema · chính sách retention · đối soát 3 chiều

## A. Thực thể dữ liệu chính (Data Entities)

| Thực thể | Mô tả | Trường chính | Nguồn |
|---|---|---|---|
| Xe (Vehicle) | Thông tin xe & thiết bị gắn | VIN; dòng (EVT-262/400/825); chủ xe; đội; ngày bàn giao; device_id; trạng thái bảo hành; gói dịch vụ | Đăng ký + Provisioning |
| Thiết bị (Device) — MỚI | Thiết bị telematics trên xe | device_id; VIN gắn; firmware; SIM/ICCID; last_seen; trạng thái nguồn; chứng chỉ/định danh mTLS | Provisioning + heartbeat |
| Pin (Battery) | Pack pin & tình trạng | pack_id; hóa chất (LFP/CATL); dung lượng; SOC; SOH; điện áp; nhiệt độ; số chu kỳ | BMS / telematics |
| Bản ghi telematics (TelematicsReading) | Chuỗi thời gian, có schema_version | timestamp; vehicle_id; SOC; GPS; tốc độ; odometer; motor; nhiệt độ; mã lỗi; schema_version | Thiết bị xe (MQTT) |
| Phiên sạc (ChargingSession) | Một lần sạc — bản ghi bất biến (immutable) | session_id; vehicle_id; station_id; connector_id; bắt đầu/kết thúc; kWh; SOC đầu/cuối; công suất; chi phí; payment_id | OCPP + telematics |
| Giao dịch thanh toán (PaymentTransaction) — MỚI | Thanh toán phiên sạc / thuê bao | payment_id; session_id hoặc subscription_id; phương thức (VNPay/Momo/ví); số tiền; trạng thái; mã đối soát cổng | Cổng thanh toán |
| Trạm sạc (ChargingStation) | Trạm & vị trí | station_id; GPS; khu vực; công suất; số trụ; chuẩn CCS2; trạng thái; giờ hoạt động | G3 Energy |
| Trụ/Súng (Connector) | Cổng sạc | connector_id; station_id; công suất; chuẩn; trạng thái (Available/Charging/Faulted) | OCPP |
| Chính sách sạc (ChargingPolicy) | Quy tắc bảo hành — có version | policy_id; version; phạm vi (xe/đội/dòng); khung giờ; SOC min–max; giới hạn công suất/thời lượng; hiệu lực từ–đến | Cấu hình G3 Mobility |
| Vi phạm & Bảo hành (Violation/WarrantyStatus) | Tuân thủ & nguy cơ — bằng chứng append-only | vehicle_id; violation_id; loại; bằng chứng (session snapshot); điểm tuân thủ; mức nguy cơ | Tính toán hệ thống |
| Người dùng / Khách hàng / Tài xế | Tài khoản, đơn vị sở hữu, người lái | user_id + vai trò; customer_id + hợp đồng + gói; driver_id + xe gán + consent dữ liệu (Nghị định 13) | Quản trị / CRM |
| Cảnh báo (Alert) & Ticket (MỚI) | Sự kiện cảnh báo & yêu cầu hỗ trợ/SOS | alert_id; loại; đối tượng; thời điểm; trạng thái xử lý · ticket_id; kênh; SLA; ngữ cảnh xe đính kèm | Hệ thống / CSKH |
| (P2) Lô hàng · Ghép nối · Đơn · Thanh toán cước | Thực thể sàn vận tải | shipment_id; match_id; order_id (e-contract, e-POD); escrow_id; KYC_status của các bên | Sàn P2 |

## B. Nguồn dữ liệu & Tích hợp

| Hệ thống | Giao thức / Chuẩn | Dữ liệu trao đổi & yêu cầu | Lưu ý / Phụ thuộc |
|---|---|---|---|
| Xe Tri-Ring (BMS/telematics) | CAN bus → IoT gateway → MQTT/TLS (mTLS theo thiết bị) | SOC, SOH, GPS, km, motor, nhiệt độ pin, mã lỗi; tần suất cấu hình được (OTA) | PHỤ THUỘC LỚN — chốt tại Gate 0; dự phòng: gateway OBD/CAN bên thứ ba (sheet 13) |
| Trạm sạc G3 Energy | OCPP 1.6J (tối thiểu), sẵn sàng 2.0.1 (CSMS) | Trạng thái trụ/súng, phiên sạc, kWh, công suất; lệnh remote start/stop cho luồng thanh toán QR | Điều khoản OCPP bắt buộc trong hồ sơ mua sắm trụ; chuẩn đầu CCS2 |
| Cổng thanh toán | API VNPay / Momo / thẻ (tokenization) | Thanh toán sạc (P1), thuê bao (P1.5), cước vận tải & escrow (P2) | KHÔNG lưu dữ liệu thẻ trên hệ thống; webhook đối soát |
| Hóa đơn điện tử | API nhà cung cấp HĐĐT (VN) | Hóa đơn kWh khách lẻ & tổng hợp đội xe | (v2.0) bắt buộc cho doanh thu điện hợp lệ |
| Bản đồ & định tuyến | Google Maps / Mapbox / VietMap API | Bản đồ, chỉ đường, ma trận khoảng cách | Chi phí API là rủi ro (sheet 13); pilot đo cost/xe/tháng trước khi chốt |
| SMS / Push | FCM/APNs + SMS brandname | Cảnh báo pin nguy cấp (SMS fallback), OTP | SMS chỉ cho cảnh báo trọng yếu để kiểm soát chi phí |
| Nền tảng dữ liệu nội bộ | MQTT → stream → Lake/Warehouse + time-series DB | Dữ liệu chuẩn hóa đa nguồn; catalog & quality check | Retention: hot 12 tháng / cold 5 năm (NF-16) |
| (P2) Đối tác logistics | API / EDI | Đơn hàng, năng lực, theo dõi | InterLOG / HS Logistics làm nguồn 'mồi' — MOU tại Gate 3 |

## C. Luồng dữ liệu

Thu thập (xe qua MQTT/mTLS + trạm qua OCPP + thanh toán qua webhook) → Chuẩn hóa & gắn nhãn (ETL theo xe/khách/tuyến, kiểm tra chất lượng, schema versioning) → Lưu trữ (time-series + Lake/Warehouse; phiên sạc & vi phạm append-only) → Phục vụ (API · App/Portal · Cảnh báo · Đối soát 3 chiều · AI/ML) → Vòng lặp cải tiến (insight quay lại tính năng & quy hoạch xe/trạm).
