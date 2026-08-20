// NF-14 — /metrics của apps/api: các con số NGHIỆP VỤ mà chỉ database mới biết.
//
// Phân vai rõ giữa 3 nguồn metric, để không đếm trùng:
//   services/ingest  → nhịp dòng dữ liệu (lag NF-01, số bản tin, số cảnh báo VỪA bắn)
//   services/csms    → nhịp OCPP (lag NF-02, số trụ kết nối)
//   apps/api (đây)   → TỒN KHO đọc từ DB: cảnh báo đang mở, đối soát lệch (NF-10), cách ly
//
// Vì sao đọc DB mỗi lần scrape thay vì đếm trong RAM: các con số này phải ĐÚNG kể cả sau
// khi service khởi động lại, và phải phản ánh cả những thay đổi do người vận hành làm tay.
import { Gauge, Registry } from 'prom-client';
import type { FastifyInstance } from 'fastify';
import type { Queryable } from '../db';

export interface MetricsRoutesDeps {
  db: Queryable;
}

/** Trần thời gian cho cả lượt truy vấn metric. Scrape treo còn tệ hơn scrape thiếu số. */
export const METRICS_QUERY_TIMEOUT_MS = 5_000;

interface SoLieu {
  canhBaoMo: { type: string; severity: number; so: number }[];
  doiSoat: { status: string; so: number }[];
  /**
   * Số phiên được đối soát trong 24h — CÙNG cửa sổ với `lechMaxPct`.
   *
   * Bắt buộc phải có riêng con số này: `lechMaxPct` trả 0 khi 24h qua chưa đối soát phiên
   * nào, mà 0 thì trông hệt như "khớp hoàn hảo". Đọc kèm số phiên mới phân biệt được
   * "đối soát 12 phiên, lệch tối đa 0%" với "chưa đối soát phiên nào".
   */
  doiSoat24h: number;
  lechMaxPct: number | null;
  cachLy24h: number;
  phienSac24h: number;
}

/** Gom mọi số liệu trong MỘT lượt, để scrape không phụ thuộc thứ tự truy vấn. */
export async function docSoLieu(db: Queryable): Promise<SoLieu> {
  const [canhBao, doiSoat, lech, cachLy, phien] = await Promise.all([
    db.query(
      `SELECT type::text AS type, severity, count(*)::int AS so
       FROM alerts WHERE status <> 'resolved' GROUP BY type, severity`,
    ),
    db.query(
      `SELECT status::text AS status, count(*)::int AS so
       FROM reconciliation_results GROUP BY status`,
    ),
    // Chỉ 24h gần nhất: lệch tệ nhất của 6 tháng trước không nói gì về sức khoẻ HÔM NAY.
    // Lấy luôn SỐ PHIÊN trong cùng cửa sổ — thiếu nó thì "lệch 0%" không đọc được nghĩa.
    db.query(
      `SELECT max(lech_max_pct)::float8 AS lech_max, count(*)::int AS so
       FROM reconciliation_results WHERE checked_at > now() - interval '24 hours'`,
    ),
    db.query(
      `SELECT count(*)::int AS so FROM telemetry_quarantine
       WHERE received_at > now() - interval '24 hours'`,
    ),
    db.query(
      `SELECT count(*)::int AS so FROM charging_sessions
       WHERE started_at > now() - interval '24 hours'`,
    ),
  ]);

  return {
    canhBaoMo: canhBao.rows.map((r) => ({
      type: r.type as string,
      severity: Number(r.severity),
      so: r.so as number,
    })),
    doiSoat: doiSoat.rows.map((r) => ({ status: r.status as string, so: r.so as number })),
    doiSoat24h: (lech.rows[0]?.so as number | undefined) ?? 0,
    lechMaxPct: (lech.rows[0]?.lech_max as number | null) ?? null,
    cachLy24h: (cachLy.rows[0]?.so as number | undefined) ?? 0,
    phienSac24h: (phien.rows[0]?.so as number | undefined) ?? 0,
  };
}

