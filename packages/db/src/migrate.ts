// F-G4 · CLI migration: npm run db:migrate (chạy từ gốc repo).
import pg from 'pg';
import { databaseUrl, retentionMonths } from './env';
import { applyRetention, runMigrations } from './migrations';

async function main(): Promise<void> {
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    const applied = await runMigrations(client);
    if (applied.length === 0) {
      console.log('Không có migration mới — schema đã ở phiên bản mới nhất.');
    } else {
      for (const file of applied) console.log(`Đã áp: ${file}`);
    }
    const months = retentionMonths();
    await applyRetention(client, months);
    console.log(`Retention telematics hot: ${months} tháng (NF-16).`);
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
