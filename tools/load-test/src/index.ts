// NF-04 — Load test: 300 xe + 10 trạm trong 30 phút, đo NF-01/NF-02, ghi báo cáo.
// Chạy: npm run loadtest -- --vehicles 300 --stations 10 --minutes 30
//
// Cần trước: `docker compose -f infra/docker-compose.yml up -d` + `npm run db:migrate`
// + `npm run db:seed`. Lệnh này tự bật/tắt ingest, csms, api và hai simulator.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import pg from 'pg';
import { databaseUrl, loadEnv } from '@g3/db';
import { chayLoadTest, type CauHinhChay, type KetQuaChay } from './chay';
import { tinhTomTat, vietBaoCao, type ThongSo } from './bao-cao';
import { seedTai } from './seed-tai';

export { seedTai } from './seed-tai';
export * from './do-luong';
export { tinhTomTat, vietBaoCao } from './bao-cao';

/** Gốc repo, suy từ vị trí file này (tools/load-test/src/index.ts). */
export const GOC_REPO = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');

export interface ThamSo extends ThongSo {
  duongBaoCao: string;
  boQuaSeed: boolean;
  /**
   * Dựng lại báo cáo từ `load-test-logs/so-lieu-tho.json` của một lượt chạy CŨ, không
   * chạy tải lại. Có để sửa cách trình bày / cách diễn giải mà không phải trả giá 30 phút,
   * và để người sau kiểm chứng được rằng báo cáo suy ra đúng từ số liệu thô.
   */
  tuSoLieu?: string | undefined;
}

function soNguyen(ten: string, raw: string | undefined, mac_dinh: number, min: number): number {
  if (raw === undefined) return mac_dinh;
  const v = Number(raw);
  if (!Number.isInteger(v) || v < min) {
    throw new Error(`--${ten} phải là số nguyên >= ${min}, nhận được: "${raw}"`);
  }
  return v;
}

export function docThamSo(argv: string[]): ThamSo {
  const { values } = parseArgs({
    args: argv,
    options: {
      vehicles: { type: 'string' },
      stations: { type: 'string' },
      minutes: { type: 'string' },
      'interval-ms': { type: 'string' },
      'sample-seconds': { type: 'string' },
      out: { type: 'string' },
      'skip-seed': { type: 'boolean', default: false },
      'tu-so-lieu': { type: 'string' },
    },
    allowPositionals: true,
  });
  return {
    soXe: soNguyen('vehicles', values.vehicles, 300, 1),
    soTram: soNguyen('stations', values.stations, 10, 1),
    soPhut: soNguyen('minutes', values.minutes, 30, 1),
    chuKyXeMs: soNguyen('interval-ms', values['interval-ms'], 10_000, 100),
    chuKyMauGiay: soNguyen('sample-seconds', values['sample-seconds'], 15, 1),
    duongBaoCao: (values.out as string | undefined) ?? 'docs/handover/load-test-300.md',
    boQuaSeed: values['skip-seed'] === true,
    tuSoLieu: values['tu-so-lieu'] as string | undefined,
  };
}

/**
 * Phân loại bản tin bị cách ly TRONG cửa sổ chạy. Lọc theo thời điểm bắt đầu chứ không
 * lấy cả bảng: `telemetry_quarantine` còn dữ liệu của các lượt demo trước, gộp vào là đổ
 * lỗi cũ lên đầu lượt chạy này.
 */
async function docLyDoCachLy(tuLuc: string): Promise<{ ly_do: string; so: number }[]> {
  const db = new pg.Client({ connectionString: databaseUrl() });
  try {
    await db.connect();
    const res = await db.query<{ reason: string; so: string }>(
      `SELECT reason, count(*)::text AS so FROM telemetry_quarantine
       WHERE received_at >= $1 GROUP BY reason ORDER BY count(*) DESC`,
      [tuLuc],
    );
    return res.rows.map((r) => ({ ly_do: r.reason, so: Number(r.so) }));
  } catch {
    return []; // không đọc được thì báo cáo nói rõ "không phân loại được"
  } finally {
    await db.end().catch(() => undefined);
  }
}

