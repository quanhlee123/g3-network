// F-A1 — Buffer store-and-forward (NF-09): giữ bản ghi khi mất sóng, xả FIFO khi có sóng lại.
// Bản ghi giữ nguyên ts thiết bị lúc sinh — KHÔNG ghi đè bằng giờ gửi.
import type { TelemetryRecord } from '@g3/contracts';

export class StoreAndForwardBuffer {
  #records: TelemetryRecord[] = [];

  enqueue(record: TelemetryRecord): void {
    this.#records.push(record);
  }

  /** Trả về toàn bộ bản ghi theo đúng thứ tự sinh và làm rỗng buffer. */
  drain(): TelemetryRecord[] {
    const drained = this.#records;
    this.#records = [];
    return drained;
  }

  get size(): number {
    return this.#records.length;
  }
}
