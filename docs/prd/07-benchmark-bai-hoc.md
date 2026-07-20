# 7 · BENCHMARK & BÀI HỌC HÀNH ĐỘNG ĐƯỢC

> Nguồn: sheet "7. Benchmark & Bài học" — PRD v2.0. Chuyển đổi trung thực, không diễn giải lại.

Rút gọn từ v1.0: mỗi nền tảng giữ lại 1 bài học chuyển thành hành động/tính năng cụ thể trong PRD này

## Phase 1 — App vận hành xe điện

| Nền tảng | Quốc gia | Mô hình | Bài học chính cho G3 | PRD v2.0 |
|---|---|---|---|---|
| Tesla (app) | Mỹ | App vận hành EV chuẩn mực (B2C), hệ sinh thái đóng | UX gọn: trạng thái xe realtime, ngưỡng SOC, trạng thái trụ trống, trip planner theo sạc | F-A1/A2 (giám sát & cảnh báo) · F-C2 (trụ realtime) · F-D3 (range-aware) · F-M1 (EV-aware P2) |
| BYD | Trung Quốc | Hãng EV thương mại + telematics | Telematics xe thương mại & theo dõi pin LFP (tương đồng pin EVT) | F-A3 (SOH & chu kỳ) · mô hình dữ liệu Battery (sheet 8) |
| VinFast / V-Green | Việt Nam | Hệ sinh thái xe + mạng sạc nội địa | Bản địa hóa: thanh toán nội địa, gói ưu đãi, vận hành mạng sạc riêng tại VN | F-H1 (thanh toán VNPay/Momo) · F-H3 (hóa đơn điện tử VN) · F-F4 (ưu đãi) |

## Phase 2 — Nền tảng logistics

| Nền tảng | Quốc gia | Mô hình | Bài học chính cho G3 | Chuyển thành gì trong PRD v2.0 |
|---|---|---|---|---|
| Manbang / Full Truck Alliance (NYSE: YMM) | Trung Quốc | Sàn số ghép chủ hàng–chủ xe lớn nhất TQ — MÔ HÌNH LÕI của G3 P2 | Sàn 2 phía + giảm chạy rỗng + VAS (tín dụng, bảo hiểm, ETC, năng lượng); cần khối lượng để có network effect | Toàn bộ Module L–O · Gate 3 yêu cầu nguồn 'mồi' trước khi build |
| G7易流 (G7 + E6) | Trung Quốc | IoT/telematics đội xe + sàn + năng lượng + tài chính — GẦN G3 NHẤT | Cách hợp nhất telematics (P1) với marketplace (P2); chấm điểm an toàn lái | F-K1 (điểm an toàn lái — v1.0 ghi nhận nhưng bỏ sót tính năng) · kiến trúc nền dữ liệu chung P1→P2 |
| Convoy | Mỹ | Mạng vận tải số — ĐÃ ĐÓNG CỬA 2023 | CẢNH BÁO đốt vốn: tự động hóa tốt nhưng unit economics âm; tài sản bán cho Flexport rồi về DAT (2025) | Gate 3 bắt buộc duyệt unit economics trước khi mở sàn; KPI P2 gắn take rate & biên lợi nhuận, không chỉ GMV |
| Sennder | Đức/EU | Forwarder đường bộ số FTL dẫn đầu châu Âu | Kết nối DN lớn ↔ nhà xe nhỏ; tối ưu km rỗng; phù hợp tuyến xuyên biên | F-M3 (backhaul) · định hướng GMS (VN–Lào–Trung) |
| BlackBuck / Zinka (NSE: ZINKA) | Ấn Độ | "Hệ điều hành cho nhà xe" trucker-first, IPO 2024 | Bộ công cụ bottom-up cho nhà xe nhỏ: thanh toán, phí đường, nhiên liệu, vốn — hợp tệp nhà xe <30 xe của G3 | F-H2 (ví) · F-O1/O3 (tài chính, ETC) · chiến lược đi từ tài xế/nhà xe nhỏ |
| Uber Freight | Mỹ | Môi giới số + TMS (vẫn thuộc Uber; đã bán mảng châu Âu cho Sennder 2020) | TMS cho chủ hàng lớn; định giá tức thì minh bạch; API mở | F-L4 (báo giá minh bạch) · F-N1 (e-contract/theo dõi) · định hướng API mở P3 |
| Cainiao (Alibaba) | Trung Quốc | Điều phối logistics nhẹ tài sản, dựa dữ liệu | Orchestration dựa dữ liệu & chuẩn hóa mạng lưới | F-M2/M4 (gom chuyến, điều phối) · sheet 8 data governance |

## Kết luận

KẾT LUẬN: Manbang là mô hình lõi P2; G7易流 là tham chiếu kiến trúc (telematics + sàn + năng lượng); Convoy là bài học rủi ro tài chính. Khác biệt bền vững của G3: đội xe ĐIỆN + mạng sạc RIÊNG + telematics RIÊNG → lập tuyến charging-aware mà mọi sàn nhiên liệu không làm được.
