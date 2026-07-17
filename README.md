# G3 NETWORK — PROMPT KIT PHASE 1
## Bộ prompt cho Claude Code + tiêu chuẩn input cho các vai trò tham gia

Bộ kit này là "bản thi công" đi kèm PRD v2.0 và Guideline A–Z. Dùng như sau:

## Cấu trúc
```
g3-prompt-kit/
├── CLAUDE.md            ← copy vào GỐC repo trước khi làm bất cứ việc gì
├── prompts/             ← chuỗi prompt theo thứ tự 01 → 12 (khớp 12 tuần build)
│   └── 00-TEMPLATE...   ← mẫu để tự viết prompt cho tính năng mới
├── standards/           ← tiêu chuẩn INPUT cho 6 vai trò tham gia dự án
└── templates/           ← mẫu ADR, Decision Log, Pull Request
```

## Nguyên tắc sử dụng prompts/
1. Làm ĐÚNG THỨ TỰ 01 → 12. Không nhảy cóc: prompt sau giả định prompt trước đã xong.
2. Mỗi file prompt = 1 hoặc vài phiên Claude Code. MỞ PHIÊN MỚI cho mỗi prompt.
3. Dán nguyên văn prompt, nhưng luôn đọc phần "Nghiệm thu" ở cuối mỗi file —
   đó là việc CỦA BẠN, không phải của Claude.
4. Claude Code luôn ở chế độ lập kế hoạch trước (plan mode): duyệt kế hoạch rồi mới cho code.
5. Xong mỗi prompt: commit + tạo Pull Request + tick checklist nghiệm thu.

## Nguyên tắc sử dụng standards/
- Mỗi người tham gia dự án đọc ĐÚNG 1 file tiêu chuẩn của vai trò mình + file này.
- Input không đạt chuẩn thì trả lại, không đưa vào repo/backlog. Đây là cách duy nhất
  giữ chất lượng khi build bằng AI: AI khuếch đại chất lượng đầu vào — rác vào, rác ra nhanh gấp 10.

## Trạng thái quyết định đang MỞ (chặn một phần phạm vi)
Xem templates/DECISION-LOG.md — đặc biệt D-01 (app tài xế ở P1) và D-02 (RFID).
Prompt 10 (app tài xế) chỉ chạy sau khi D-01 chốt "Có".
