// F-B2 · F-B3 · F-B5 — Pipeline: phiên sạc đóng → đối chiếu chính sách đúng version →
// gắn cờ vi phạm kèm bằng chứng → cảnh báo tài xế/chủ xe.
//
// Câu hỏi trung tâm: một người thứ ba (thẩm định viên bảo hành, luật sư) chỉ cầm cột
// `evidence` có dựng lại được kết luận không? Nếu không thì cả tính năng này vô giá trị
// đúng lúc cần nhất — lúc tranh chấp hợp đồng.
import { MockNotifier } from '@g3/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../../test/app-harness';
import { insertTelemetry, seedWorld, taoPhienSac, type TestWorld } from '../../test/world';
import { kiemTraViPham, phutNgoaiKhungGio, VI_PHAM_DEFAULTS } from './detect';

let h: Harness;
let w: TestWorld;
let notifier: MockNotifier;

const OPTS = {
  muiGio: VI_PHAM_DEFAULTS.muiGio,
  socBreachCount: VI_PHAM_DEFAULTS.socBreachCount,
  socBreachWindowDays: VI_PHAM_DEFAULTS.socBreachWindowDays,
};

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  w = await seedWorld(h.db);
  notifier = new MockNotifier();
});

/** Chính sách đội A: chỉ sạc 22:00–06:00 (giờ VN), SOC 20–90%, tối đa 120 kW. */
async function chinhSachDoiA(extra: Record<string, unknown> = {}): Promise<string> {
  const cot = Object.keys(extra);
  const res = await h.db.query<{ id: string }>(
    `INSERT INTO charging_policies
       (code, version, name, scope_type, customer_id, soc_min_pct, soc_max_pct,
        allowed_hours, max_power_kw, effective_from${cot.length ? ', ' + cot.join(', ') : ''})
     VALUES ('BH-A', 1, 'Bảo hành đội A (GIẢ)', 'fleet', $1, 20, 90,
             $2::jsonb, 120, '2026-01-01T00:00:00Z'
             ${cot.map((_, i) => `, $${i + 3}`).join('')})
     RETURNING id`,
    [w.customerAId, JSON.stringify([{ from: '22:00', to: '06:00' }]), ...Object.values(extra)],
  );
  return res.rows[0]!.id;
}

const chay = (): ReturnType<typeof kiemTraViPham> => kiemTraViPham(h.db, { ...OPTS, notifier });

