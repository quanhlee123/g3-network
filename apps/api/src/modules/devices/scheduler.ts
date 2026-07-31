// F-J1/F-J3 — Chạy job quét sức khoẻ thiết bị định kỳ trong tiến trình API
// (modular monolith — cùng cách làm với job đối soát F-C6).
import type { INotifier } from '@g3/contracts';
import type { ApiConfig } from '../../config';
import type { Queryable } from '../../db';
import { quetSucKhoeThietBi } from './health-scan';

export interface LichQuetThietBi {
  dung(): void;
}

export function batLichQuetThietBi(
  db: Queryable,
  config: ApiConfig,
  log: (msg: string) => void,
  notifier?: INotifier,
): LichQuetThietBi {
  const chuKy = config.deviceScan.intervalMs;
  if (chuKy <= 0) {
    log('[F-J1] quét sức khoẻ thiết bị đang TẮT (DEVICE_SCAN_INTERVAL_MS=0)');
    return { dung: () => {} };
  }

  let dangChay = false;
  const chay = async (): Promise<void> => {
    if (dangChay) return; // lượt trước chưa xong thì bỏ lượt này
    dangChay = true;
    try {
      const tomTat = await quetSucKhoeThietBi(db, {
        nguong: config.deviceScan.nguong,
        ...(notifier ? { notifier } : {}),
        log,
      });
      if (tomTat.tamper > 0 || tomTat.offline > 0) {
        log(
          `[F-J1] quét ${tomTat.da_xet} thiết bị im lặng: ${tomTat.tamper} nghi tháo · ` +
            `${tomTat.offline} mất liên lạc`,
        );
      }
    } catch (err) {
      // Job hỏng KHÔNG được giết API (cùng nguyên tắc với job đối soát).
      log(`[F-J1] lỗi khi quét thiết bị: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      dangChay = false;
    }
  };

  const timer = setInterval(() => void chay(), chuKy);
  timer.unref();
  log(
    `[F-J1] quét sức khoẻ thiết bị mỗi ${Math.round(chuKy / 1000)}s ` +
      `(ngưỡng im lặng ${config.deviceScan.nguong.imLangGio}h)`,
  );
  void chay();
  return { dung: () => clearInterval(timer) };
}
