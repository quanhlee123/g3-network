# ADR-001: Chọn Fastify (không dùng NestJS) cho apps/api
Ngày: 2026-07-17 · Người đề xuất: Claude Code (Prompt 01) · Người duyệt: PM (duyệt kế hoạch Prompt 01) · Trạng thái: Đã duyệt

## Bối cảnh
Kiến trúc đã chốt trong CLAUDE.md cho phép chọn Fastify hoặc NestJS (mục D-04 trong
docs/DECISION-LOG.md, ghi "chốt ở Prompt 01"). Yêu cầu: TypeScript strict, OpenAPI tự sinh
(quy tắc 11), modular monolith trong monorepo, đội mỏng build bằng AI.

## Quyết định
Dùng Fastify 5 + @fastify/swagger + TypeBox làm khung API cho apps/api. Schema TypeBox của
từng route vừa validate request/response lúc chạy, vừa là nguồn sinh OpenAPI
(`npm run openapi:generate`).

## Lý do & các phương án đã loại
- Fastify: nhẹ, nhanh, ít "magic", plugin system đủ để tách module trong modular monolith;
  một nguồn sự thật schema → validate + OpenAPI, giảm lệch tài liệu.
- NestJS (loại): mạnh về khuôn khổ DI/decorator cho đội đông người; ở đây ranh giới module
  đã nằm ở packages/ + quy tắc CLAUDE.md, thêm tầng trừu tượng NestJS làm khó debug và
  tăng chi phí học mà không thêm giá trị ở Phase 1.

## Hệ quả
- Mọi route phải khai báo schema TypeBox đầy đủ (không schema = không hiện trong OpenAPI).
- Nếu Phase 2 cần chuyển NestJS, cần ADR mới; logic nghiệp vụ đặt trong packages/ nên chi
  phí chuyển được giới hạn ở tầng route.