describe('F-B3 — ba loại vi phạm', () => {
  it('LOẠI 1 — sạc NGOÀI KHUNG GIỜ: 14:00–15:00 giờ VN, chính sách chỉ cho 22:00–06:00', async () => {
    await chinhSachDoiA();
    // 07:00Z = 14:00 VN → nằm trọn ngoài khung
    await taoPhienSac(h.db, w, {
      startMs: Date.parse('2026-06-12T07:00:00Z'),
      endMs: Date.parse('2026-06-12T08:00:00Z'),
      energyKwh: 60,
    });

    const tomTat = await chay();

    expect(tomTat.da_xet).toBe(1);
    expect(tomTat.co_vi_pham).toBe(1);
    const vp = await viPhamCua('outside_hours');
    expect(vp).toHaveLength(1);
    expect(vp[0]!.risk_level).toBe('low');
    // 60 phút đều nằm ngoài khung — con số cụ thể, không phải cờ true/false
    expect(vp[0]!.evidence.ket_luan.so_lieu.so_phut_ngoai_khung).toBe(60);
  });

  it('LOẠI 2 — VƯỢT CÔNG SUẤT: trụ đẩy 150 kW, chính sách cho tối đa 120 kW', async () => {
    await chinhSachDoiA();
    const sid = await taoPhienSac(h.db, w, {
      // 19:00Z = 02:00 VN → TRONG khung giờ, để chắc chắn chỉ có đúng 1 loại vi phạm
      startMs: Date.parse('2026-06-12T19:00:00Z'),
      endMs: Date.parse('2026-06-12T20:00:00Z'),
      energyKwh: 140,
    });
    await datCongSuat(sid, 150);

    await chay();

    const vp = await viPhamCua('overpower');
    expect(vp).toHaveLength(1);
    expect(vp[0]!.risk_level).toBe('medium');
    expect(vp[0]!.evidence.ket_luan.so_lieu.cong_suat_kw).toBe(150);
    expect(vp[0]!.evidence.ket_luan.so_lieu.cong_suat_nguong_kw).toBe(120);
    // Không được gắn kèm vi phạm khung giờ — phiên này sạc đúng giờ
    expect(await viPhamCua('outside_hours')).toHaveLength(0);
  });

  it('LOẠI 3 — SOC NGOÀI MIN–MAX "THƯỜNG XUYÊN": lần 1 và 2 chưa vi phạm, lần 3 mới vi phạm', async () => {
    // Đây là ca dễ làm sai nhất: sheet 4 viết "THƯỜNG XUYÊN >90% hoặc <20%".
    // Gắn cờ ngay lần đầu là kết tội oan một hành vi mà chính sách còn cho phép.
    await chinhSachDoiA();
    const moc = Date.parse('2026-06-01T19:00:00Z');
    const ngay = 24 * 3600_000;

    for (let i = 0; i < 3; i++) {
      await taoPhienSac(h.db, w, {
        startMs: moc + i * ngay,
        endMs: moc + i * ngay + 3600_000,
        energyKwh: 50,
        socStartPct: 40,
        socEndPct: 95, // vượt SOC max 90
      });
      await chay();

      const vp = await viPhamCua('soc_above_max');
      if (i < 2) {
        expect(vp, `lần ${i + 1} chưa được coi là "thường xuyên"`).toHaveLength(0);
      } else {
        expect(vp, 'lần 3 chạm ngưỡng mặc định → vi phạm').toHaveLength(1);
        expect(vp[0]!.risk_level).toBe('high');
        expect(vp[0]!.evidence.ket_luan.so_lieu.so_lan).toBe(3);
        expect(vp[0]!.evidence.ket_luan.so_lieu.so_lan_nguong).toBe(3);
      }
    }
  });

  it('xả sâu dưới SOC min cũng theo tiêu chí "thường xuyên"', async () => {
    await chinhSachDoiA();
    const moc = Date.parse('2026-06-01T19:00:00Z');
    for (let i = 0; i < 3; i++) {
      await taoPhienSac(h.db, w, {
        startMs: moc + i * 24 * 3600_000,
        endMs: moc + i * 24 * 3600_000 + 3600_000,
        energyKwh: 50,
        socStartPct: 12, // vào trạm khi pin đã dưới 20%
        socEndPct: 80,
      });
    }
    await chay();

    const vp = await viPhamCua('soc_below_min');
    expect(vp).toHaveLength(1);
    expect(vp[0]!.evidence.ket_luan.so_lieu.soc_nguong_pct).toBe(20);
  });

  it('ngưỡng "thường xuyên" lấy theo HỢP ĐỒNG khi chính sách tự khai', async () => {
    await chinhSachDoiA({ soc_breach_count: 2, soc_breach_window_days: 7 });
    const moc = Date.parse('2026-06-01T19:00:00Z');
    for (let i = 0; i < 2; i++) {
      await taoPhienSac(h.db, w, {
        startMs: moc + i * 24 * 3600_000,
        endMs: moc + i * 24 * 3600_000 + 3600_000,
        energyKwh: 50,
        socStartPct: 40,
        socEndPct: 95,
      });
    }
    await chay();

    const vp = await viPhamCua('soc_above_max');
    expect(vp, 'chính sách khai 2 lần → lần 2 đã vi phạm').toHaveLength(1);
    expect(vp[0]!.evidence.ket_luan.so_lieu.so_lan_nguong).toBe(2);
  });
});

