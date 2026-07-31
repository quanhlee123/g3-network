# ADR-008: Chống spam thông báo mà không bao giờ làm mất cảnh báo an toàn

Ngày: 2026-07-30 · Người đề xuất: Claude Code (Prompt 07, F-F3) · Người duyệt: (chờ duyệt) · Trạng thái: NHÁP

## Bối cảnh

Sheet 2 PRD (hành trình tài xế, bước 5) yêu cầu: **"Thông báo đúng lúc, không spam (giới hạn
tần suất)"**. Nhưng cùng lúc đó, F-A2 và F-A4 là kênh đưa tin an toàn: pin ≤10% giữa quốc lộ,
nhiệt độ pin vượt ngưỡng cháy nổ. Hai yêu cầu này kéo ngược nhau — giới hạn tần suất quá tay
thì hệ thống *im lặng đúng lúc cần nói nhất*.

Điều làm vấn đề khó hơn: rate-limit là loại lỗi **không ai phát hiện được khi nó xảy ra**. Tin
bị chặn không để lại triệu chứng gì cho người dùng; chỉ khi có sự cố mới có người hỏi "sao tôi
không nhận được cảnh báo?" — và lúc đó đã muộn.

## Quyết định

Ba tầng, xếp theo thứ tự để một tầng sai thì tầng sau còn giữ:

1. **Chống trùng ở tầng ALERT, không phải ở tầng thông báo.** Mỗi rule sinh alert phải tự
   chống trùng bằng `alerts.dedup_key` (F-A2 đã làm theo ADR-006). Rate-limit của F-F3 là
   *lưới thứ hai*, không phải cơ chế chính.
   → **Ràng buộc bắt buộc**: mọi rule sinh alert `severity = 3` PHẢI có dedup ở tầng alert,
   vì tầng thông báo cố ý không chặn mức này (điểm 3).

2. **Rate-limit CHỈ áp cho kênh chen ngang** (`push`, `sms`), KHÔNG áp cho `in_app`.
   Mặc định 3 tin / 900 giây cho mỗi (người nhận × loại alert × kênh), đổi được qua
   `NOTIFY_RATE_LIMIT_MAX` và `NOTIFY_RATE_LIMIT_WINDOW_S`.
   → Hệ quả quan trọng: **thông tin không bao giờ mất**. Tin bị chặn vẫn có bản ghi in-app,
   mở app là thấy. Rate-limit chỉ làm giảm mức *chen ngang*, không làm giảm *thông tin*.

3. **`severity = 3` (nguy cấp) không bao giờ bị chặn.** Pin ≤10%, bất thường nhiệt độ/điện áp,
   nghi tháo thiết bị: thà gửi trùng còn hơn im lặng.

4. **Tin bị chặn được lưu với `status = 'suppressed'` kèm lý do**, và cửa sổ đếm CHỈ tính tin
   `status = 'sent'`. Hai chi tiết này liên quan nhau:
   - Lưu tin bị chặn → trả lời được câu hỏi "vì sao tài xế không nhận được cảnh báo".
   - Không đếm tin bị chặn → nếu đếm cả, mỗi lần chặn lại kéo dài cửa sổ và người dùng có thể
     bị im lặng **vô thời hạn**. Đã có test riêng cho chính điều này
     (`packages/notify/src/notifier.test.ts` — "tin bị chặn KHÔNG kéo dài cửa sổ").

5. **`INotifier.notify()` không bao giờ ném lỗi.** Nhà cung cấp push/SMS chết, DB thông báo
   hỏng → ghi `failed` rồi đi tiếp. Việc ghi `alerts` và pipeline ingest tuyệt đối không được
   chết vì kênh thông báo hỏng.

## Lý do & các phương án đã loại

- **Rate-limit đồng loạt mọi kênh, mọi mức nặng** (loại): đơn giản nhất, nhưng sẽ chặn đúng
  cảnh báo pin 10% thứ hai trong ngày — tình huống nguy hiểm thật. Với hệ thống an toàn, chi
  phí của một tin trùng thấp hơn nhiều chi phí của một tin bị mất.
- **Gộp nhiều cảnh báo thành một tin tóm tắt (digest)** (loại ở Phase 1): giảm chen ngang tốt
  hơn, nhưng thêm độ trễ — mâu thuẫn NF-01 "cảnh báo ≤30s". Có thể xem lại cho các loại không
  cấp bách (F-F4 nhắc bảo dưỡng) sau khi có số liệu thật từ pilot.
- **Chống spam bằng cách chỉ ghi in-app, không đẩy push** (loại): tài xế đang lái không mở app;
  cảnh báo không chen ngang thì coi như không tồn tại.
- **Rate-limit theo thiết bị/token thay vì theo người** (loại): một người có nhiều thiết bị vẫn
  là một người; hạn mức nên phản ánh mức chịu đựng của con người.

## Hệ quả

- Bảng `notifications` vừa là hộp thư in-app vừa là lịch sử gửi → mỗi cảnh báo sinh N dòng
  (N = số kênh × số người nhận). Với 20 xe demo thì không đáng kể; ở quy mô 300 xe (NF-04) cần
  xem lại chính sách retention của bảng này (chưa làm ở Phase 1).
- Cấu hình kênh nằm trong bảng `notification_prefs` chép từ sheet 9, có **dòng mặc định cài sẵn
  trong migration**: DB mới dựng phải ở trạng thái *có người nhận cảnh báo*, không phải im lặng.
- `severity = 3` không bị chặn nghĩa là một rule F-A4 viết sai (thiếu dedup) sẽ spam thật.
  Đây là lý do điểm 1 đặt ràng buộc bắt buộc, và là chỗ người review cần soi kỹ nhất.

## Câu hỏi cần người duyệt xác nhận

- [ ] Hạn mức 3 tin / 15 phút cho kênh chen ngang có hợp với thực tế vận hành không?
      (số này chưa có dữ liệu thật để hiệu chuẩn — đề nghị đo trong pilot)
- [ ] SMS là kênh **tốn phí thật**. Phase 1 cấu hình SMS cho: pin ≤10%, bất thường pin (tài xế),
      nghi tháo thiết bị (admin). Có cần siết thêm không, và ai chịu ngân sách SMS?
- [ ] Chấp nhận nguyên tắc "severity 3 không bao giờ bị rate-limit" kèm ràng buộc mọi rule
      severity 3 phải có dedup ở tầng alert?
