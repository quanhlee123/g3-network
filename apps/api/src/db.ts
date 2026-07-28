// F-F1 — Kết nối PostgreSQL cho apps/api. Cùng quy ước Queryable với services/ingest và
// services/csms: nhận Pool (chạy thật) hoặc Client (test bơm thẳng vào) để logic không
// phụ thuộc kiểu cụ thể của pg.
//
// LƯU Ý: pg trả cột NUMERIC dưới dạng chuỗi (giữ đúng độ chính xác). Ở đây KHÔNG cài
// type parser toàn cục — đó là tác dụng phụ lên mọi tiến trình dùng pg. Thay vào đó mỗi
// truy vấn tự ép `::float8` cho cột số cần tính toán (kWh, SOC, VNĐ đều < 2^53 nên an toàn).
import pg from 'pg';
import { databaseUrl } from '@g3/db';

export interface Queryable {
  query(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
}

export function createPool(connectionString: string = databaseUrl()): pg.Pool {
  return new pg.Pool({ connectionString, max: 10 });
}
