# Gói bàn giao — dành cho nhà thầu

Toàn bộ tài liệu cần để **hiểu hệ thống, kiểm chứng hiện trạng và báo giá** một gói thầu
Phase 1. Đọc theo đúng thứ tự dưới đây.

| # | Tài liệu | Trả lời câu hỏi |
|---|---|---|
| 1 | [system-overview.md](system-overview.md) | Hệ thống làm gì · kiến trúc · luồng dữ liệu · stack · **cách chạy** · **cách demo** |
| 2 | [feature-status.md](feature-status.md) | **46 mã F-xx**: cái gì xong tới mức nào, link thẳng tới code và test |
| 3 | [debt-register.md](debt-register.md) | 13 mục nợ kỹ thuật, có mức độ và gợi ý thứ tự sửa |
| 4 | [load-test-300.md](load-test-300.md) | Số đo tải thật ở 300 xe — **và những gì lượt đo đó KHÔNG chứng minh được** |
| 5 | [sow/](sow/) | Phạm vi công việc + Definition of Done của 4 gói thầu |

## Bốn gói thầu

> ✅ **Cập nhật 2026-08-21 — không còn gói nào bị chặn hoàn toàn.** Bốn quyết định
> **D-13…D-16** trong [DECISION-LOG.md](../DECISION-LOG.md) đã gỡ chặn cả bốn gói. Số mục MỞ
> giảm **28 → 25**. Ba phụ thuộc còn lại đều có đường đi vòng ghi rõ trong từng SOW.

| Gói | Nội dung | Khởi động được? | Còn phụ thuộc |
|---|---|---|---|
| [SOW-01](sow/SOW-01-hardening-ha-tang.md) | **Hardening & hạ tầng** — bịt lỗ hổng, TLS/vault, mTLS thiết bị, backup, on-call, pen-test | ✅ **Ngay** — D-16 chốt host tại VN + HashiCorp Vault ([ADR-014](../adr/ADR-014-ha-tang-trien-khai-va-vault.md)) | Q6 (định tuyến cảnh báo) · D-12 (vai trò tamper) |
| [SOW-02](sow/SOW-02-tich-hop-phan-cung.md) | **Tích hợp phần cứng** — adapter telematics thật, nghiệm thu trụ OCPP thật, provisioning | ⚠️ **Một phần** — D-13 chốt G3 tự chọn T-BOX, gỡ TR-02/04/05. Đặc tả mua sắm + adapter làm được ngay | 🔴 **file DBC** chặn phần đọc CAN · Q8 · Q2 |
| [SOW-03](sow/SOW-03-thanh-toan-hoa-don-production.md) | **Thanh toán & hóa đơn production** — VNPay production, hóa đơn điện tử, hiệu chuẩn đối soát | ✅ **Chặng 1 ngay** — D-14 tách 2 chặng, interface + mock không cần vendor | Q9 chặn chặng 2 · Q13 · hợp đồng cổng thanh toán |
| [SOW-04](sow/SOW-04-mobile-p1-1.md) | **App tài xế P1.1** — 10 màn hình, bản đồ & điều hướng, thanh toán ≤3 chạm, SOS | ✅ **Ngay** — D-15: 3 màn ưu tiên từ Thiết kế, 7 màn nhà thầu vẽ + G3 duyệt | Q5 (không chặn P1.0) · Q7 (câu chữ consent) · Q6 |

**Thứ tự đề nghị:** SOW-01 trước (phần bảo mật đường truyền là điều kiện của SOW-02 —
không cắm thiết bị thật vào một broker MQTT chưa xác thực được, và PKI của Vault là thứ cấp
chứng chỉ cho thiết bị ở SOW-02). SOW-03 và SOW-04 chạy song song được ngay.

## Ba con số nên tự kiểm chứng trước khi tin tài liệu này

```bash
npm test
```

```bash
gitleaks git . --no-banner --redact
```

```bash
npm run openapi:generate && git diff --stat apps/api/openapi.json
```

Kỳ vọng: **622 test / 67 file xanh, 0 fail** · **no leaks found** trên toàn lịch sử git ·
**diff rỗng** (OpenAPI khớp mã nguồn).

## Điều kiện làm việc

Ràng buộc hợp đồng và chuẩn nộp bài nằm ở `standards/INPUT-05-nha-thau.md` của prompt-kit.
Tóm tắt phần hay bị bỏ qua nhất:

- Code trong **repo GitHub của G3 từ ngày đầu** — không có chuyện repo riêng "bàn giao cuối kỳ".
- **Test đi kèm trong CÙNG PR với code.** Sửa test cũ cho "qua" thay vì sửa code là **vi phạm
  nghiêm trọng, ghi biên bản**.
- PR >500 dòng thay đổi → chia nhỏ.
- Thay đổi kiến trúc/thư viện lớn → **ADR được duyệt trước, rồi mới code**.
- Secret production **chỉ trong secret manager do G3 quản trị**; nhà thầu không giữ bản sao.
  Phát hiện secret trong code/chat/tài liệu → **dừng thanh toán milestone**.
- Tích hợp thật phải **giữ nguyên interface** trong `packages/contracts`; simulator và toàn bộ
  test mock **phải tiếp tục xanh**.
- Báo cáo tuần: % hoàn thành từng item SOW, blocker, và **mọi giả định đã tự đưa ra**.

Toàn bộ [CLAUDE.md](../../CLAUDE.md) ở gốc repo áp dụng cho nhà thầu **kể cả khi không dùng
AI để code** — đặc biệt 12 quy tắc bất di bất dịch và mục "Ranh giới".
