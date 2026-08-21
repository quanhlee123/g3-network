# ADR-014: Hạ tầng triển khai đặt tại Việt Nam, quản lý bí mật bằng HashiCorp Vault
Ngày: 2026-08-21 · Người đề xuất: PM (Quốc Anh) · Người duyệt: _chờ BLĐ + Legal_ · Trạng thái: **Nháp**

## Bối cảnh

Ba ngưỡng phi chức năng của SOW-01 đều đứng chờ cùng một quyết định chưa ai chốt — **triển
khai ở đâu**:

- **NF-05** — TLS 1.2+ khi truyền, mã hoá khi lưu, **secret trong vault**. Hiện toàn bộ chạy
  HTTP/MQTT trần trên localhost, secret nằm trong `infra/.env` (gitignore).
- **NF-06** — định danh **THIẾT BỊ** bằng mTLS hoặc token riêng từng thiết bị, **thu hồi được
  khi mất thiết bị**. Cột `devices.mtls_identity` đã có sẵn nhưng chưa dùng. Đây không phải
  yêu cầu trang trí: dữ liệu telematics là căn cứ ra **quyết định bảo hành**, nên một thiết
  bị giả mạo bơm được dữ liệu là một lỗ hổng có hậu quả pháp lý (xem mục N-03 của
  [debt-register](../handover/debt-register.md)).
- **NF-15** — backup RPO ≤15 phút, RTO ≤4 giờ, diễn tập khôi phục 2 lần/năm. Chưa có script
  backup nào; dữ liệu đang nằm trong volume Docker trên máy dev.

Hai ràng buộc bên ngoài thu hẹp không gian lựa chọn:

1. **TR-04** yêu cầu thiết bị telematics **cấu hình được địa chỉ server tại Việt Nam** — đã
   thành yêu cầu bắt buộc #4 trong hồ sơ mời thầu T-BOX (D-13).
2. **Gate 2 ⑤** yêu cầu tuân thủ **Nghị định 13/2023** về dữ liệu cá nhân. Dữ liệu vị trí tài
   xế là dữ liệu cá nhân, và hệ thống giám sát người lao động là nhóm nhạy cảm.

## Quyết định

**Hạ tầng production đặt tại Việt Nam** — nhà cung cấp chọn ở bước mua sắm trong nhóm VNG
Cloud / Viettel IDC / FPT Cloud / CMC Telecom, hoặc on-prem nếu BLĐ ưu tiên tự chủ.

**Quản lý bí mật và chứng chỉ bằng HashiCorp Vault tự dựng**, dùng đồng thời hai engine:
- **KV v2** cho secret ứng dụng (thay `infra/.env` ở production) — phục vụ NF-05.
- **PKI** để cấp và **thu hồi** chứng chỉ mTLS theo từng thiết bị — phục vụ NF-06.

Phase 1 chạy simulator trên máy dev **không đổi**: vẫn `infra/.env` do `scripts/setup-env.mjs`
sinh. Vault chỉ áp cho môi trường pilot trở đi. Không được biến việc dựng Vault thành điều
kiện để chạy `npm run demo:gate0` trên máy sạch.

## Lý do & các phương án đã loại

**Vì sao Việt Nam.** AWS, GCP và Azure **đều không có region tại Việt Nam**. Chọn cloud nước
ngoài buộc phải rà lại TR-04 và NĐ 13/2023 với Legal *trước* khi chốt, và nếu Legal không
thông thì việc di chuyển hạ tầng sau pilot đắt hơn nhiều lần so với chọn đúng từ đầu. Đổi lại,
hệ sinh thái dịch vụ quản trị (managed Postgres có TimescaleDB, managed Kafka…) ở nhà cung cấp
VN mỏng hơn — chấp nhận được vì kiến trúc Phase 1 cố ý chỉ cần **một PostgreSQL** và **một
MQTT broker**, không dùng dịch vụ quản trị phức tạp nào.

**Vì sao Vault chứ không phải secret manager của nhà cung cấp cloud.** Yếu tố quyết định là
NF-06, không phải NF-05. Mọi giải pháp secret-only — secret manager của cloud, Infisical,
Doppler — đều **không cấp và thu hồi chứng chỉ thiết bị**, nên vẫn phải dựng thêm một CA
riêng. Vault gộp cả hai nhu cầu vào một hệ thống, một mô hình phân quyền, một đường audit.
So sánh "Vault nặng vận hành hơn cloud secrets" là so sai đối tượng: đúng phép so là *Vault*
với *cloud secrets **cộng** một CA tự dựng*.

Các phương án đã loại:

| Phương án | Vì sao loại |
|---|---|
| Cloud secrets (VNG/Viettel/AWS…) | Không làm được PKI cho NF-06 → vẫn phải dựng CA riêng, thành hai hệ thống |
| Infisical / Doppler (SaaS) | Như trên, cộng thêm: secret của một hệ thống có yếu tố pháp lý lại nằm ở SaaS nước ngoài |
| SOPS + age, secret mã hoá trong git | Rẻ nhất nhưng **không xoay vòng được và không có đường audit** — không đạt NF-05, và sẽ là phát hiện đầu tiên của pen-test ở Gate 2 ④ |
| Cloud nước ngoài (AWS/GCP/Azure) | Không có region VN → xung đột với TR-04, rủi ro NĐ13 chưa được Legal gỡ |

## Hệ quả

**Chấp nhận đánh đổi:** công vận hành Vault cao hơn hẳn một secret manager quản trị sẵn — cần
quy trình unseal, backup chính Vault, và người biết vận hành nó. Đây là chi phí thật, phải nằm
trong báo giá SOW-01 chứ không giấu đi.

**Việc phát sinh:**
- Vault phải có backup riêng, nằm trong phạm vi NF-15 — mất Vault là mất toàn bộ khoá.
- Quy trình cấp chứng chỉ nối vào luồng **provisioning theo VIN (F-F2)**: kích hoạt thiết bị
  phải cấp luôn chứng chỉ, thu hồi thiết bị phải revoke luôn.
- `packages/db` và các service phải đọc được secret từ Vault ở production mà **vẫn đọc `.env`
  ở dev** — một lớp `SecretSource` nhỏ, và theo quy tắc 2 thì nó thuộc `packages/contracts`
  kèm một mock.
- EMQX phải bật xác thực bằng chứng chỉ (gỡ mục **N-03**).

**Ảnh hưởng tài liệu & nhà thầu:**
- [SOW-01](../handover/sow/SOW-01-hardening-ha-tang.md) hết chặn ở mục "chọn vault" và "hạ
  tầng triển khai"; DoD của NF-05/NF-06/NF-15 giữ nguyên.
- [SOW-02](../handover/sow/SOW-02-tich-hop-phan-cung.md): hồ sơ mời thầu T-BOX phải yêu cầu
  thiết bị **nạp được chứng chỉ client** — nếu không thì NF-06 không thực hiện được dù backend
  đã sẵn sàng.
- Cần **Legal xác nhận** phần NĐ 13/2023 và **BLĐ duyệt ngân sách hạ tầng** trước khi ADR này
  chuyển từ Nháp sang Đã duyệt.
