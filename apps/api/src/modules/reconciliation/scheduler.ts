// F-C6 — Chạy job đối soát định kỳ trong tiến trình API (modular monolith: không thêm
// service riêng, không cần hệ thống hàng đợi ở Phase 1 — CLAUDE.md).
import type { ApiConfig } from '../../config';
import type { Queryable } from '../../db';
import { chayDoiSoat } from './reconcile';

export interface LichDoiSoat {
  dung(): void;
}

/**
 * Bật vòng lặp đối soát. RECONCILE_INTERVAL_MS = 0 thì tắt (chỉ chạy tay qua
 * POST /reconciliation/run hoặc `npm run reconcile -w apps/api`).
 */
export function batLichDoiSoat(
  db: Queryable,
  config: ApiConfig,
  log: (msg: string) => void,
): LichDoiSoat {
  const chuKy = config.reconcile.intervalMs;
  if (chuKy <= 0) {
    log('[F-C6] đối soát định kỳ đang TẮT (RECONCILE_INTERVAL_MS=0) — chỉ chạy tay');
    return { dung: () => {} };
  }

  let dangChay = false;
  const chay = async (): Promise<void> => {
    // Lượt trước chưa xong thì bỏ lượt này — không chồng job lên nhau.
    if (dangChay) return;
    dangChay = true;
    try {
      const tomTat = await chayDoiSoat(db, { ...config.reconcile, log });
      if (tomTat.da_xet > 0) {
        log(
          `[F-C6] đối soát ${tomTat.da_xet} phiên: ${tomTat.khop} khớp · ${tomTat.lech} lệch · ` +
            `${tomTat.thieu_du_lieu} thiếu dữ liệu`,
        );
      }
    } catch (err) {
      // Job hỏng KHÔNG được giết API — luồng cảnh báo pin quan trọng hơn (NF-03).
      log(`[F-C6] lỗi khi đối soát: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      dangChay = false;
    }
  };

  const timer = setInterval(() => void chay(), chuKy);
  timer.unref(); // không giữ tiến trình sống chỉ vì cái hẹn giờ này
  log(
    `[F-C6] đối soát định kỳ mỗi ${Math.round(chuKy / 1000)}s (ngưỡng ${config.reconcile.nguongPct}%)`,
  );
  void chay(); // chạy ngay một lượt lúc khởi động
  return { dung: () => clearInterval(timer) };
}
