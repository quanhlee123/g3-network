// F-B3 — Chạy job đối chiếu vi phạm định kỳ trong tiến trình API (modular monolith:
// không thêm service riêng, không hàng đợi ở Phase 1 — CLAUDE.md).
//
// Vì sao là job quét chứ không phải CSMS gọi thẳng sau StopTransaction: CSMS là tiến trình
// khác (services/csms). Nếu nó chết ngay sau khi ghi phiên sạc thì phiên đó vĩnh viễn không
// được đối chiếu — mà "phiên không được xét" chính là lỗ hổng mà hồ sơ bảo hành không chịu
// nổi. Job quét lấy đúng những phiên chưa có dòng trong violation_checks nên tự bắt kịp.
import type { INotifier } from '@g3/contracts';
import type { ApiConfig } from '../../config';
import type { Queryable } from '../../db';
import { kiemTraViPham } from './detect';

export interface LichViPham {
  dung(): void;
}

export function batLichViPham(
  db: Queryable,
  config: ApiConfig,
  log: (msg: string) => void,
  notifier?: INotifier,
): LichViPham {
  const chuKy = config.viPham.intervalMs;
  if (chuKy <= 0) {
    log('[F-B3] quét vi phạm định kỳ đang TẮT (VIOLATION_SCAN_INTERVAL_MS=0) — chỉ chạy tay');
    return { dung: () => {} };
  }

  let dangChay = false;
  const chay = async (): Promise<void> => {
    if (dangChay) return; // lượt trước chưa xong thì bỏ lượt này
    dangChay = true;
    try {
      const tomTat = await kiemTraViPham(db, {
        muiGio: config.muiGio,
        socBreachCount: config.viPham.socBreachCount,
        socBreachWindowDays: config.viPham.socBreachWindowDays,
        ...(notifier ? { notifier } : {}),
        log,
      });
      if (tomTat.da_xet > 0) {
        log(
          `[F-B3] xét ${tomTat.da_xet} phiên: ${tomTat.sach} đạt · ${tomTat.co_vi_pham} có vi phạm · ` +
            `${tomTat.khong_co_chinh_sach} chưa có chính sách · ${tomTat.vi_pham_moi} vi phạm mới ghi`,
        );
      }
    } catch (err) {
      // Job hỏng KHÔNG được giết API — luồng cảnh báo pin quan trọng hơn (NF-03).
      log(`[F-B3] lỗi khi quét vi phạm: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      dangChay = false;
    }
  };

  const timer = setInterval(() => void chay(), chuKy);
  timer.unref();
  log(`[F-B3] quét vi phạm sạc mỗi ${Math.round(chuKy / 1000)}s`);
  void chay();
  return { dung: () => clearInterval(timer) };
}
