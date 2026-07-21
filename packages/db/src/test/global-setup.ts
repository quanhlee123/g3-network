// F-G4 · Global setup vitest: tạo mới database g3_test + bật extension + chạy migration.
// Tuyệt đối không đụng database g3 dùng chung (ranh giới CLAUDE.md).
import pg from 'pg';
import { databaseUrl, testDatabaseUrl } from '../env';
import { runMigrations } from '../migrations';

export default async function setup(): Promise<void> {
  const admin = new pg.Client({ connectionString: databaseUrl() });
  await admin.connect();
  try {
    await admin.query('DROP DATABASE IF EXISTS g3_test WITH (FORCE)');
    await admin.query('CREATE DATABASE g3_test');
  } finally {
    await admin.end();
  }

  const test = new pg.Client({ connectionString: testDatabaseUrl() });
  await test.connect();
  try {
    await test.query('CREATE EXTENSION IF NOT EXISTS timescaledb');
    await test.query('CREATE EXTENSION IF NOT EXISTS postgis');
    await runMigrations(test);
  } finally {
    await test.end();
  }
}