export async function metricsRoutes(app: FastifyInstance, deps: MetricsRoutesDeps): Promise<void> {
  const { db } = deps;
  // Registry RIÊNG, không dùng global: nhiều instance app trong cùng tiến trình test sẽ
  // đụng nhau ở registry mặc định của prom-client và ném "metric đã tồn tại".
  const registry = new Registry();

  const canhBaoMo = new Gauge({
    name: 'g3_alerts_open',
    help: 'Số cảnh báo đang mở (chưa resolved), theo loại và mức nghiêm trọng',
    labelNames: ['type', 'severity'],
    registers: [registry],
  });
  const doiSoat = new Gauge({
    name: 'g3_reconciliation_results',
    help: 'Số phiên sạc đã đối soát 3 chiều, theo kết quả (NF-10)',
    labelNames: ['status'],
    registers: [registry],
  });
  const lechMax = new Gauge({
    name: 'g3_reconciliation_lech_max_pct',
    help: 'Lệch kWh lớn nhất trong 24h qua (%) — NF-10 cảnh báo khi >1%',
    registers: [registry],
  });
  const doiSoat24h = new Gauge({
    name: 'g3_reconciliation_checked_24h',
    help:
      'Số phiên đã đối soát trong 24h — đọc KÈM g3_reconciliation_lech_max_pct. ' +
      'Bằng 0 nghĩa là lệch 0% chỉ vì chưa đối soát gì, không phải vì khớp hoàn hảo.',
    registers: [registry],
  });
  const cachLy = new Gauge({
    name: 'g3_telemetry_quarantine_24h',
    help: 'Số bản tin telemetry bị cách ly trong 24h (sai schema / VIN lạ)',
    registers: [registry],
  });
  const phienSac = new Gauge({
    name: 'g3_charging_sessions_24h',
    help: 'Số phiên sạc ghi nhận trong 24h',
    registers: [registry],
  });
  const scrapeLoi = new Gauge({
    name: 'g3_api_metrics_scrape_error',
    help: '1 = lượt scrape gần nhất không đọc được DB (số bên dưới là số CŨ, đừng tin)',
    registers: [registry],
  });

  app.get(
    '/metrics',
    {
      // Công khai như /health: Prometheus scrape trong mạng nội bộ, không có tài khoản.
      // KHÔNG expose cổng này ra internet (quy tắc 12) — chỉ số vận hành, không phải API.
      config: { public: true },
      // Ẩn khỏi OpenAPI: đây là endpoint hạ tầng, không phải hợp đồng API cho client.
      schema: { hide: true },
    },
    async (_req, reply) => {
      try {
        const soLieu = await Promise.race([
          docSoLieu(db),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error('quá hạn đọc số liệu')),
              METRICS_QUERY_TIMEOUT_MS,
            ).unref?.(),
          ),
        ]);
        // reset() trước khi set: một cặp nhãn biến mất (vd không còn cảnh báo severity 3)
        // phải BIẾN MẤT khỏi output, chứ không đứng yên ở giá trị cũ mãi mãi.
        canhBaoMo.reset();
        for (const r of soLieu.canhBaoMo) {
          canhBaoMo.set({ type: r.type, severity: String(r.severity) }, r.so);
        }
        doiSoat.reset();
        for (const r of soLieu.doiSoat) doiSoat.set({ status: r.status }, r.so);
        // Chưa có phiên nào được đối soát trong 24h → 0, KHÔNG phải "lệch 0%".
        // Người đọc phân biệt hai trường hợp bằng g3_reconciliation_checked_24h.
        lechMax.set(soLieu.lechMaxPct ?? 0);
        doiSoat24h.set(soLieu.doiSoat24h);
        cachLy.set(soLieu.cachLy24h);
        phienSac.set(soLieu.phienSac24h);
        scrapeLoi.set(0);
      } catch (err) {
        // DB hỏng thì vẫn TRẢ metric, kèm cờ báo số liệu không đáng tin — Prometheus mất
        // hẳn target sẽ khó chẩn đoán hơn là thấy g3_api_metrics_scrape_error = 1.
        scrapeLoi.set(1);
        app.log.error({ err }, 'không đọc được số liệu cho /metrics');
      }
      return reply.type(registry.contentType).send(await registry.metrics());
    },
  );
}