describe('F-B3 — bằng chứng đủ để người thứ ba tái dựng kết luận (NF-11)', () => {
  it('evidence chứa số của phiên, ngưỡng của ĐÚNG version chính sách, telemetry và cách tính', async () => {
    const policyId = await chinhSachDoiA();
    const start = Date.parse('2026-06-12T07:00:00Z');
    const end = Date.parse('2026-06-12T08:00:00Z');
    const sid = await taoPhienSac(h.db, w, {
      startMs: start,
      endMs: end,
      energyKwh: 61.5,
      socStartPct: 30,
      socEndPct: 88,
      ocppTxId: 'TX-BANG-CHUNG-1',
    });
    await insertTelemetry(h.db, w.vehicleA1, {
      startMs: start,
      endMs: end,
      steps: 6,
      socStart: 30,
      socEnd: 88,
    });

    await chay();
    const vp = (await viPhamCua('outside_hours'))[0]!;
    const e = vp.evidence;

    // 1. Kết luận: loại, mô tả hành vi, khuyến nghị, mức nguy cơ, số liệu
    expect(e.ket_luan.loai).toBe('outside_hours');
    expect(e.ket_luan.mo_ta).toContain('ngoài khung giờ');
    expect(e.ket_luan.khuyen_nghi).toContain('22:00–06:00');

    // 2. Phiên sạc: định danh đối chiếu được với hệ thống trụ
    expect(e.phien_sac.id).toBe(sid);
    expect(e.phien_sac.vin).toBe('G3-TEST-A1');
    expect(e.phien_sac.ocpp_transaction_id).toBe('TX-BANG-CHUNG-1');
    expect(e.phien_sac.energy_kwh).toBe(61.5);
    expect(e.phien_sac.soc_start_pct).toBe(30);
    expect(e.phien_sac.soc_end_pct).toBe(88);
    expect(e.phien_sac.started_at).toBe(new Date(start).toISOString());

    // 3. Chính sách: BẢN SAO ngưỡng, không chỉ khoá ngoại — đây là chỗ chứng minh
    //    "lúc kết luận, ngưỡng đọc ra đúng là con số này"
    expect(e.chinh_sach.id).toBe(policyId);
    expect(e.chinh_sach.code).toBe('BH-A');
    expect(e.chinh_sach.version).toBe(1);
    expect(e.chinh_sach.allowed_hours).toEqual([{ from: '22:00', to: '06:00' }]);
    expect(e.chinh_sach.soc_min_pct).toBe(20);
    expect(e.chinh_sach.soc_max_pct).toBe(90);

    // 4. Telemetry trong phiên — dựng lại được đường SOC
    expect(Array.isArray(e.telemetry_lien_quan)).toBe(true);
    expect((e.telemetry_lien_quan as unknown[]).length).toBeGreaterThan(0);

    // 5. Cách tính: múi giờ và nguồn số liệu — thiếu cái này thì con số "60 phút ngoài
    //    khung" không kiểm chứng lại được
    expect(e.cach_tinh.mui_gio_khung_gio).toBe('Asia/Ho_Chi_Minh');
    expect(e.cach_tinh.ghi_chu).toContain('version hiệu lực');
    expect(typeof e.ghi_nhan_luc).toBe('string');
  });

  it('vi phạm ghi theo version chính sách LÚC SẠC, không phải version mới nhất', async () => {
    // Nối thẳng với F-B1: đổi chính sách sau khi phiên đã diễn ra thì kết luận không được đổi.
    const v1 = await chinhSachDoiA();
    await h.db.query(
      `INSERT INTO charging_policies
         (code, version, name, scope_type, customer_id, soc_min_pct, soc_max_pct,
          allowed_hours, max_power_kw, effective_from, supersedes_id)
       VALUES ('BH-A', 2, 'Bảo hành đội A — nới giờ', 'fleet', $1, 20, 90,
               NULL, 120, '2026-07-01T00:00:00Z', $2)`,
      [w.customerAId, v1],
    );

    // Phiên diễn ra THÁNG 6 — lúc đó v1 còn hiệu lực và v1 cấm sạc ban ngày
    await taoPhienSac(h.db, w, {
      startMs: Date.parse('2026-06-12T07:00:00Z'),
      endMs: Date.parse('2026-06-12T08:00:00Z'),
      energyKwh: 60,
    });

    await chay();

    const vp = await viPhamCua('outside_hours');
    expect(vp, 'v2 bỏ khung giờ nhưng phiên tháng 6 vẫn theo v1').toHaveLength(1);
    expect(vp[0]!.evidence.chinh_sach.version).toBe(1);
  });
});

