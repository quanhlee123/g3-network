// F-H1 — Nối lại giao dịch mồ côi với phiên sạc về muộn.
//
// Vì sao cần một vòng lặp riêng thay vì chỉ nối lúc nhận webhook: thứ tự có thể NGƯỢC LẠI.
// Webhook đến lúc 10:00 khi phiên chưa có; trụ nối lại mạng và gửi StopTransaction lúc 14:00.
// Không có job này thì giao dịch đó nằm mồ côi vĩnh viễn — tiền đã thu mà đối soát 3 chiều
// (F-C6) không bao giờ khớp được vì thiếu chiều thanh toán.
import type { ApiConfig } from '../../config';
import type { Queryable } from '../../db';
import { noiCacGiaoDichMoCoi } from './service';

export interface LichNoiPhien {
  dung(): void;
}

export function batLichNoiPhien(
  db: Queryable,
  config: ApiConfig,
  log: (msg: string) => void,
): LichNoiPhien {
  const chuKy = config.thanhToan.noiPhienIntervalMs;
  if (chuKy <= 0) {
    log('[F-H1] job nối phiên cho giao dịch mồ côi đang TẮT (PAYMENT_LINK_INTERVAL_MS=0)');
    return { dung: () => {} };
  }

  let dangChay = false;
  const chay = async (): Promise<void> => {
    if (dangChay) return;
    dangChay = true;
    try {
      const soDong = await noiCacGiaoDichMoCoi(db);
      if (soDong > 0) log(`[F-H1] đã nối ${soDong} giao dịch với phiên sạc về muộn`);
    } catch (err) {
      log(`[F-H1] lỗi khi nối phiên: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      dangChay = false;
    }
  };

  const timer = setInterval(() => void chay(), chuKy);
  timer.unref();
  log(`[F-H1] nối giao dịch mồ côi mỗi ${Math.round(chuKy / 1000)}s`);
  void chay();
  return { dung: () => clearInterval(timer) };
}
