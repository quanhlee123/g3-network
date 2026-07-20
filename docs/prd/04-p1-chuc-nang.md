# 4 · PHASE 1 — YÊU CẦU CHỨC NĂNG (Module A–K)

> Nguồn: sheet "4. P1 - Chức năng" — PRD v2.0. Chuyển đổi trung thực, không diễn giải lại.
> Ghi chú review của Đức (cột bổ sung trong `update by Duc.xlsx`): xem [review-notes-duc.md](review-notes-duc.md).

Đợt phát hành: P1.0 = ngày roll-out · P1.1 = 90 ngày sau · P1.5 = 2026–27 · Module H–K là bổ sung mới

## Bảng yêu cầu chức năng

| Mã | Module | Tính năng | Mô tả & User story | Đợt | MoSCoW | Tiêu chí chấp nhận (Acceptance) | Tham khảo |
|---|---|---|---|---|---|---|---|
| F-A1 | A. Telematics & Giám sát xe–pin | Thu thập dữ liệu xe realtime | Là hệ thống, thu thập liên tục SOC, SOH, điện áp/nhiệt độ pin, dòng sạc–xả, trạng thái motor, tốc độ, odometer, GPS, mã lỗi từ BMS/thiết bị trên xe Tri-Ring. | P1.0 | Must | Cập nhật ≤30s (p95) khi xe online; lưu lịch sử ≥12 tháng hot; cờ online/offline; schema có version. | Tesla, BYD |
| F-A2 | A. Telematics & Giám sát xe–pin | Cảnh báo pin phân cấp | Là tài xế, tôi nhận cảnh báo 30% (sớm) / 20% (chính) / 10% (nguy cấp) kèm gợi ý trạm gần nhất còn trống; quản lý đội nhận cảnh báo từ 20%. | P1.0 | Must | Cảnh báo ≤30s khi chạm ngưỡng; kèm khoảng cách & nút điều hướng; hoạt động khi app chạy nền; chống spam (1 lần/ngưỡng/chuyến). | Tesla, VinFast |
| F-A3 | A. Telematics & Giám sát xe–pin | Sức khỏe pin (SOH) & chu kỳ | Theo dõi SOH, số chu kỳ sạc–xả, ước tính suy giảm dung lượng theo thời gian. | P1.1 | Should | SOH % + chu kỳ, cập nhật ≥1 lần/ngày; cảnh báo khi SOH dưới ngưỡng cấu hình. | BYD |
| F-A4 | A. Telematics & Giám sát xe–pin | Phát hiện bất thường | Nhiệt độ pin cao, sụt áp đột ngột, lỗi cell/module, lỗi motor → sinh cảnh báo & log sự kiện. | P1.0 | Must | Cảnh báo realtime khi vượt ngưỡng an toàn (an toàn cháy nổ pin = Must, nâng từ Should của v1.0); log kèm snapshot dữ liệu. | Tesla |
| F-A5 | A. Telematics & Giám sát xe–pin | Vị trí, hành trình & geofence | Vị trí/tốc độ realtime, xem lại lộ trình, cảnh báo ra/vào vùng (phục vụ giám sát & quy trình thu hồi). | P1.0 | Must | Vị trí ≤30s; lịch sử lộ trình ≥6 tháng; geofence theo xe/đội. | Quy trình rủi ro G3 |
| F-A6 | A. Telematics & Giám sát xe–pin | Hiệu suất vận hành | Km/ngày, kWh tiêu thụ, kWh/km, chi phí/km theo xe. | P1.1 | Must | Báo cáo xe/ngày/tuần/tháng; xuất CSV; công thức chi phí cấu hình được (giá điện). | — |
| F-B1 | B. Kiểm soát sạc & Bảo hành | Thiết lập chính sách sạc | G3 Mobility cấu hình chính sách theo hợp đồng/bảo hành: khung giờ (ToU), SOC min–max (vd 20–90%), thời lượng/tần suất, công suất cho phép. | P1.0 | Must | Cấu hình theo xe/đội/dòng; hiệu lực ngay; lưu phiên bản chính sách (audit). | BH 500.000km/5 năm |
| F-B2 | B. Kiểm soát sạc & Bảo hành | Ghi nhận phiên sạc | Log mọi phiên: thời điểm, trạm, trụ/súng, công suất, kWh, SOC đầu–cuối, thời lượng, chi phí. | P1.0 | Must | 100% phiên qua mạng G3 Energy được ghi & đối soát chéo với telematics xe (NF-15). | — |
| F-B3 | B. Kiểm soát sạc & Bảo hành | Đối chiếu & gắn cờ vi phạm | So phiên sạc với chính sách → gắn cờ (ngoài khung giờ; thường xuyên >90% hoặc <20%; sạc nhanh quá mức). | P1.0 | Must | Tự phát hiện & phân loại; lưu bằng chứng bất biến (immutable) phục vụ đối chiếu hợp đồng. | — |
| F-B4 | B. Kiểm soát sạc & Bảo hành | Bảng trạng thái bảo hành | Mỗi xe có điểm tuân thủ, số vi phạm, mức nguy cơ bảo hành. | P1.1 | Must | Dashboard theo xe; lọc theo nguy cơ; xuất báo cáo cho G3 Mobility. | — |
| F-B5 | B. Kiểm soát sạc & Bảo hành | Cảnh báo nguy cơ mất bảo hành | Cảnh báo tài xế/chủ xe khi hành vi sạc ảnh hưởng quyền lợi bảo hành, kèm khuyến nghị. | P1.0 | Must | Realtime + tổng hợp định kỳ; nêu rõ hành vi & cách khắc phục. | Quy trình G3 |
| F-B6 | B. Kiểm soát sạc & Bảo hành | Báo cáo vi phạm cho đội Bảo hành | Chuyển hồ sơ vi phạm cho G3 Mobility xử lý (cảnh báo/từ chối bảo hành theo hợp đồng). | P1.1 | Should | Báo cáo định kỳ & theo yêu cầu; lưu lịch sử xử lý. | — |
| F-C1 | C. Quản lý trạm sạc | Danh mục trạm sạc | Trạm với GPS, công suất, số trụ/súng, chuẩn CCS2, giờ hoạt động, trạng thái bảo trì. | P1.0 | Must | CRUD trạm; hiển thị bản đồ; trạng thái hoạt động/bảo trì. | V-Green, Tesla |
| F-C2 | C. Quản lý trạm sạc | Trạng thái trụ realtime | Số xe đang sạc, trụ trống–bận, công suất khả dụng theo thời gian thực qua OCPP. | P1.0 | Must | Cập nhật ≤30s; trạng thái súng Available/Charging/Faulted chính xác ≥99%. | Tesla Supercharger |
| F-C3 | C. Quản lý trạm sạc | Hàng đợi & thời gian chờ | Ước tính thời gian chờ tại trạm. | P1.5 | Should | Hiển thị số xe chờ & ETA trống trụ. | — |
| F-C4 | C. Quản lý trạm sạc | Đặt chỗ trụ sạc | Đặt trước trụ theo khung giờ. | P1.5 | Could | Đặt/hủy; giữ chỗ có thời hạn; phạt no-show (cấu hình). | — |
| F-C5 | C. Quản lý trạm sạc | Sản lượng điện theo trạm | kWh bán ra theo trạm/khung giờ cho G3 Energy. | P1.1 | Should | Báo cáo kWh theo trạm/ngày; phục vụ tối ưu ToU. | — |
| F-C6 | C. Quản lý trạm sạc | Điện sử dụng theo khách hàng | kWh theo khách/phiên phục vụ hóa đơn & đối soát. | P1.0 | Must | Chính xác theo phiên; khớp 3 chiều trụ–xe–thanh toán. | — |
| F-D1 | D. App tài xế & Điều hướng | Bản đồ trạm sạc | Bản đồ trạm + lọc trạng thái khả dụng/công suất/chuẩn. | P1.0 | Must | Trạm gần vị trí; lọc trạng thái; chi tiết trạm. | Tesla, VinFast |
| F-D2 | D. App tài xế & Điều hướng | Điều hướng tới trạm | Chỉ đường tới trạm phù hợp/gần nhất còn trống. | P1.0 | Must | Mở điều hướng (in-app hoặc Google/VietMap); ưu tiên trạm còn trống. | Tesla trip planner |
| F-D3 | D. App tài xế & Điều hướng | Range-aware | Cảnh báo nếu SOC không đủ tới trạm đã chọn; gợi ý trạm trong tầm với. | P1.1 | Should | Tính khả năng tới đích theo SOC & quãng đường; về sau hiệu chỉnh theo tải trọng. | Tesla |
| F-D4 | D. App tài xế & Điều hướng | App tài xế (iOS & Android) | Trạng thái xe–pin, cảnh báo, lịch sử, tìm/điều hướng trạm, thanh toán sạc, CSKH. | P1.0 | Must | Đăng nhập theo tài khoản tài xế; dùng tốt ngoài trời; tiếng Việt. | Tesla, BYD, VinFast |
| F-D5 | D. App tài xế & Điều hướng | Chế độ offline (MỚI) | Là tài xế vùng sóng yếu, tôi vẫn xem được SOC cache, bản đồ trạm đã tải, và cảnh báo ngưỡng cục bộ từ thiết bị. | P1.1 | Should | Cache dữ liệu gần nhất + timestamp; hàng đợi thao tác đồng bộ khi có sóng. | NF-08 |
| F-E1 | E. Portal đội xe | Danh sách & bản đồ đội xe | Danh sách xe, trạng thái, vị trí realtime trên web portal. | P1.0 | Must | Xem toàn đội; lọc/tìm kiếm. | Fleet portal |
| F-E2 | E. Portal đội xe | Dashboard KPI đội xe | Km, kWh, chi phí/km, SOH, tỷ lệ sử dụng, cảnh báo. | P1.1 | Must | Tổng hợp & theo xe; lọc thời gian; xuất báo cáo. | — |
| F-E3 | E. Portal đội xe | Báo cáo sạc & bảo hành | Phiên sạc, tuân thủ chính sách, trạng thái bảo hành theo đội/xe. | P1.1 | Must | Xuất CSV/PDF; lọc xe/thời gian. | — |
| F-E4 | E. Portal đội xe | Quản lý tài xế & phân công | Thêm/sửa tài xế, gán xe, hoạt động theo tài xế. | P1.1 | Should | CRUD tài xế; gán/đổi xe; lịch sử hoạt động. | — |
| F-F1 | F. Tài khoản & Thông báo | Tài khoản & RBAC | Phân quyền theo vai trò (sheet 9); mời/khóa tài khoản; audit log. | P1.0 | Must | RBAC đầy đủ; audit log truy cập dữ liệu nhạy cảm (vị trí). | — |
| F-F2 | F. Tài khoản & Thông báo | Provisioning thiết bị | Kích hoạt thiết bị theo VIN khi bàn giao; xác nhận luồng dữ liệu thông suốt. | P1.0 | Must | Quy trình theo VIN; checklist bàn giao; tỷ lệ thành công ≥98%. | — |
| F-F3 | F. Tài khoản & Thông báo | Thông báo đa kênh | Push/in-app/SMS: pin yếu, vi phạm sạc, bảo dưỡng, bất thường, thiết bị offline. | P1.0 | Must | Cấu hình kênh & ngưỡng; lịch sử; SMS dự phòng cho cảnh báo pin ≤10% khi không có data. | VinFast, Tesla |
| F-F4 | F. Tài khoản & Thông báo | Nhắc bảo dưỡng & ưu đãi | Nhắc theo km/thời gian; chiến dịch ưu đãi. | P1.1 | Should | Lịch nhắc theo km/thời gian; quản lý chiến dịch. | Quy trình G3 |
| F-G1 | G. Tích hợp & Nền dữ liệu | Tích hợp telematics Tri-Ring | Nhận dữ liệu BMS/telematics qua giao diện IoT của xe; interface thay được mock ↔ thật. | P1.0 | Must | Chốt đặc tả (Gate 0); nhận đủ trường lõi; môi trường test/mock. | Spec xe Tri-Ring |
| F-G2 | G. Tích hợp & Nền dữ liệu | Tích hợp trạm sạc (OCPP) | CSMS nhận trạng thái & phiên sạc qua OCPP 1.6J (tối thiểu), sẵn sàng 2.0.1. | P1.0 | Must | Trạng thái & phiên realtime; nghiệm thu trụ theo chuẩn khi mua sắm. | OCPP / CSMS |
| F-G3 | G. Tích hợp & Nền dữ liệu | Pipeline dữ liệu (ETL) | Thu thập–chuẩn hóa–gắn nhãn–lưu (Lake/Warehouse + time-series); giám sát chất lượng dữ liệu. | P1.1 | Should | Pipeline tự động; chuẩn hóa theo xe/khách/tuyến; alert khi dữ liệu bẩn. | — |
| F-G4 | G. Tích hợp & Nền dữ liệu | Quản trị & bảo mật dữ liệu | Mã hóa, RBAC, audit, tuân thủ Nghị định 13/2023; chính sách retention. | P1.0 | Must | Mã hóa truyền & lưu; consent tài xế khi kích hoạt; retention hot 12 tháng/cold 5 năm. | — |
| F-H1 | H. Thanh toán & Gói dịch vụ (MỚI) | Thanh toán phiên sạc in-app | Là tài xế, tôi quét QR trên trụ, sạc, và thanh toán bằng VNPay/Momo/ví trong app; nhận biên nhận kWh. | P1.0 | Must | Luồng quét→sạc→trả ≤3 bước; không lưu thông tin thẻ trên hệ thống (tokenization qua cổng); hoạt động khi sóng yếu (giữ phiên, thu sau). | VinFast/V-Green |
| F-H2 | H. Thanh toán & Gói dịch vụ (MỚI) | Ví & lịch sử giao dịch | Ví nạp trước cho tài xế/đội xe; lịch sử phiên sạc & giao dịch; đội xe trả tập trung. | P1.1 | Should | Nạp/rút theo quy định; hạn mức; đối soát ví khớp phiên sạc. | BlackBuck |
| F-H3 | H. Thanh toán & Gói dịch vụ (MỚI) | Hóa đơn điện tử kWh | Hóa đơn hợp lệ theo quy định VN cho khách lẻ & tổng hợp tháng cho đội xe. | P1.1 | Must | Tích hợp nhà cung cấp hóa đơn điện tử; khớp đối soát C6. | — |
| F-H4 | H. Thanh toán & Gói dịch vụ (MỚI) | Billing thuê bao SaaS | Thu phí gói Standard theo xe/tháng: gán gói, chu kỳ, nhắc hạn, khóa tính năng khi quá hạn. | P1.5 | Should | Quản lý gói theo khách/đội; báo cáo doanh thu thuê bao. | — |
| F-I1 | I. CSKH & Dịch vụ (MỚI) | Ticket hỗ trợ in-app | Là khách hàng, tôi gửi yêu cầu hỗ trợ kèm ngữ cảnh xe (VIN, vị trí, mã lỗi) tự đính kèm; CSKH Holding xử lý theo SLA. | P1.1 | Should | Tạo/theo dõi ticket; phân loại; SLA phản hồi; tích hợp kênh Zalo/hotline ghi nhận vào ticket. | — |
| F-I2 | I. CSKH & Dịch vụ (MỚI) | Hỗ trợ sự cố | Là tài xế gặp sự cố/hết pin, tôi nhấn CSKH → gửi vị trí + mã lỗi cho CSKH; nhân sự G3 liên hệ. | P1.0 | Must | Nút CSKH hiển thị; gọi lại ≤5 phút; hoạt động khi app nền; fallback gọi hotline. | Mục tiêu 'không hết pin' |
| F-I3 | I. CSKH & Dịch vụ (MỚI) | Đặt lịch bảo dưỡng | Đặt lịch tại xưởng/mạng lưới bảo hành–bảo dưỡng G3 từ nhắc bảo dưỡng. | P1.5 | Could | Chọn xưởng/khung giờ; xác nhận; lịch sử bảo dưỡng theo xe. | — |
| F-J1 | J. Quản lý thiết bị & Kết nối (MỚI) | Sức khỏe thiết bị telematics | Theo dõi từng thiết bị: last-seen, phiên bản firmware, tình trạng SIM/data, nguồn điện. | P1.0 | Must | Dashboard thiết bị; xe 'im lặng' >X giờ tự sinh cảnh báo phân biệt lỗi thiết bị vs xe tắt máy. | Chuẩn fleet platform |
| F-J2 | J. Quản lý thiết bị & Kết nối (MỚI) | Cấu hình từ xa (OTA config) | Đẩy cấu hình (tần suất gửi, ngưỡng cảnh báo cục bộ) xuống thiết bị từ xa. | P1.1 | Should | Đẩy theo xe/đội; xác nhận áp dụng; rollback được. | — |
| F-J3 | J. Quản lý thiết bị & Kết nối (MỚI) | Cảnh báo offline & tháo thiết bị | Cảnh báo khi thiết bị offline bất thường hoặc có dấu hiệu bị tháo/mất nguồn (tamper) — phục vụ kiểm soát rủi ro & thu hồi. | P1.0 | Must | Phát hiện mất nguồn đột ngột ≠ mất sóng; cảnh báo cho vận hành & quản lý rủi ro. | Quy trình rủi ro G3 |
| F-K1 | K. An toàn lái xe (MỚI) | Chấm điểm hành vi lái | Điểm an toàn theo tài xế: phanh gấp, tăng tốc đột ngột, quá tốc độ, thời gian lái liên tục. | P1.1 | Should | Điểm theo tài xế/tuần; xếp hạng trong đội; dữ liệu đầu vào cho bảo hiểm (P2). | G7易流 |

## Tóm tắt phạm vi P1.0 (Day-1)

TÓM TẮT PHẠM VI P1.0 (Day-1): A1, A2, A4, A5 · B1, B2, B3, B5 · C1, C2, C6 · D1, D2, D4 · E1 · F1, F2, F3 · G1, G2, G4 · H1 · I2 · J1, J3 — tổng 23 tính năng. Mọi thứ khác dồn về P1.1/P1.5 để bảo đảm chất lượng ngày roll-out.
