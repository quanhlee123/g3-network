// NF-04 — Bộ điều phối load test: bật service + simulator, lấy mẫu /metrics theo chu kỳ,
// tắt sạch, rồi trả về toàn bộ số liệu thô cho phần viết báo cáo.
//
// Tách khỏi index.ts để phần đọc tham số và phần chạy không dính vào nhau.
import { spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs';
import path from 'node:path';
import { docMetrics, lay, laySo, layTheoNhan, layTong, type DongMetric } from './do-luong';

export interface CauHinhChay {
  goc: string;
  soXe: number;
  soTram: number;
  soPhut: number;
  /** Chu kỳ xe gửi telemetry (ms) — mặc định 10.000 như thiết bị thật. */
  chuKyXeMs: number;
  /** Chu kỳ lấy mẫu /metrics (giây). */
  chuKyMauGiay: number;
  thuMucLog: string;
  cong: { ingest: number; csms: number; api: number };
  log: (msg: string) => void;
}

export interface MauDo {
  luc: string;
  giay_tu_dau: number;
  ingest: DongMetric[] | null;
  csms: DongMetric[] | null;
  api: DongMetric[] | null;
}

export interface TienTrinhLoi {
  ten: string;
  ma_thoat: number | null;
  tin_hieu: string | null;
  luc: string;
}

/** Lý do bản tin bị cách ly, đếm trong ĐÚNG cửa sổ chạy (không lẫn dữ liệu cũ). */
export interface LyDoCachLy {
  ly_do: string;
  so: number;
}

export interface KetQuaChay {
  /**
   * Lúc BẬT service — sớm hơn `bat_dau` (lúc bắt đầu lấy mẫu) vài chục giây.
   *
   * Phải có riêng con số này vì ingest vừa subscribe MQTT là broker đẩy ngay các bản tin
   * RETAINED của lượt chạy trước; chúng bị cách ly và tính vào counter, nhưng xảy ra
   * TRƯỚC `bat_dau`. Lọc bảng `telemetry_quarantine` theo `bat_dau` sẽ ra rỗng trong khi
   * counter báo có — báo cáo khi đó nói "không phân loại được" một cách vô lý.
   */
  khoi_dong: string;
  bat_dau: string;
  ket_thuc: string;
  mau: MauDo[];
  scrape_hut: { ingest: number; csms: number; api: number };
  tien_trinh_chet: TienTrinhLoi[];
  /** Dòng stderr đáng ngờ bắt được từ service (đã lọc log bình thường). */
  loi_stderr: { ten: string; dong: string }[];
  /** Điền sau khi chạy xong, ở index.ts (chay.ts cố ý không mở kết nối database). */
  ly_do_cach_ly: LyDoCachLy[];
}

const TSX = 'node_modules/tsx/dist/cli.mjs';

interface TienTrinh {
  ten: string;
  proc: ChildProcess;
  out: WriteStream;
  daChet: TienTrinhLoi | null;
}

/** Bật 1 tiến trình Node chạy file TypeScript qua tsx. */
function bat(
  cfg: CauHinhChay,
  ten: string,
  script: string,
  args: string[],
  loiStderr: { ten: string; dong: string }[],
): TienTrinh {
  const duong = path.join(cfg.thuMucLog, `${ten}.log`);
  const out = createWriteStream(duong, { flags: 'w' });
  // Gọi thẳng node + tsx thay vì `npm run`: trên Windows, npm là file .cmd nên
  // proc.kill() chỉ giết cái vỏ, để lại tiến trình Node con chạy mồ côi giữ cổng.
  const proc = spawn(process.execPath, [path.join(cfg.goc, TSX), script, ...args], {
    cwd: cfg.goc,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const tt: TienTrinh = { ten, proc, out, daChet: null };

  proc.stdout?.on('data', (c: Buffer) => out.write(c));
  proc.stderr?.on('data', (c: Buffer) => {
    out.write(c);
    for (const dong of c.toString('utf8').split('\n')) {
      const s = dong.trim();
      // pino của Fastify ghi log thường ra stderr — chỉ giữ dòng thật sự là lỗi,
      // nếu không thì báo cáo sẽ đầy "lỗi" trong khi hệ chạy hoàn toàn bình thường.
      if (s === '' || !/error|Error|ECONNREFUSED|EADDRINUSE|unhandled|FATAL/.test(s)) continue;
      if (loiStderr.length < 200) loiStderr.push({ ten, dong: s.slice(0, 500) });
    }
  });
  proc.on('exit', (code, signal) => {
    tt.daChet = {
      ten,
      ma_thoat: code,
      tin_hieu: signal,
      luc: new Date().toISOString(),
    };
  });
  return tt;
}

/** Chờ /health của một service trả 200 trong tối đa `hanGiay` giây. */
async function choKhoe(url: string, hanGiay: number, log: (m: string) => void): Promise<boolean> {
  const han = Date.now() + hanGiay * 1000;
  while (Date.now() < han) {
    const body = await lay(url, 2000);
    if (body !== null) return true;
    await nghi(1000);
  }
  log(`[load-test] KHÔNG khoẻ sau ${hanGiay}s: ${url}`);
  return false;
}

const nghi = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function chayLoadTest(cfg: CauHinhChay): Promise<KetQuaChay> {
  mkdirSync(cfg.thuMucLog, { recursive: true });
  const loiStderr: { ten: string; dong: string }[] = [];
  const tienTrinh: TienTrinh[] = [];

  const dungHet = async (): Promise<void> => {
    for (const t of tienTrinh) {
      if (t.daChet === null) t.proc.kill('SIGTERM');
    }
    await nghi(3000);
    for (const t of tienTrinh) {
      if (t.daChet === null) t.proc.kill('SIGKILL');
      t.out.end();
    }
  };

  const khoiDongMs = Date.now();

  try {
    // --- 1. Bật ba service nền ---------------------------------------------------
    cfg.log('[load-test] bật services/ingest, services/csms, apps/api…');
    tienTrinh.push(bat(cfg, 'ingest', 'services/ingest/src/index.ts', [], loiStderr));
    tienTrinh.push(bat(cfg, 'csms', 'services/csms/src/index.ts', [], loiStderr));
    tienTrinh.push(bat(cfg, 'api', 'apps/api/src/index.ts', [], loiStderr));

    const khoe = await Promise.all([
      choKhoe(`http://localhost:${cfg.cong.ingest}/health`, 60, cfg.log),
      choKhoe(`http://localhost:${cfg.cong.csms}/health`, 60, cfg.log),
      choKhoe(`http://localhost:${cfg.cong.api}/health`, 60, cfg.log),
    ]);
    if (khoe.some((k) => !k)) {
      throw new Error(
        'Có service không lên được — xem log trong ' +
          cfg.thuMucLog +
          '. Kiểm tra docker compose (db, emqx) đã chạy chưa.',
      );
    }
    cfg.log('[load-test] cả 3 service đã khoẻ.');

    // --- 2. Bật tải: N xe + M trụ ------------------------------------------------
    cfg.log(`[load-test] bật ${cfg.soXe} xe + ${cfg.soTram} trụ…`);
    tienTrinh.push(
      bat(
        cfg,
        'vehicle-sim',
        'simulators/vehicle-sim/src/index.ts',
        [
          '--count',
          String(cfg.soXe),
          // BẮT BUỘC: mặc định của vehicle-sim là 'G3-SIM' → sinh VIN "G3-SIM-0001",
          // trong khi seed tạo "G3-SIM-VIN-0001". Lệch một chữ là 100% bản tin rơi vào
          // telemetry_quarantine với lý do vin_khong_ton_tai, và bài load test đo được
          // đúng con số 0 mà trông vẫn như đang chạy.
          '--vin-prefix',
          'G3-SIM-VIN',
          '--interval-ms',
          String(cfg.chuKyXeMs),
          '--scenario',
          'normal',
          '--route',
          'bac',
        ],
        loiStderr,
      ),
    );
    tienTrinh.push(
      bat(
        cfg,
        'ocpp-sim',
        'simulators/ocpp-sim/src/index.ts',
        ['--stations', String(cfg.soTram), '--scenario', 'normal', '--interval-ms', '5000'],
        loiStderr,
      ),
    );

    // --- 3. Lấy mẫu trong suốt thời lượng ----------------------------------------
    const batDauMs = Date.now();
    const ketThucMs = batDauMs + cfg.soPhut * 60_000;
    const mau: MauDo[] = [];
    const hut = { ingest: 0, csms: 0, api: 0 };

    while (Date.now() < ketThucMs) {
      await nghi(cfg.chuKyMauGiay * 1000);
      const [i, c, a] = await Promise.all([
        lay(`http://localhost:${cfg.cong.ingest}/metrics`),
        lay(`http://localhost:${cfg.cong.csms}/metrics`),
        lay(`http://localhost:${cfg.cong.api}/metrics`),
      ]);
      if (i === null) hut.ingest += 1;
      if (c === null) hut.csms += 1;
      if (a === null) hut.api += 1;

      const m: MauDo = {
        luc: new Date().toISOString(),
        giay_tu_dau: Math.round((Date.now() - batDauMs) / 1000),
        ingest: i === null ? null : docMetrics(i),
        csms: c === null ? null : docMetrics(c),
        api: a === null ? null : docMetrics(a),
      };
      mau.push(m);

      if (mau.length % 4 === 0 && m.ingest) {
        const p95 = laySo(m.ingest, 'g3_ingest_lag_p95_5m_seconds');
        const ban_tin = layTheoNhan(m.ingest, 'g3_ingest_records_total', 'result');
        const canh_bao = layTong(m.ingest, 'g3_alerts_total');
        cfg.log(
          `[load-test] +${Math.round(m.giay_tu_dau / 60)} phút · p95 lag ${p95 === null ? '—' : p95.toFixed(1)}s · ` +
            `valid ${ban_tin.valid ?? 0} · trùng ${ban_tin.duplicate ?? 0} · cách ly ${ban_tin.quarantine ?? 0} · ` +
            `cảnh báo ${canh_bao}`,
        );
      }
    }

    return {
      khoi_dong: new Date(khoiDongMs).toISOString(),
      bat_dau: new Date(batDauMs).toISOString(),
      ket_thuc: new Date().toISOString(),
      mau,
      scrape_hut: hut,
      tien_trinh_chet: tienTrinh.map((t) => t.daChet).filter((x): x is TienTrinhLoi => x !== null),
      loi_stderr: loiStderr,
      ly_do_cach_ly: [],
    };
  } finally {
    cfg.log('[load-test] tắt sạch simulator và service…');
    await dungHet();
  }
}