/** Ghi báo cáo + số liệu thô ra đĩa. Dùng chung cho lượt chạy thật và lượt dựng lại. */
function ghiKetQua(ts: ThamSo, kq: KetQuaChay, thuMucLog: string, log: (m: string) => void): void {
  const tt = tinhTomTat(kq);
  const duong = path.join(GOC_REPO, ts.duongBaoCao);
  mkdirSync(path.dirname(duong), { recursive: true });
  writeFileSync(duong, vietBaoCao(kq, ts, tt), 'utf8');
  // Số liệu thô để đối chiếu lại về sau mà không phải chạy lại 30 phút.
  mkdirSync(thuMucLog, { recursive: true });
  writeFileSync(
    path.join(thuMucLog, 'so-lieu-tho.json'),
    JSON.stringify({ thamSo: ts, tomTat: tt, chay: kq }, null, 2),
    'utf8',
  );
  log(`[load-test] xong. Báo cáo: ${ts.duongBaoCao}`);
  log(`[load-test] p95 lag đỉnh: ${tt.lag_p95_gauge_max ?? '—'}s · NF-01 ngưỡng 30s`);
}

async function main(): Promise<void> {
  loadEnv();
  const ts = docThamSo(process.argv.slice(2));
  const log = (m: string): void => console.log(m);
  const thuMucLog = path.join(GOC_REPO, 'load-test-logs');

  // Dựng lại báo cáo từ số liệu cũ — không đụng tới database, không chạy tải.
  if (ts.tuSoLieu !== undefined) {
    const tho = JSON.parse(readFileSync(path.resolve(GOC_REPO, ts.tuSoLieu), 'utf8')) as {
      thamSo: ThamSo;
      chay: KetQuaChay;
    };
    // Thông số tải lấy từ FILE (đó mới là lượt chạy thật), chỉ đường ghi ra là lấy theo
    // dòng lệnh — nếu không sẽ vô tình dán nhãn "300 xe" lên số liệu của lượt 20 xe.
    const tsGoc: ThamSo = { ...tho.thamSo, duongBaoCao: ts.duongBaoCao };
    log(`[load-test] dựng lại báo cáo từ ${ts.tuSoLieu} (không chạy tải).`);
    // Đọc lại phân loại cách ly: số liệu thô của lượt cũ có thể lưu danh sách rỗng vì
    // lọc sai cửa sổ thời gian. Bảng telemetry_quarantine vẫn còn dữ liệu để đọc lại.
    if (tho.chay.ly_do_cach_ly.length === 0) {
      tho.chay.ly_do_cach_ly = await docLyDoCachLy(tho.chay.khoi_dong ?? tho.chay.bat_dau);
    }
    ghiKetQua(tsGoc, tho.chay, thuMucLog, log);
    return;
  }

  log(
    `[load-test] ${ts.soXe} xe · ${ts.soTram} trụ · ${ts.soPhut} phút · ` +
      `mẫu mỗi ${ts.chuKyMauGiay}s → ${ts.duongBaoCao}`,
  );

  if (!ts.boQuaSeed) {
    const db = new pg.Client({ connectionString: databaseUrl() });
    await db.connect();
    try {
      await seedTai(db, { soXe: ts.soXe, soTram: ts.soTram, log });
    } finally {
      await db.end();
    }
  }

  const cfg: CauHinhChay = {
    goc: GOC_REPO,
    soXe: ts.soXe,
    soTram: ts.soTram,
    soPhut: ts.soPhut,
    chuKyXeMs: ts.chuKyXeMs,
    chuKyMauGiay: ts.chuKyMauGiay,
    thuMucLog,
    cong: {
      ingest: Number(process.env.INGEST_METRICS_PORT ?? 9464),
      csms: Number(process.env.CSMS_METRICS_PORT ?? 9465),
      api: Number(process.env.API_PORT ?? 3000),
    },
    log,
  };

  const kq = await chayLoadTest(cfg);
  kq.ly_do_cach_ly = await docLyDoCachLy(kq.khoi_dong);
  ghiKetQua(ts, kq, thuMucLog, log);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    console.error(`[load-test] lỗi: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
}