describe('F-B5 — cảnh báo nêu rõ hành vi & cách khắc phục', () => {
  it('sinh alert charging_violation + sự kiện thông báo có cả hành vi lẫn cách sửa', async () => {
    await chinhSachDoiA();
    await taoPhienSac(h.db, w, {
      startMs: Date.parse('2026-06-12T07:00:00Z'),
      endMs: Date.parse('2026-06-12T08:00:00Z'),
      energyKwh: 60,
    });

    await chay();

    const alerts = await h.db.query(
      `SELECT type::text AS type, severity, payload FROM alerts WHERE type = 'charging_violation'`,
    );
    expect(alerts.rows).toHaveLength(1);
    // KHÔNG bao giờ severity 3: mức đó xuyên rate-limit và bắn SMS, dành cho nguy hiểm
    // tính mạng (pin cháy, SOS) — xem ADR-008.
    expect(alerts.rows[0]!.severity).toBe(1);

    const sk = notifier.theoLoai('charging_violation');
    expect(sk).toHaveLength(1);
    expect(sk[0]!.title).toContain('G3-TEST-A1');
    expect(sk[0]!.body).toContain('ngoài khung giờ'); // HÀNH VI
    expect(sk[0]!.body).toContain('Lần sau'); // CÁCH KHẮC PHỤC
    expect(sk[0]!.data?.khac_phuc).toBeTruthy();
    expect(sk[0]!.vehicle_id).toBe(w.vehicleA1);
  });

  it('khung thông báo hỏng KHÔNG được làm mất bản ghi vi phạm', async () => {
    await chinhSachDoiA();
    await taoPhienSac(h.db, w, {
      startMs: Date.parse('2026-06-12T07:00:00Z'),
      endMs: Date.parse('2026-06-12T08:00:00Z'),
      energyKwh: 60,
    });
    notifier.loi = true;

    // notify() ném lỗi; hồ sơ bảo hành vẫn phải được ghi vì đó mới là thứ không làm lại được
    await expect(chay()).resolves.toBeDefined();

    expect(await viPhamCua('outside_hours')).toHaveLength(1);
  });
});

describe('F-B3 — kịch bản xấu', () => {
  it('UPDATE bản ghi vi phạm bị trigger chặn (NF-11)', async () => {
    await chinhSachDoiA();
    await taoPhienSac(h.db, w, {
      startMs: Date.parse('2026-06-12T07:00:00Z'),
      endMs: Date.parse('2026-06-12T08:00:00Z'),
      energyKwh: 60,
    });
    await chay();
    const vp = (await viPhamCua('outside_hours'))[0]!;

    await expect(
      h.db.query(`UPDATE violations SET risk_level = 'low', evidence = '{}'::jsonb WHERE id = $1`, [
        vp.id,
      ]),
    ).rejects.toThrow(/APPEND-ONLY/);
    await expect(h.db.query(`DELETE FROM violations WHERE id = $1`, [vp.id])).rejects.toThrow(
      /APPEND-ONLY/,
    );

    const con = await h.db.query(`SELECT evidence FROM violations WHERE id = $1`, [vp.id]);
    expect((con.rows[0]!.evidence as Record<string, unknown>).phien_sac).toBeTruthy();
  });

  it('chạy job 3 lần trên cùng phiên → vẫn đúng 1 dòng vi phạm và 1 cảnh báo', async () => {
    await chinhSachDoiA();
    await taoPhienSac(h.db, w, {
      startMs: Date.parse('2026-06-12T07:00:00Z'),
      endMs: Date.parse('2026-06-12T08:00:00Z'),
      energyKwh: 60,
    });

    await chay();
    await kiemTraViPham(h.db, { ...OPTS, notifier, lamLaiTatCa: true });
    await kiemTraViPham(h.db, { ...OPTS, notifier, lamLaiTatCa: true });

    expect(await viPhamCua('outside_hours')).toHaveLength(1);
    const alerts = await h.db.query(`SELECT id FROM alerts WHERE type = 'charging_violation'`);
    expect(alerts.rows).toHaveLength(1);
    expect(notifier.theoLoai('charging_violation')).toHaveLength(1);
  });

  it('phiên KHÔNG có chính sách áp dụng: không vi phạm, nhưng vẫn ghi là ĐÃ XÉT', async () => {
    // "Không có dòng vi phạm" và "chưa từng được kiểm tra" là hai chuyện khác nhau khi
    // tranh chấp — im lặng không được phép hiểu thành đã kiểm tra.
    await taoPhienSac(h.db, w, {
      startMs: Date.parse('2026-06-12T07:00:00Z'),
      endMs: Date.parse('2026-06-12T08:00:00Z'),
      energyKwh: 60,
    });

    const tomTat = await chay();

    expect(tomTat.khong_co_chinh_sach).toBe(1);
    expect(tomTat.co_vi_pham).toBe(0);
    const check = await h.db.query(`SELECT policy_id, ghi_chu FROM violation_checks`);
    expect(check.rows).toHaveLength(1);
    expect(check.rows[0]!.policy_id).toBeNull();
    expect(check.rows[0]!.ghi_chu).toContain('Không có chính sách');
  });

  it('phiên SẠCH cũng để lại hồ sơ đã xét kèm version chính sách đã dùng', async () => {
    const policyId = await chinhSachDoiA();
    await taoPhienSac(h.db, w, {
      startMs: Date.parse('2026-06-12T19:00:00Z'), // 02:00 VN — đúng khung
      endMs: Date.parse('2026-06-12T20:00:00Z'),
      energyKwh: 60,
      socStartPct: 35,
      socEndPct: 85,
    });

    const tomTat = await chay();

    expect(tomTat.sach).toBe(1);
    const check = await h.db.query(`SELECT policy_id, so_vi_pham FROM violation_checks`);
    expect(check.rows[0]!.policy_id).toBe(policyId);
    expect(check.rows[0]!.so_vi_pham).toBe(0);
  });

  it('phiên chưa đóng (đang sạc) KHÔNG bị đem ra kết luận', async () => {
    await chinhSachDoiA();
    await h.db.query(
      `INSERT INTO charging_sessions
         (vehicle_id, station_id, connector_id, ocpp_transaction_id, started_at, ended_at)
       VALUES ($1, $2, $3, 'TX-DANG-SAC', '2026-06-12T07:00:00Z', NULL)`,
      [w.vehicleA1, w.stationId, w.connectorId],
    );

    const tomTat = await chay();

    expect(tomTat.da_xet).toBe(0);
  });

  it('vi phạm tần suất chỉ kết luận 1 LẦN trong cửa sổ, không bắn lại mỗi phiên', async () => {
    await chinhSachDoiA();
    const moc = Date.parse('2026-06-01T19:00:00Z');
    for (let i = 0; i < 5; i++) {
      await taoPhienSac(h.db, w, {
        startMs: moc + i * 24 * 3600_000,
        endMs: moc + i * 24 * 3600_000 + 3600_000,
        energyKwh: 50,
        socStartPct: 40,
        socEndPct: 95,
      });
    }

    await chay();

    // 5 phiên đều vượt SOC max, nhưng đây là MỘT giai đoạn hành vi, không phải 3 vi phạm
    expect(await viPhamCua('soc_above_max')).toHaveLength(1);
    expect(notifier.theoLoai('charging_violation')).toHaveLength(1);
  });
});

