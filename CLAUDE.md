# CLAUDE.md — Quy tắc dự án G3 Network (Phase 1)

## Bối cảnh dự án
G3 Network là nền tảng vận hành xe tải điện: telematics xe–pin, cảnh báo pin phân cấp,
kiểm soát chính sách sạc & bằng chứng bảo hành, quản lý trạm sạc (OCPP), thanh toán phiên sạc,
app tài xế + portal đội xe. Đây là hệ thống có yếu tố AN TOÀN (cháy nổ pin), TIỀN (thanh toán,
đối soát kWh) và PHÁP LÝ (bằng chứng bảo hành, Nghị định 13/2023 về dữ liệu cá nhân).

- PRD: docs/prd/ (14 file, giữ nguyên mã tính năng F-xx và ngưỡng NF-xx)
- Kiến trúc: docs/architecture/ (Mermaid — cập nhật khi thay đổi)
- Quyết định: docs/adr/ và docs/DECISION-LOG.md
- Giai đoạn hiện tại: xây KHUNG chạy trên SIMULATOR. Chưa có phần cứng thật,
  chưa có tiền thật. Thanh toán chỉ dùng SANDBOX.

## Kiến trúc đã chốt (không tự ý đổi — muốn đổi phải tạo ADR và được duyệt)
- Modular monolith trong 1 monorepo. KHÔNG microservices, KHÔNG Kafka/RabbitMQ ở Phase 1.
- Backend: Node.js + TypeScript (strict). API: Fastify/NestJS, OpenAPI tự sinh.
- DB: PostgreSQL duy nhất, bật extension TimescaleDB (time-series) + PostGIS (không gian).
- MQTT broker: EMQX (Docker). OCPP 1.6J qua WebSocket (CSMS tự xây, tham chiếu SteVe).
- Portal: Next.js. Mobile: React Native + Expo, ưu tiên Android tầm trung (NF-13).
- Toàn bộ chạy local bằng `docker compose up`.

## 12 quy tắc bất di bất dịch
1. Mỗi tính năng gắn 1 mã PRD (F-A1…). Mã này xuất hiện trong: tên branch
   (feature/F-A2-canh-bao-pin), commit message, comment đầu file, mô tả PR.
2. Mọi tích hợp ngoài (telematics xe, OCPP, thanh toán, bản đồ, SMS, push, hóa đơn điện tử)
   đi qua interface trong packages/contracts/. CẤM gọi thẳng SDK/API bên ngoài từ logic
   nghiệp vụ. Mỗi interface luôn có ít nhất 1 bản mock hoạt động được.
3. CẤM hardcode secret/API key/mật khẩu. Chỉ đọc từ biến môi trường. Mọi biến mới phải
   thêm vào infra/.env.example (KHÔNG kèm giá trị thật) và ghi chú trong README.
4. Bảng charging_sessions và violations là APPEND-ONLY: cấm UPDATE/DELETE ở tầng ứng dụng,
   chặn thêm bằng trigger/permission ở DB (NF-11 — giá trị pháp lý bảo hành).
5. Mọi truy cập dữ liệu VỊ TRÍ XE qua API phải ghi audit log: ai, lúc nào, xe nào, lý do
   (NF-06, sheet 9). CSKH chỉ xem vị trí khi có ticket đang mở.
6. RBAC theo đúng ma trận docs/prd/09-rbac.md. Tài xế chỉ thấy xe được gán; đội chỉ thấy
   đội mình. Mặc định là TỪ CHỐI, cấp quyền tường minh.
7. Luồng trọng yếu BẮT BUỘC có test trước khi merge: cảnh báo pin (đúng ngưỡng, chống spam),
   ghi phiên sạc, đối soát 3 chiều trụ–xe–thanh toán (lệch >1% phải cảnh báo), thanh toán
   sandbox (kể cả kịch bản webhook đến trễ/đến 2 lần), SOS. Test đỏ = không merge.
8. Bản ghi telematics có trường schema_version từ ngày 1 (NF-16). Đổi schema = migration
   mới + tăng version, KHÔNG sửa migration cũ đã merge.
9. Mọi thay đổi cấu trúc DB đi qua file migration đánh số thứ tự. Cấm sửa tay DB.
10. Giao diện người dùng: tiếng Việt, chữ lớn, tương phản cao, tác vụ chính ≤3 chạm (NF-12).
    Đơn vị: VNĐ, km, kWh (NF-17).
11. Sau mỗi tính năng: cập nhật OpenAPI, cập nhật docs liên quan, chạy TOÀN BỘ test,
    rồi mới đề xuất commit. Nếu quyết định thiết kế mới phát sinh → viết ADR nháp
    vào docs/adr/ để con người duyệt.
12. Dùng dữ liệu GIẢ 100%: không VIN thật, không SĐT thật, không tiền thật. Không expose
    service ra internet công cộng.

## Ranh giới — việc Claude Code KHÔNG tự làm
- Không merge PR (con người bấm). Không chạy lệnh git push --force lên main.
- Không cài đặt tích hợp thanh toán production hay xử lý dữ liệu thẻ dưới mọi hình thức.
- Không tự quyết các mục trong docs/DECISION-LOG.md đang ở trạng thái MỞ — nếu một tính năng
  phụ thuộc quyết định mở, dừng lại và nêu rõ thay vì giả định.
- Không xóa/ghi đè dữ liệu test của người khác trong DB dùng chung.

## Lệnh thường dùng
- Khởi động toàn hệ: `docker compose up -d && npm run dev`
- Toàn bộ test: `npm test` · Test 1 workspace: `npm test -w apps/api`
- Giả lập 20 xe: `npm run sim:vehicles -- --count 20`
- Giả lập trụ sạc: `npm run sim:ocpp -- --stations 3`
- Sinh OpenAPI: `npm run openapi:generate`
- Quét secret: `npm run gitleaks`

## Định nghĩa hoàn thành (Definition of Done) cho MỌI tính năng
[ ] Đúng user story + acceptance criteria trong docs/prd/04-p1-chuc-nang.md
[ ] Tuân thủ ngưỡng NF-xx liên quan (docs/prd/05-phi-chuc-nang.md)
[ ] Có test cho kịch bản chính + ít nhất 2 kịch bản xấu (mất sóng, dữ liệu trùng/trễ)
[ ] OpenAPI cập nhật · .env.example cập nhật nếu có biến mới
[ ] Toàn bộ test xanh · gitleaks sạch
[ ] Mô tả PR: mã F-xx, tóm tắt, cách demo bằng simulator, ảnh chụp màn hình nếu có UI
