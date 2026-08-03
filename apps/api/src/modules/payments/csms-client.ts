// F-H1 — Bản cài đặt ICsmsCommander gọi HTTP nội bộ của services/csms.
// Endpoint đó KHÔNG expose ra internet (quy tắc 12) — chỉ backend nội bộ gọi.
import type { ICsmsCommander, KetQuaLenh } from '@g3/contracts';

export interface CsmsHttpOptions {
  /** Gốc URL HTTP nội bộ của CSMS, vd http://localhost:9221 */
  baseUrl: string;
  /** Trần thời gian chờ (ms). Trụ không trả lời thì phải hỏng NHANH, không treo request. */
  timeoutMs?: number;
}

export class HttpCsmsCommander implements ICsmsCommander {
  readonly #baseUrl: string;
  readonly #timeoutMs: number;

  constructor(opts: CsmsHttpOptions) {
    this.#baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.#timeoutMs = opts.timeoutMs ?? 10_000;
  }

  remoteStart(stationCode: string, connectorId: number, idTag: string): Promise<KetQuaLenh> {
    return this.#goi('/internal/remote-start', { stationCode, connectorId, idTag });
  }

  remoteStop(stationCode: string, transactionId: number): Promise<KetQuaLenh> {
    return this.#goi('/internal/remote-stop', { stationCode, transactionId });
  }

  async #goi(duongDan: string, body: Record<string, unknown>): Promise<KetQuaLenh> {
    const res = await fetch(`${this.#baseUrl}${duongDan}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.#timeoutMs),
    });
    if (!res.ok) {
      const chiTiet = (await res.text()).slice(0, 200);
      throw new Error(`CSMS trả ${res.status}: ${chiTiet}`);
    }
    const data = (await res.json()) as { status?: string };
    return data.status === 'Accepted' ? 'Accepted' : 'Rejected';
  }
}