describe('F-B3 — đếm phút ngoài khung giờ (hàm thuần)', () => {
  const khung = [{ from: '22:00', to: '06:00' }];
  const tz = 'Asia/Ho_Chi_Minh';

  it('phiên nằm trọn trong khung → 0 phút ngoài', () => {
    // 19:00Z–20:00Z = 02:00–03:00 VN
    const n = phutNgoaiKhungGio(
      new Date('2026-06-12T19:00:00Z'),
      new Date('2026-06-12T20:00:00Z'),
      khung,
      tz,
    );
    expect(n).toBe(0);
  });

  it('phiên VẮT QUA biên khung: chỉ phần ngoài mới bị tính', () => {
    // 22:30Z–00:30Z = 05:30–07:30 VN; khung đóng lúc 06:00 → 30 phút trong, 90 phút ngoài
    const n = phutNgoaiKhungGio(
      new Date('2026-06-12T22:30:00Z'),
      new Date('2026-06-13T00:30:00Z'),
      khung,
      tz,
    );
    expect(n).toBe(90);
  });

  it('kịch bản xấu: dữ liệu rác (phiên 10 ngày) bị chặn bởi trần, không làm treo job', () => {
    const n = phutNgoaiKhungGio(
      new Date('2026-06-01T07:00:00Z'),
      new Date('2026-06-11T07:00:00Z'),
      khung,
      tz,
    );
    expect(n).toBeLessThanOrEqual(48 * 60);
  });
});

// --- tiện ích ---------------------------------------------------------------------------

interface ViPhamRow {
  id: string;
  risk_level: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  evidence: any;
}

async function viPhamCua(loai: string): Promise<ViPhamRow[]> {
  const res = await h.db.query(
    `SELECT id, risk_level::text AS risk_level, evidence FROM violations
     WHERE type = $1::violation_type ORDER BY detected_at`,
    [loai],
  );
  return res.rows as unknown as ViPhamRow[];
}

/** charging_sessions là append-only nên phải tắt trigger để dựng ca test công suất cao. */
async function datCongSuat(sessionId: string, kw: number): Promise<void> {
  await h.db.query(`ALTER TABLE charging_sessions DISABLE TRIGGER charging_sessions_append_only`);
  await h.db.query(`UPDATE charging_sessions SET max_power_kw = $2 WHERE id = $1`, [sessionId, kw]);
  await h.db.query(`ALTER TABLE charging_sessions ENABLE TRIGGER charging_sessions_append_only`);
}
