// F-G4 · Lõi migration: chạy các file SQL đánh số trong packages/db/migrations theo thứ tự
// (quy tắc 9: mọi thay đổi cấu trúc DB qua migration, cấm sửa tay; quy tắc 8: sửa schema
// = migration mới, không sửa migration cũ đã merge).
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Client } from 'pg';

export const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'migrations',
);

// Khóa advisory cố định để hai tiến trình không migrate cùng lúc
const MIGRATION_LOCK_KEY = 727_001;

export function listMigrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort();
}

/** Áp các migration chưa chạy; trả về danh sách file vừa áp. */
export async function runMigrations(client: Client): Promise<string[]> {
  await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
  const applied: string[] = [];
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const done = await client.query<{ name: string }>('SELECT name FROM schema_migrations');
    const doneSet = new Set(done.rows.map((r) => r.name));

    for (const file of listMigrationFiles()) {
      if (doneSet.has(file)) continue;
      const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} thất bại: ${(err as Error).message}`);
      }
      applied.push(file);
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
  }
  return applied;
}

/** Cập nhật retention policy telematics theo env (NF-16 — hot mặc định 12 tháng). */
export async function applyRetention(client: Client, months: number): Promise<void> {
  await client.query("SELECT remove_retention_policy('telematics_readings', if_exists => true)");
  await client.query("SELECT add_retention_policy('telematics_readings', $1::interval)", [
    `${months} months`,
  ]);
}
