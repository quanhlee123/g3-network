# ADR-002: Migration bằng SQL thuần + runner tự viết (packages/db)
Ngày: 2026-07-20 · Người đề xuất: Claude Code (Prompt 03, F-G4) · Người duyệt: (chờ duyệt) · Trạng thái: NHÁP

## Bối cảnh
Prompt 03 dựng toàn bộ schema PostgreSQL (16 bảng theo sheet 8 PRD) với các yêu cầu đặc thù:
hypertable TimescaleDB + retention cấu hình qua env (NF-16), trigger append-only (NF-11),
PostGIS geography, enum Postgres. Quy tắc 9 CLAUDE.md: mọi thay đổi DB qua file migration
đánh số thứ tự; quy tắc 8: không sửa migration đã merge.

## Quyết định
Dùng file **SQL thuần đánh số** (`packages/db/migrations/0001_*.sql`…) + **runner TypeScript
~80 dòng** (`packages/db/src/migrations.ts`) trên driver `pg`: bảng `schema_migrations` ghi
file đã áp, mỗi migration chạy trong 1 transaction, advisory lock chống chạy song song,
chỉ chạy tiến (sửa sai = migration mới). Sau migrate, runner áp retention policy từ
`TELEMETRY_RETENTION_MONTHS`. Types TypeScript sinh từ schema thật bằng introspection
(`npm run db:types`), không viết tay.

## Lý do & các phương án đã loại
- SQL thuần: các tính năng cần dùng (create_hypertable, add_retention_policy, trigger,
  geography, enum) là SQL đặc thù Postgres/Timescale — DSL của tool chỉ thêm một tầng dịch.
  File SQL đọc được trực tiếp, review dễ, khớp tinh thần "đánh số thứ tự" của quy tắc 9.
- node-pg-migrate (loại): API JS che SQL đặc thù, vẫn phải rơi về `pgm.sql(...)` cho
  Timescale/PostGIS → không thêm giá trị, thêm phụ thuộc.
- ORM Prisma/Drizzle (loại ở Phase 1): schema-first của ORM xung đột với hypertable/trigger
  append-only (Prisma không mô tả được), và tạo 2 nguồn sự thật schema. Có thể xem lại ở
  Phase 2 nếu cần query-builder — sẽ là ADR mới.

## Hệ quả
- Không có rollback tự động: khắc phục = viết migration mới (đúng quy tắc 8, an toàn hơn
  down-migration nửa vời với dữ liệu append-only).
- Sau MỌI migration mới phải chạy lại `npm run db:types` để types trong `@g3/shared` khớp
  schema (CI/test sẽ lộ lệch nếu quên vì typecheck dùng file sinh ra đã commit).
- Test DB dùng database `g3_test` tạo mới mỗi lần chạy — không đụng dữ liệu `g3` dùng chung.
