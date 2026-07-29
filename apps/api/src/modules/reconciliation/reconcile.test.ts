// F-C6 · NF-10 — Đối soát 3 chiều trụ ↔ xe ↔ thanh toán (luồng trọng yếu, quy tắc 7).
//
// Test BẮT BUỘC của Prompt 06: đối soát phải phát hiện phiên bị làm lệch kWh 5%.
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { testDatabaseUrl } from '@g3/db';
import {
  insertTelemetry,
  seedWorld,
  taoPhienSac,
  taoThanhToan,
  type TestWorld,
} from '../../test/world';
import { chayDoiSoat, RECONCILE_DEFAULTS, type ReconcileOptions } from './reconcile';

let db: pg.Client;
let w: TestWorld;

// Pin xe A1 = 105 kWh (xem test/world.ts). ΔSOC 20% ⇒ 21 kWh.
const DUNG_LUONG_KWH = 105;
const SOC_DAU = 30;
const SOC_CUOI = 50;
const KWH_THAT = ((SOC_CUOI - SOC_DAU) / 100) * DUNG_LUONG_KWH; // 21.000
const GIA = RECONCILE_DEFAULTS.giaVndMoiKwh; // 3.500 VNĐ/kWh (GIẢ)

const BAT_DAU = Date.UTC(2026, 6, 1, 8, 0, 0);
const KET_THUC = Date.UTC(2026, 6, 1, 8, 30, 0);

const OPTS: ReconcileOptions = {
  nguongPct: RECONCILE_DEFAULTS.nguongPct,
  hieuSuatSac: RECONCILE_DEFAULTS.hieuSuatSac,
  giaVndMoiKwh: GIA,
  cuaSoSocGiay: RECONCILE_DEFAULTS.cuaSoSocGiay,
};

/**
 * Telemetry "thật" của một phiên: SOC tăng tuyến tính sao cho tại ĐÚNG mốc bắt đầu là
 * socDau và tại ĐÚNG mốc kết thúc là socCuoi. Đệm thêm 30s mỗi đầu (ngoại suy tuyến tính)
 * để có điểm kẹp hai phía cho phép nội suy.
 */
async function bomTelemetryChuan(
  opts: {
    vehicleId?: string;
    batDauMs?: number;
    ketThucMs?: number;
    socDau?: number;
    socCuoi?: number;
  } = {},
): Promise<void> {
  const batDau = opts.batDauMs ?? BAT_DAU;
  const ketThuc = opts.ketThucMs ?? KET_THUC;
  const socDau = opts.socDau ?? SOC_DAU;
  const socCuoi = opts.socCuoi ?? SOC_CUOI;
  const demGiay = (ketThuc - batDau) / 1000;
  const buGiay = 30;
  const doDoc = (socCuoi - socDau) / demGiay; // %SOC mỗi giây

  await insertTelemetry(db, opts.vehicleId ?? w.vehicleA1, {
    startMs: batDau - buGiay * 1000,
    endMs: ketThuc + buGiay * 1000,
    steps: Math.round((demGiay + 2 * buGiay) / 30), // ~30s/bản ghi
    socStart: socDau - doDoc * buGiay,
    socEnd: socCuoi + doDoc * buGiay,
  });
}

beforeAll(async () => {
  db = new pg.Client({ connectionString: testDatabaseUrl() });
  await db.connect();
  w = await seedWorld(db);
});
afterAll(async () => {
  await db.end();
});
beforeEach(async () => {
  await db.query('DELETE FROM reconciliation_results');
  await db.query('DELETE FROM payment_transactions');
  await db.query('ALTER TABLE charging_sessions DISABLE TRIGGER charging_sessions_append_only');
  await db.query('DELETE FROM charging_sessions');
  await db.query('ALTER TABLE charging_sessions ENABLE TRIGGER charging_sessions_append_only');
  await db.query('DELETE FROM telematics_readings');
  await db.query('DELETE FROM alerts');
});

