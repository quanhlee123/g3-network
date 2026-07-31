// F-I2 — Đồng hồ SLA chạy trong tiến trình API: ticket quá hạn chưa ai nhận → leo thang.
// Chu kỳ mặc định 60s vì SLA của SOS chỉ 5 phút — quét thưa hơn thì cảnh báo leo thang
// đến muộn tới mức vô nghĩa.
import type { INotifier } from '@g3/contracts';
import type { ApiConfig } from '../../config';
import type { Queryable } from '../../db';
import { quetSlaTicket } from './sos';

export interface LichSla {
  dung(): void;
}

export function batLichSla(
  db: Queryable,
  config: ApiConfig,
  log: (msg: string) => void,
  notifier?: INotifier,
): LichSla {
  const chuKy = config.slaScanIntervalMs;
  if (chuKy <= 0) {
    log('[F-I2] đồng hồ SLA đang TẮT (SLA_SCAN_INTERVAL_MS=0)');
    return { dung: () => {} };
  }

  let dangChay = false;
  const chay = async (): Promise<void> => {
    if (dangChay) return;
    dangChay = true;
    try {
      const tomTat = await quetSlaTicket(db, { ...(notifier ? { notifier } : {}), log });
      if (tomTat.qua_han > 0) log(`[F-I2] ${tomTat.qua_han} ticket quá hạn SLA — đã leo thang`);
    } catch (err) {
      // Job hỏng KHÔNG được giết API (cùng nguyên tắc với F-C6 và F-J1).
      log(`[F-I2] lỗi khi quét SLA: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      dangChay = false;
    }
  };

  const timer = setInterval(() => void chay(), chuKy);
  timer.unref();
  log(`[F-I2] đồng hồ SLA quét mỗi ${Math.round(chuKy / 1000)}s`);
  void chay();
  return { dung: () => clearInterval(timer) };
}
