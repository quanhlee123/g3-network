// F-G4 · Sinh TypeScript types từ schema DB đã migrate: npm run db:types.
// Introspect information_schema + pg_enum → ghi packages/shared/src/db-types.ts
// (types luôn KHỚP schema thật — chạy lại sau mỗi migration mới).
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { databaseUrl } from './env';

const OUTPUT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'shared',
  'src',
  'db-types.ts',
);

// Bảng hệ thống/PostGIS không sinh types
const EXCLUDED_TABLES = new Set(['schema_migrations', 'spatial_ref_sys']);

function pascalCase(snake: string): string {
  return snake
    .split('_')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
}

/**
 * Ánh xạ kiểu Postgres → kiểu TS như node-postgres trả về:
 * numeric/bigint là string (giữ độ chính xác), timestamptz/date là Date, jsonb là unknown.
 */
function tsType(udtName: string, enumNames: Map<string, string>): string {
  const enumType = enumNames.get(udtName);
  if (enumType) return enumType;
  switch (udtName) {
    case 'uuid':
    case 'text':
    case 'varchar':
    case 'numeric':
    case 'int8':
    case 'geography':
      return 'string';
    case 'int2':
    case 'int4':
      return 'number';
    case 'bool':
      return 'boolean';
    case 'timestamptz':
    case 'timestamp':
    case 'date':
      return 'Date';
    case 'jsonb':
    case 'json':
      return 'unknown';
    default:
      throw new Error(
        `Chưa có ánh xạ TS cho kiểu Postgres "${udtName}" — bổ sung vào generate-types.ts`,
      );
  }
}

async function main(): Promise<void> {
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    const enums = await client.query<{ typname: string; enumlabel: string }>(
      `SELECT t.typname, e.enumlabel
       FROM pg_type t
       JOIN pg_enum e ON e.enumtypid = t.oid
       JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = 'public'
       ORDER BY t.typname, e.enumsortorder`,
    );
    const enumValues = new Map<string, string[]>();
    for (const row of enums.rows) {
      const list = enumValues.get(row.typname) ?? [];
      list.push(row.enumlabel);
      enumValues.set(row.typname, list);
    }
    const enumNames = new Map<string, string>();
    for (const typname of enumValues.keys()) enumNames.set(typname, pascalCase(typname));

    const columns = await client.query<{
      table_name: string;
      column_name: string;
      is_nullable: 'YES' | 'NO';
      udt_name: string;
    }>(
      `SELECT c.table_name, c.column_name, c.is_nullable, c.udt_name
       FROM information_schema.columns c
       JOIN information_schema.tables t
         ON t.table_schema = c.table_schema AND t.table_name = c.table_name
       WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
       ORDER BY c.table_name, c.ordinal_position`,
    );

    const lines: string[] = [
      '// ⚠️ File SINH TỰ ĐỘNG từ schema DB bằng `npm run db:types` (F-G4) — KHÔNG sửa tay.',
      '// Quy ước kiểu theo node-postgres: numeric/bigint = string, timestamptz = Date, jsonb = unknown.',
      '',
    ];
    for (const [typname, values] of [...enumValues.entries()].sort()) {
      lines.push(
        `export type ${enumNames.get(typname)} = ${values.map((v) => `'${v}'`).join(' | ')};`,
      );
    }
    lines.push('');

    const tables = new Map<string, { column: string; type: string; nullable: boolean }[]>();
    for (const col of columns.rows) {
      if (EXCLUDED_TABLES.has(col.table_name)) continue;
      const cols = tables.get(col.table_name) ?? [];
      cols.push({
        column: col.column_name,
        type: tsType(col.udt_name, enumNames),
        nullable: col.is_nullable === 'YES',
      });
      tables.set(col.table_name, cols);
    }
    for (const [table, cols] of [...tables.entries()].sort()) {
      lines.push(`export interface ${pascalCase(table)}Row {`);
      for (const c of cols) {
        lines.push(`  ${c.column}: ${c.type}${c.nullable ? ' | null' : ''};`);
      }
      lines.push('}', '');
    }

    lines.push('export interface DbSchema {');
    for (const table of [...tables.keys()].sort()) {
      lines.push(`  ${table}: ${pascalCase(table)}Row;`);
    }
    lines.push('}', '');

    writeFileSync(OUTPUT, lines.join('\n'));
    console.log(`Đã sinh ${tables.size} bảng + ${enumValues.size} enum → ${OUTPUT}`);
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