const demAlert = async (): Promise<number> => {
  const res = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM alerts WHERE type = 'reconciliation_mismatch'`,
  );
  return res.rows[0]!.n;
};

describe('F-C6 — 3 chiều khớp', () => {
  it('trụ = xe = tiền → status "khop", không sinh cảnh báo', async () => {
    const sessionId = await taoPhienSac(db, w, {
      startMs: BAT_DAU,
      endMs: KET_THUC,
      energyKwh: KWH_THAT,
    });
    await bomTelemetryChuan();
    await taoThanhToan(db, sessionId, KWH_THAT * GIA);

    const tomTat = await chayDoiSoat(db, OPTS);

    expect(tomTat.da_xet).toBe(1);
    expect(tomTat.khop).toBe(1);
    expect(tomTat.ket_qua[0]!.lech_max_pct).toBeLessThanOrEqual(1);
    expect(await demAlert()).toBe(0);
  });

  it('lệch nhỏ 0.5% vẫn nằm dưới ngưỡng NF-10 → khớp', async () => {
    const sessionId = await taoPhienSac(db, w, {
      startMs: BAT_DAU,
      endMs: KET_THUC,
      energyKwh: KWH_THAT * 1.005,
    });
    await bomTelemetryChuan();
    await taoThanhToan(db, sessionId, KWH_THAT * 1.005 * GIA);

    const tomTat = await chayDoiSoat(db, OPTS);

    expect(tomTat.khop).toBe(1);
    expect(await demAlert()).toBe(0);
  });
});

describe('F-C6 — phát hiện sai lệch (test bắt buộc Prompt 06)', () => {
  it('phiên bị BƠM SỐ SAI kWh +5% ở chiều trụ → "lech" + sinh cảnh báo', async () => {
    const kwhSai = KWH_THAT * 1.05; // 22.05 thay vì 21.00
    const sessionId = await taoPhienSac(db, w, {
      startMs: BAT_DAU,
      endMs: KET_THUC,
      energyKwh: kwhSai,
    });
    await bomTelemetryChuan(); // xe vẫn báo đúng 21 kWh
    await taoThanhToan(db, sessionId, kwhSai * GIA); // tiền thu theo số của trụ

    const tomTat = await chayDoiSoat(db, OPTS);

    expect(tomTat.lech).toBe(1);
    const kq = tomTat.ket_qua[0]!;
    expect(kq.status).toBe('lech');
    expect(kq.kwh_tru).toBeCloseTo(kwhSai, 2);
    expect(kq.kwh_xe).toBeCloseTo(KWH_THAT, 1);
    // Chiều TIỀN khớp trụ (cùng bị sai), chiều XE mới là chiều tố giác
    expect(kq.lech_tien_pct).toBeLessThanOrEqual(0.01);
    expect(kq.lech_xe_pct).toBeGreaterThan(4);
    expect(kq.lech_max_pct).toBeGreaterThan(1);

    expect(await demAlert()).toBe(1);
    const alert = await db.query<{ payload: { lech_max_pct: number }; severity: number }>(
      `SELECT payload, severity FROM alerts WHERE type = 'reconciliation_mismatch'`,
    );
    expect(alert.rows[0]!.payload.lech_max_pct).toBeGreaterThan(4);
  });

  it('thu tiền thiếu 5% so với kWh đã bán → "lech" (chiều tiền tố giác)', async () => {
    const sessionId = await taoPhienSac(db, w, {
      startMs: BAT_DAU,
      endMs: KET_THUC,
      energyKwh: KWH_THAT,
    });
    await bomTelemetryChuan();
    await taoThanhToan(db, sessionId, KWH_THAT * 0.95 * GIA);

    const tomTat = await chayDoiSoat(db, OPTS);

    expect(tomTat.lech).toBe(1);
    expect(tomTat.ket_qua[0]!.lech_tien_pct).toBeGreaterThan(4);
    expect(tomTat.ket_qua[0]!.lech_xe_pct).toBeLessThanOrEqual(1);
  });

  it('kết quả ghi vào reconciliation_results và đọc lại được', async () => {
    const sessionId = await taoPhienSac(db, w, {
      startMs: BAT_DAU,
      endMs: KET_THUC,
      energyKwh: KWH_THAT * 1.05,
    });
    await bomTelemetryChuan();
    await taoThanhToan(db, sessionId, KWH_THAT * 1.05 * GIA);
    await chayDoiSoat(db, OPTS);

    const res = await db.query<{ status: string; alert_id: string | null; nguong_pct: string }>(
      `SELECT status, alert_id, nguong_pct FROM reconciliation_results WHERE session_id = $1`,
      [sessionId],
    );
    expect(res.rows[0]!.status).toBe('lech');
    expect(res.rows[0]!.alert_id).not.toBeNull();
    expect(Number(res.rows[0]!.nguong_pct)).toBe(1);
  });
});

describe('F-C6 — kịch bản xấu', () => {
  it('xe mất sóng quanh mốc phiên → "thieu_du_lieu", KHÔNG báo lệch giả', async () => {
    const sessionId = await taoPhienSac(db, w, {
      startMs: BAT_DAU,
      endMs: KET_THUC,
      energyKwh: KWH_THAT,
    });
    // Chỉ có telemetry TRƯỚC phiên rất lâu — không có gì quanh mốc bắt đầu/kết thúc
    await insertTelemetry(db, w.vehicleA1, {
      startMs: BAT_DAU - 7_200_000,
      endMs: BAT_DAU - 3_600_000,
      steps: 10,
      socStart: 60,
      socEnd: 30,
    });
    await taoThanhToan(db, sessionId, KWH_THAT * GIA);

    const tomTat = await chayDoiSoat(db, OPTS);

    expect(tomTat.thieu_du_lieu).toBe(1);
    expect(tomTat.lech).toBe(0);
    expect(await demAlert()).toBe(0);
    expect(tomTat.ket_qua[0]!.ghi_chu).toContain('mất sóng');
  });

  it('dữ liệu bù về sau (NF-09) → lượt đối soát sau tự xét lại và kết luận khớp', async () => {
    const sessionId = await taoPhienSac(db, w, {
      startMs: BAT_DAU,
      endMs: KET_THUC,
      energyKwh: KWH_THAT,
    });
    await taoThanhToan(db, sessionId, KWH_THAT * GIA);

    expect((await chayDoiSoat(db, OPTS)).thieu_du_lieu).toBe(1);

    // Thiết bị hết mất sóng, đẩy dữ liệu đệm lên (store-and-forward NF-09)
    await bomTelemetryChuan();
    const lai = await chayDoiSoat(db, OPTS);

    expect(lai.da_xet).toBe(1); // phiên 'thieu_du_lieu' được xét lại, không bị bỏ quên
    expect(lai.khop).toBe(1);
  });

  it('phiên chưa có giao dịch thanh toán → "thieu_du_lieu", không kết luận vội', async () => {
    await taoPhienSac(db, w, { startMs: BAT_DAU, endMs: KET_THUC, energyKwh: KWH_THAT });
    await bomTelemetryChuan();

    const tomTat = await chayDoiSoat(db, OPTS);

    expect(tomTat.thieu_du_lieu).toBe(1);
    expect(tomTat.ket_qua[0]!.ghi_chu).toContain('thanh toán');
    expect(await demAlert()).toBe(0);
  });

  it('giao dịch mới ở trạng thái pending không được tính là đã thu tiền', async () => {
    const sessionId = await taoPhienSac(db, w, {
      startMs: BAT_DAU,
      endMs: KET_THUC,
      energyKwh: KWH_THAT,
    });
    await bomTelemetryChuan();
    await taoThanhToan(db, sessionId, KWH_THAT * GIA, 'pending');

    expect((await chayDoiSoat(db, OPTS)).thieu_du_lieu).toBe(1);
  });

  it('chạy job 3 lần trên cùng phiên lệch → 1 dòng kết quả, 1 cảnh báo', async () => {
    const sessionId = await taoPhienSac(db, w, {
      startMs: BAT_DAU,
      endMs: KET_THUC,
      energyKwh: KWH_THAT * 1.05,
    });
    await bomTelemetryChuan();
    await taoThanhToan(db, sessionId, KWH_THAT * 1.05 * GIA);

    await chayDoiSoat(db, OPTS);
    await chayDoiSoat(db, { ...OPTS, lamLaiTatCa: true });
    await chayDoiSoat(db, { ...OPTS, lamLaiTatCa: true });

    const rows = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM reconciliation_results`,
    );
    expect(rows.rows[0]!.n).toBe(1);
    expect(await demAlert()).toBe(1);
  });

  it('phiên đã kết luận không bị xét lại ở lượt chạy thường', async () => {
    const sessionId = await taoPhienSac(db, w, {
      startMs: BAT_DAU,
      endMs: KET_THUC,
      energyKwh: KWH_THAT,
    });
    await bomTelemetryChuan();
    await taoThanhToan(db, sessionId, KWH_THAT * GIA);

    expect((await chayDoiSoat(db, OPTS)).da_xet).toBe(1);
    expect((await chayDoiSoat(db, OPTS)).da_xet).toBe(0);
  });

  it('xe chưa khai báo pin → "thieu_du_lieu" chứ không chia cho 0', async () => {
    const sessionId = await taoPhienSac(db, w, {
      vehicleId: w.vehicleA2, // xe A2 không có bản ghi batteries
      startMs: BAT_DAU,
      endMs: KET_THUC,
      energyKwh: KWH_THAT,
    });
    await bomTelemetryChuan({ vehicleId: w.vehicleA2 });
    await taoThanhToan(db, sessionId, KWH_THAT * GIA);

    const tomTat = await chayDoiSoat(db, OPTS);

    expect(tomTat.thieu_du_lieu).toBe(1);
    expect(tomTat.ket_qua[0]!.ghi_chu).toContain('dung lượng pin');
  });

  it('SOC GIẢM trong lúc trụ báo đang sạc → phải kết luận lệch, KHÔNG được làm hỏng job', async () => {
    // Tình huống thật: trụ tính tiền năng lượng mà pin không hề nhận (hoặc lệch giờ thiết bị).
    // Đây đúng là loại bất thường NF-10 sinh ra để bắt — job tuyệt đối không được ném lỗi.
    const sessionId = await taoPhienSac(db, w, {
      startMs: BAT_DAU,
      endMs: KET_THUC,
      energyKwh: KWH_THAT,
    });
    await insertTelemetry(db, w.vehicleA1, {
      startMs: BAT_DAU - 30_000,
      endMs: KET_THUC + 30_000,
      steps: 62,
      socStart: 50,
      socEnd: 45, // xe XẢ trong lúc trụ báo đang sạc
    });
    await taoThanhToan(db, sessionId, KWH_THAT * GIA);

    const tomTat = await chayDoiSoat(db, OPTS);

    expect(tomTat.lech).toBe(1);
    expect(tomTat.ket_qua[0]!.kwh_xe).toBeLessThan(0);
    expect(await demAlert()).toBe(1);
  });

  it('phiên kWh tí hon làm tỉ lệ lệch cực lớn → vẫn ghi được kết quả, không tràn cột', async () => {
    // Phiên 0,001 kWh (trụ lỗi công tơ) mà xe báo nhận 21 kWh ⇒ lệch ~2.100.000%.
    const sessionId = await taoPhienSac(db, w, {
      startMs: BAT_DAU,
      endMs: KET_THUC,
      energyKwh: 0.001,
    });
    await bomTelemetryChuan();
    await taoThanhToan(db, sessionId, 0.001 * GIA);

    const tomTat = await chayDoiSoat(db, OPTS);

    expect(tomTat.lech).toBe(1);
    expect(tomTat.ket_qua[0]!.lech_max_pct).toBeGreaterThan(9999);
    const luu = await db.query<{ lech_max_pct: string }>(
      `SELECT lech_max_pct FROM reconciliation_results WHERE session_id = $1`,
      [sessionId],
    );
    expect(luu.rows).toHaveLength(1);
  });

  it('thu thiếu rồi thu bù đủ → lượt sau kết luận khớp và ĐÓNG cảnh báo lệch cũ', async () => {
    const sessionId = await taoPhienSac(db, w, {
      startMs: BAT_DAU,
      endMs: KET_THUC,
      energyKwh: KWH_THAT,
    });
    await bomTelemetryChuan();
    await taoThanhToan(db, sessionId, KWH_THAT * 0.95 * GIA); // thu thiếu 5%

    expect((await chayDoiSoat(db, OPTS)).lech).toBe(1);
    const alertMo = await db.query<{ status: string }>(
      `SELECT status FROM alerts WHERE type = 'reconciliation_mismatch'`,
    );
    expect(alertMo.rows[0]!.status).toBe('open');

    // Tài xế trả nốt phần còn thiếu
    await taoThanhToan(db, sessionId, KWH_THAT * 0.05 * GIA);
    const lai = await chayDoiSoat(db, { ...OPTS, lamLaiTatCa: true });

    expect(lai.khop).toBe(1);
    const alertSau = await db.query<{ status: string; resolved_at: Date | null }>(
      `SELECT status, resolved_at FROM alerts WHERE type = 'reconciliation_mismatch'`,
    );
    expect(alertSau.rows).toHaveLength(1); // không sinh cảnh báo mới
    expect(alertSau.rows[0]!.status).toBe('resolved');
    expect(alertSau.rows[0]!.resolved_at).not.toBeNull();
  });

  it('một phiên hỏng KHÔNG chặn các phiên còn lại của lượt chạy', async () => {
    // Phiên 1 hỏng có chủ ý: xoá bản ghi pin giữa chừng thì truy vấn vẫn chạy, nên ở đây
    // ép lỗi bằng cách cho đơn giá điện = 0 chỉ riêng phiên đầu là không được — thay vào đó
    // dùng một Queryable bọc ngoài, ném lỗi đúng 1 lần ở câu ghi kết quả của phiên đầu.
    const s1 = await taoPhienSac(db, w, {
      startMs: BAT_DAU,
      endMs: KET_THUC,
      energyKwh: KWH_THAT,
      ocppTxId: 'TEST-LOI-1',
    });
    // Phiên 2 cách phiên 1 đủ xa để hai dải telemetry không chồng mốc thời gian
    const BAT_DAU_2 = KET_THUC + 300_000;
    const KET_THUC_2 = BAT_DAU_2 + (KET_THUC - BAT_DAU);
    const s2 = await taoPhienSac(db, w, {
      startMs: BAT_DAU_2,
      endMs: KET_THUC_2,
      energyKwh: KWH_THAT,
      ocppTxId: 'TEST-LOI-2',
    });
    await bomTelemetryChuan();
    await bomTelemetryChuan({
      batDauMs: BAT_DAU_2,
      ketThucMs: KET_THUC_2,
      socDau: SOC_CUOI,
      socCuoi: SOC_CUOI + (SOC_CUOI - SOC_DAU),
    });
    await taoThanhToan(db, s1, KWH_THAT * GIA);
    await taoThanhToan(db, s2, KWH_THAT * GIA);

    let daNem = false;
    const dbHong = {
      query: (text: string, values?: unknown[]) => {
        if (!daNem && text.includes('INSERT INTO reconciliation_results')) {
          daNem = true;
          return Promise.reject(new Error('lỗi ghi giả lập'));
        }
        return db.query(text, values as never[]);
      },
    };

    const tomTat = await chayDoiSoat(dbHong, OPTS);

    expect(tomTat.da_xet).toBe(2);
    expect(tomTat.loi).toBe(1);
    expect(tomTat.khop).toBe(1); // phiên thứ hai VẪN được đối soát
    const luu = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM reconciliation_results`,
    );
    expect(luu.rows[0]!.n).toBe(1);
  });

  it('hiệu suất sạc < 1 làm kWh phía xe tăng lên — ADR-007 phải được hiệu chuẩn', async () => {
    const sessionId = await taoPhienSac(db, w, {
      startMs: BAT_DAU,
      endMs: KET_THUC,
      energyKwh: KWH_THAT,
    });
    await bomTelemetryChuan();
    await taoThanhToan(db, sessionId, KWH_THAT * GIA);

    // Đúng vấn đề đã nêu trong ADR-007: để hiệu suất 0.92 mà dữ liệu là của hệ lý tưởng
    // thì đối soát báo lệch ~8.7% — báo động giả hàng loạt nếu quên hiệu chuẩn.
    const tomTat = await chayDoiSoat(db, { ...OPTS, hieuSuatSac: 0.92 });

    expect(tomTat.lech).toBe(1);
    expect(tomTat.ket_qua[0]!.lech_xe_pct).toBeGreaterThan(8);
  });
});
