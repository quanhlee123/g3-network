// NF-14 — Phép kiểm tra phụ thuộc dùng lại được giữa các service.
import type { PhepKiemTra } from './ops-server';

/** Tối thiểu để hỏi Postgres: chỉ cần query(). Nhận Pool lẫn Client của pg. */
export interface CoTheHoi {
  query(text: string): Promise<unknown>;
}

/**
 * Ping DB bằng `SELECT 1`. Cố tình KHÔNG in message lỗi gốc của pg ra /health:
 * message đó có thể kèm host/user (quy tắc 3 — không rò cấu hình ra endpoint công khai).
 */
export function kiemTraDb(db: CoTheHoi): PhepKiemTra {
  return async () => {
    try {
      await db.query('SELECT 1');
      return { ok: true };
    } catch {
      return { ok: false, chi_tiet: 'không truy vấn được PostgreSQL' };
    }
  };
}
