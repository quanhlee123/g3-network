# 9 · VAI TRÒ & PHÂN QUYỀN (RBAC)

> Nguồn: sheet "9. Vai trò & Phân quyền" — PRD v2.0. Chuyển đổi trung thực, không diễn giải lại.

Ký hiệu: ✓ = toàn quyền · V = chỉ xem · — = không · \* = phạm vi giới hạn · v2.0 thêm vai trò CSKH (Holding) và các quyền thanh toán/thiết bị

| Chức năng / Dữ liệu | Tài xế | Chủ xe / QL đội | Vận hành G3 Energy | Bảo hành G3 Mobility | CSKH Holding (MỚI) | Admin G3 Network | Sale (Holding) | (P2) Chủ hàng |
|---|---|---|---|---|---|---|---|---|
| Xem trạng thái & vị trí xe | V\* | V\* | — | V | V (khi có ticket) | ✓ | V | V\* |
| Nhận cảnh báo pin / bất thường | ✓ | ✓ | — | V | V | ✓ | — | — |
| Tìm & điều hướng trạm sạc | ✓ | ✓ | — | — | — | ✓ | — | — |
| Thanh toán phiên sạc / ví (MỚI) | ✓\* | ✓ (đội) | — | — | V (hỗ trợ) | ✓ | — | — |
| Cấu hình chính sách sạc (bảo hành) | — | — | — | ✓ | — | ✓ | — | — |
| Xem trạng thái / báo cáo bảo hành | V\* (xe mình) | V\* | — | ✓ | V | ✓ | V | — |
| Quản lý danh mục & trạng thái trạm | — | — | ✓ | — | — | ✓ | — | — |
| Sản lượng điện / đối soát kWh | — | V\* | ✓ | — | — | ✓ | — | — |
| Dashboard KPI đội xe & báo cáo | — | ✓ | — | V | — | ✓ | V | — |
| Quản lý tài xế & phân công xe | — | ✓ | — | — | — | ✓ | — | — |
| Ticket hỗ trợ & SOS (MỚI) | ✓ (tạo) | ✓ (tạo/xem đội) | V (trạm) | V (bảo hành) | ✓ (xử lý) | ✓ | V | ✓ (P2) |
| Sức khỏe thiết bị telematics (MỚI) | — | V\* | — | — | V | ✓ | — | — |
| Tài khoản & phân quyền (RBAC) | — | V\* | — | — | — | ✓ | — | — |
| Quản trị dữ liệu & audit log | — | — | V | V | — | ✓ | — | — |
| (P2) Đăng / duyệt nhu cầu vận tải | — | ✓ (đăng xe) | — | — | V | ✓ | ✓ | ✓ |
| (P2) Ghép nối, báo giá, e-contract | V | ✓ | — | — | V | ✓ | V | ✓ |

## Ghi chú phạm vi giới hạn

\* Phạm vi giới hạn: Tài xế chỉ xe được gán; Chủ xe/QL đội chỉ trong đội mình; Chủ hàng chỉ đơn của mình; CSKH chỉ xem vị trí xe khi có ticket/SOS đang mở (bảo vệ riêng tư tài xế — Nghị định 13/2023). Mọi truy cập dữ liệu vị trí đều ghi audit log (NF-06, F-F1).
