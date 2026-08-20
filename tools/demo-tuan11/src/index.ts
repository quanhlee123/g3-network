// NGHIỆM THU TUẦN 10–11 — "MỘT TUẦN CỦA QUẢN LÝ ĐỘI XE" (Hành trình 2, sheet 2).
//
// Diễn tập đúng ba bước mà PRD mô tả, cộng hai việc quản trị của Prompt 10:
//   ① SÁNG THỨ 2  — mở portal, MỘT màn hình tổng quan: bản đồ toàn đội, xe offline,
//                    cảnh báo qua đêm (F-E1). Không phải click sâu mới thấy vấn đề.
//   ② GIỮA TUẦN   — nhận cảnh báo vi phạm sạc, xem bằng chứng ngay từ portal (F-B3/F-B5).
//   ③ PHẠM VI     — quản lý đội KHÔNG thấy xe/tài khoản của đội khác (sheet 9).
//   ④ BÀN GIAO XE — kích hoạt xe mới theo VIN tới TICK XANH (F-F2), KPI ≥98%.
//   ⑤ QUẢN TRỊ    — mời & khoá tài khoản (F-F1), và nhật ký truy cập vị trí ghi lại
//                    đúng lượt quản lý đội vừa mở bản đồ (quy tắc 5, NF-06).
//
// Chạy: npm run demo:tuan11   (cần `npm install` + `docker compose up -d` trước)
//
// Gọi API THẬT qua app.inject — cùng đường mà portal đi, chỉ bỏ qua vòng HTTP.
// Dữ liệu GIẢ 100% (quy tắc 12).
import pg from 'pg';
import { databaseUrl, loadEnv, runMigrations, seed } from '@g3/db';
import { ConsoleSmsSender } from '@g3/contracts';
import { buildApp, kiemTraViPham, loadConfigFromEnvFile } from '@g3/api';
import type { FastifyInstance } from 'fastify';
import { bang, canhBao, khung, moTaLoi, ok, tieuDe } from '@g3/demo-gate0/src/ui';

const MA_OTP = '000000'; // mã cố định cho demo — không phải secret
/** Tiền tố mã giao dịch OCPP của các phiên sạc do CHÍNH demo này dựng, để dọn lại được. */
const MA_PHIEN_DEMO = 'DEMO-TUAN11-';
/**
 * Xe RIÊNG cho kịch bản vi phạm của demo này (đội Sao Mai, không dùng bởi gate0/tuan8).
 *
 * Vì sao không dùng chung xe 0001 với các demo khác: job F-B3 CỐ Ý không kết luận lại cùng
 * một loại vi phạm "thường xuyên" trong một cửa sổ (30 ngày) — đó là hành vi đúng, tránh
 * bắn cảnh báo trùng cho cùng một hành vi. Nhưng nó có nghĩa: xe nào đã bị kết luận
 * soc_above_max gần đây thì tạo thêm bao nhiêu phiên vượt trần cũng KHÔNG sinh cảnh báo
 * mới. Demo dùng xe riêng để không phải chống lại hành vi đúng đó.
 */
const XE_KICH_BAN_VI_PHAM = 'G3-SIM-VIN-0007';
const VIN_CHUA_KICH_HOAT = 'G3-SIM-VIN-0021';
const SDT_QUAN_LY = '0900000002'; // Trần Thị Mô Phỏng — đội Sao Mai
const SDT_ADMIN = '0900000010';

const tieuChi: { ma: string; ten: string; dat: boolean; soLieu: string }[] = [];
function ghiTieuChi(ma: string, ten: string, dat: boolean, soLieu: string): void {
  tieuChi.push({ ma, ten, dat, soLieu });
  (dat ? ok : canhBao)(`${ma} — ${ten}: ${soLieu}`);
}

async function dangNhap(app: FastifyInstance, phone: string): Promise<string> {
  await app.inject({ method: 'POST', url: '/auth/otp/request', payload: { phone } });
  const r = await app.inject({
    method: 'POST',
    url: '/auth/otp/verify',
    payload: { phone, code: MA_OTP },
  });
  if (r.statusCode !== 200) throw new Error(`đăng nhập ${phone} hỏng: ${r.body}`);
  return `Bearer ${r.json().access_token as string}`;
}

/**
 * Dọn dữ liệu của lần diễn tập TRƯỚC.
 *
 * provisioning_sessions trỏ tới vehicles/devices/drivers/users nên phải xoá TRƯỚC khi
 * gỡ thiết bị. Bài học Prompt 07: quên rà khoá ngoại thì lần chạy ĐẦU vẫn xanh, lần
 * THỨ HAI mới gãy — demo này bắt buộc chạy được hai lần liên tiếp.
 */
async function donDepDemoCu(db: pg.Client): Promise<void> {
  await db.query(
    `DELETE FROM provisioning_sessions
     WHERE vehicle_id IN (SELECT id FROM vehicles WHERE vin = $1)`,
    [VIN_CHUA_KICH_HOAT],
  );
  // Trả xe demo về đúng trạng thái "vừa giao, chưa gắn thiết bị".
  await db.query(
    `UPDATE devices SET vehicle_id = NULL
     WHERE vehicle_id IN (SELECT id FROM vehicles WHERE vin = $1)`,
    [VIN_CHUA_KICH_HOAT],
  );
  // auth_otp_challenges trỏ tới users: tài khoản demo đã ĐĂNG NHẬP ở lần chạy trước nên
  // có bản ghi OTP treo lại. Xoá thẳng users sẽ đâm khoá ngoại
  // auth_otp_challenges_user_id_fkey. Lần chạy ĐẦU không lộ ra vì chưa ai đăng nhập —
  // đúng cái bẫy của bài học Prompt 07, và demo này đã dính đúng nó ở lần chạy thứ hai.
  await db.query(
    `DELETE FROM auth_otp_challenges
     WHERE user_id IN (SELECT id FROM users WHERE email = 'taixe-demo-tuan11@test.local')`,
  );
  await db.query(`DELETE FROM users WHERE email = 'taixe-demo-tuan11@test.local'`);

  // Phiên sạc vi phạm do chính demo dựng (§ dungKichBanViPham). Thứ tự bắt buộc:
  // alerts → violations → violation_checks → charging_sessions, vì ba bảng sau tham chiếu
  // lẫn nhau. violations và charging_sessions là APPEND-ONLY (NF-11) nên phải tắt trigger
  // trong lúc dọn rồi bật lại NGAY — không có đường nào khác để reset bảng bất biến.
  const phienDemo = `SELECT id FROM charging_sessions WHERE ocpp_transaction_id LIKE '${MA_PHIEN_DEMO}%'`;
  // So sánh ở dạng TEXT: split_part() trả text còn charging_sessions.id là uuid. Ép
  // split_part sang uuid sẽ ném lỗi nếu gặp dedup_key sai định dạng — đổi chiều an toàn hơn.
  const phienDemoText = `SELECT id::text FROM charging_sessions WHERE ocpp_transaction_id LIKE '${MA_PHIEN_DEMO}%'`;
  await db.query(
    `DELETE FROM notifications WHERE alert_id IN
       (SELECT id FROM alerts WHERE dedup_key LIKE 'F-B5:%' AND vehicle_id IN
          (SELECT vehicle_id FROM charging_sessions WHERE ocpp_transaction_id LIKE $1))`,
    [`${MA_PHIEN_DEMO}%`],
  );
  await db.query(
    `DELETE FROM alerts WHERE dedup_key LIKE 'F-B5:%'
       AND split_part(dedup_key, ':', 2) IN (${phienDemoText})`,
  );
  await db.query(`ALTER TABLE violations DISABLE TRIGGER violations_append_only`);
  await db.query(`DELETE FROM violations WHERE session_id IN (${phienDemo})`);
  await db.query(`ALTER TABLE violations ENABLE TRIGGER violations_append_only`);
  await db.query(`DELETE FROM violation_checks WHERE session_id IN (${phienDemo})`);
  // reconciliation_results và payment_transactions cũng tham chiếu charging_sessions.
  // Lần chạy ĐẦU không đụng tới chúng (chưa job nào chạy qua phiên vừa dựng), nên thiếu hai
  // dòng này demo vẫn xanh — nó chỉ hỏng từ lần chạy THỨ HAI trở đi, sau khi job đối soát
  // của apps/api đã kịp quét phiên demo cũ. Cả hai bảng không có trigger append-only.
  await db.query(`DELETE FROM reconciliation_results WHERE session_id IN (${phienDemo})`);
  await db.query(`DELETE FROM payment_transactions WHERE session_id IN (${phienDemo})`);
  await db.query(`ALTER TABLE charging_sessions DISABLE TRIGGER charging_sessions_append_only`);
  await db.query(`DELETE FROM charging_sessions WHERE ocpp_transaction_id LIKE $1`, [
    `${MA_PHIEN_DEMO}%`,
  ]);
  await db.query(`ALTER TABLE charging_sessions ENABLE TRIGGER charging_sessions_append_only`);
}

/**
 * Dựng kịch bản "giữa tuần có vi phạm sạc" — TỰ TẠO, không dựa vào demo khác.
 *
 * Vì sao phải có hàm này: bản đầu của demo chỉ ĐỌC `/alerts` rồi khẳng định có cảnh báo
 * vi phạm. Nó xanh chỉ vì `demo:tuan8` đã chạy trước và để lại dữ liệu — chạy trên máy
 * sạch, hoặc sau khi tuan8 dọn dẹp, tiêu chí F-B5 HỎNG. Đó đúng là kiểu "test xanh vì lý
 * do sai" mà dự án đã vấp một lần (bài học Prompt 06).
 *
 * Chính sách áp cho đội Sao Mai không khai `allowed_hours`, nên `outside_hours` không kích
 * hoạt được. Dùng `soc_above_max`: sạc vượt SOC trần. Kết luận này cần chạm ngưỡng
 * ĐỦ SỐ LẦN trong cửa sổ ngày (VIOLATION_SOC_BREACH_COUNT, mặc định 3) — nên tạo đủ số
 * phiên chứ không phải một.
 */
async function dungKichBanViPham(
  pool: pg.Pool,
  config: ReturnType<typeof loadConfigFromEnvFile>,
): Promise<{ soPhien: number; socTran: number | null }> {
  const xe = await pool.query<{ id: string; customer_id: string }>(
    `SELECT id, customer_id FROM vehicles WHERE vin = $1`,
    [XE_KICH_BAN_VI_PHAM],
  );
  const tram = await pool.query<{ station_id: string; id: string }>(
    // connectors không có created_at (migration 0002) — sắp theo trạm + số trụ cho ổn định.
    `SELECT station_id, id FROM connectors ORDER BY station_id, ocpp_connector_id LIMIT 1`,
  );
  if (xe.rowCount === 0 || tram.rowCount === 0) return { soPhien: 0, socTran: null };

  // SOC trần của chính sách ĐANG hiệu lực cho xe này (fleet-specific thắng toàn hệ,
  // bản mới nhất đã có hiệu lực thắng bản cũ).
  const cs = await pool.query<{ soc_max_pct: string | null }>(
    `SELECT soc_max_pct FROM charging_policies
     WHERE soc_max_pct IS NOT NULL AND effective_from <= now()
       AND (customer_id = $1 OR customer_id IS NULL)
     ORDER BY (customer_id IS NULL), effective_from DESC LIMIT 1`,
    [xe.rows[0]!.customer_id],
  );
  const socTran = cs.rows[0]?.soc_max_pct === undefined ? null : Number(cs.rows[0].soc_max_pct);
  if (socTran === null) return { soPhien: 0, socTran: null };

  // Tạo dư 1 phiên so với ngưỡng để kết luận chắc chắn kích hoạt.
  const soPhien = config.viPham.socBreachCount + 1;
  for (let i = 0; i < soPhien; i++) {
    // Tất cả phiên nằm trong 12 giờ gần nhất, KHÔNG rải qua nhiều ngày.
    // Rải qua nhiều ngày là bẫy: các phiên rơi vào những PHIÊN BẢN chính sách khác nhau
    // (F-B1 đối chiếu theo chính sách hiệu lực LÚC SẠC), mỗi bản một SOC trần khác nhau,
    // nên số lần thực sự vượt trần ít hơn số phiên đã tạo và kết luận "thường xuyên"
    // không kích hoạt. Đã vấp đúng lỗi này: lần chạy đầu 0 cảnh báo, lần sau lại có.
    const batDau = Date.now() - (i + 1) * 2 * 3600_000; // cách nhau 2 giờ
    await pool.query(
      `INSERT INTO charging_sessions
         (vehicle_id, station_id, connector_id, ocpp_transaction_id, started_at, ended_at,
          energy_kwh, soc_start_pct, soc_end_pct)
       VALUES ($1, $2, $3, $4, $5, $6, 30, 60, $7)
       ON CONFLICT (ocpp_transaction_id) DO NOTHING`,
      [
        xe.rows[0]!.id,
        tram.rows[0]!.station_id,
        tram.rows[0]!.id,
        `${MA_PHIEN_DEMO}${String(i)}`,
        new Date(batDau).toISOString(),
        new Date(batDau + 3600_000).toISOString(),
        socTran + 5, // vượt trần → soc_above_max
      ],
    );
  }

  // Chạy job đối chiếu — chính nó ghi violations (append-only) + cảnh báo F-B5.
  await kiemTraViPham(pool, {
    muiGio: config.muiGio,
    socBreachCount: config.viPham.socBreachCount,
    socBreachWindowDays: config.viPham.socBreachWindowDays,
    log: () => {
      /* demo tự in */
    },
  });
  return { soPhien, socTran };
}

async function main(): Promise<void> {
  loadEnv();
  const config = loadConfigFromEnvFile();

  khung([
    'G3 NETWORK — NGHIỆM THU TUẦN 10–11',
    'MỘT TUẦN CỦA QUẢN LÝ ĐỘI XE (Hành trình 2, sheet 2)',
    '',
    'Sáng thứ 2 mở portal thấy tổng quan · giữa tuần nhận vi phạm sạc ·',
    'xử lý ngay từ portal · bàn giao xe mới · quản trị tài khoản.',
    '',
    'Dữ liệu GIẢ 100%: không VIN thật, không SĐT thật, không tiền thật.',
  ]);

  tieuDe(1, 'Chuẩn bị database (migration + dữ liệu giả)');
  const admin = new pg.Client({ connectionString: databaseUrl() });
  try {
    await admin.connect();
  } catch (err) {
    console.error(
      `\n  ✖ Không kết nối được PostgreSQL: ${moTaLoi(err)}\n` +
        '    → Bật Docker Desktop rồi: docker compose -f infra/docker-compose.yml up -d\n',
    );
    process.exit(1);
  }
  const daAp = await runMigrations(admin);
  ok(`migration: ${daAp.length > 0 ? `vừa áp ${daAp.length} file` : 'đã ở bản mới nhất'}`);
  await seed(admin);
  ok('seed: 21 xe (20 đang chạy + 1 chờ kích hoạt) · 7 tài khoản');
  await donDepDemoCu(admin);

  const pool = new pg.Pool({ connectionString: databaseUrl(), max: 10 });

  // Dựng sẵn kịch bản vi phạm sạc mà bước 3 sẽ kiểm tra — demo phải TỰ TẠO dữ liệu nó
  // khẳng định, không dựa vào demo khác đã chạy trước (xem ghi chú ở dungKichBanViPham).
  const kichBan = await dungKichBanViPham(pool, config);
  if (kichBan.soPhien > 0) {
    ok(
      `dựng kịch bản vi phạm: ${String(kichBan.soPhien)} phiên sạc vượt SOC trần ` +
        `${String(kichBan.socTran)}% cho xe ${XE_KICH_BAN_VI_PHAM}`,
    );
  } else {
    canhBao('không dựng được kịch bản vi phạm — chính sách sạc không khai SOC trần');
  }

  const imLang = (): void => {
    /* demo tự in, không cần log của thư viện */
  };
  const app = await buildApp({
    logger: false,
    config,
    db: pool,
    sms: new ConsoleSmsSender(imLang),
    otpCodeFactory: () => MA_OTP,
  });
  await app.ready();

  try {
    // ---- ① SÁNG THỨ 2 -----------------------------------------------------------------
    tieuDe(2, 'Sáng thứ 2: quản lý đội mở portal (F-E1)');
    const ql = await dangNhap(app, SDT_QUAN_LY);

    const [xeRes, banDoRes, canhBaoRes, thietBiRes] = await Promise.all([
      app.inject({ method: 'GET', url: '/vehicles?limit=200', headers: { authorization: ql } }),
      app.inject({
        method: 'GET',
        url: '/vehicles/map?reason=Mo man hinh tong quan portal doi xe',
        headers: { authorization: ql },
      }),
      app.inject({ method: 'GET', url: '/alerts?limit=50', headers: { authorization: ql } }),
      app.inject({
        method: 'GET',
        url: '/devices/health?im_lang_qua_giay=900',
        headers: { authorization: ql },
      }),
    ]);

    const soXe = xeRes.json().total as number;
    const soXeTrenBanDo = banDoRes.json().so_xe as number;
    const canhBaoBody = canhBaoRes.json() as {
      total: number;
      theo_loai: Record<string, number>;
      theo_muc_do: Record<string, number>;
    };

    bang(
      [
        { ten: 'Khối trên màn hình tổng quan', rong: 34 },
        { ten: 'Số liệu', rong: 12, phai: true },
      ],
      [
        ['Xe trong phạm vi', String(soXe)],
        ['Xe có vị trí trên bản đồ', String(soXeTrenBanDo)],
        ['Cảnh báo chưa xử lý', String(canhBaoBody.total)],
        ['Cảnh báo nguy cấp (mức 3)', String(canhBaoBody.theo_muc_do['3'] ?? 0)],
        ['Thiết bị mất liên lạc', String(thietBiRes.json().total as number)],
      ],
    );

    // Bốn khối PRD nêu tên phải CÙNG có mặt trong MỘT lần tải — đó chính là yêu cầu
    // "trang chủ = 1 màn hình tổng quan, không cần click sâu".
    const duBonKhoi =
      xeRes.statusCode === 200 &&
      banDoRes.statusCode === 200 &&
      canhBaoRes.statusCode === 200 &&
      thietBiRes.statusCode === 200;
    ghiTieuChi(
      'F-E1',
      'Một màn hình có đủ bản đồ + danh sách xe + cảnh báo + thiết bị offline',
      duBonKhoi,
      duBonKhoi ? '4/4 khối tải được trong một lần mở trang' : 'thiếu khối',
    );

    // ---- ③ PHẠM VI THEO ĐỘI (kiểm ngay tại đây cho gọn) -------------------------------
    const tongXeToanHe = Number(
      (await pool.query<{ n: string }>(`SELECT count(*)::int AS n FROM vehicles`)).rows[0]!.n,
    );
    const chiDoiMinh = soXe < tongXeToanHe && soXe > 0;
    ghiTieuChi(
      'sheet 9',
      'Quản lý đội chỉ thấy xe ĐỘI MÌNH',
      chiDoiMinh,
      `thấy ${soXe}/${tongXeToanHe} xe toàn hệ`,
    );

    // ---- ② GIỮA TUẦN: vi phạm sạc ------------------------------------------------------
    tieuDe(3, 'Giữa tuần: nhận cảnh báo vi phạm sạc & xem bằng chứng (F-B3, F-B5)');
    const soViPhamCanhBao = canhBaoBody.theo_loai.charging_violation ?? 0;
    const viPhamRes = await app.inject({
      method: 'GET',
      url: '/violations?limit=20',
      headers: { authorization: ql },
    });
    const soViPham = viPhamRes.json().total as number;
    ghiTieuChi(
      'F-B5',
      'Vi phạm sạc nổi lên khối cảnh báo của màn hình tổng quan',
      soViPhamCanhBao > 0,
      `${soViPhamCanhBao} cảnh báo vi phạm · ${soViPham} hồ sơ vi phạm`,
    );

    if (soViPham > 0) {
      const id = viPhamRes.json().items[0].id as string;
      const chiTiet = await app.inject({
        method: 'GET',
        url: `/violations/${id}`,
        headers: { authorization: ql },
      });
      // Yêu cầu thiết kế Hành trình 2 bước 2: "cảnh báo kèm hành động gợi ý
      // (gọi tài xế, XEM BẰNG CHỨNG)" — bằng chứng phải mở được ngay từ portal.
      ghiTieuChi(
        'F-B3',
        'Mở được bằng chứng vi phạm ngay từ portal',
        chiTiet.statusCode === 200,
        chiTiet.statusCode === 200 ? 'GET /violations/{id} trả hồ sơ đầy đủ' : 'không mở được',
      );
    }

    // ---- ⑤ NHẬT KÝ TRUY CẬP VỊ TRÍ ------------------------------------------------------
    tieuDe(4, 'Nhật ký truy cập vị trí ghi lại đúng lượt vừa xem (F-F1, NF-06)');
    const ad = await dangNhap(app, SDT_ADMIN);
    const nhatKy = await app.inject({
      method: 'GET',
      url: '/audit-logs?action=vehicle_location.read&limit=5',
      headers: { authorization: ad },
    });
    const dongDau = nhatKy.json().items[0] as {
      user_role: string;
      so_xe: number | null;
      reason: string;
    };
    // Một lần mở bản đồ = MỘT dòng nhật ký cho nhiều xe (rbac-matrix R-13).
    const ghiDung = dongDau.user_role === 'fleet_manager' && dongDau.so_xe === soXeTrenBanDo;
    ghiTieuChi(
      'quy tắc 5',
      'Một lần xem bản đồ = một dòng nhật ký, ghi đủ ai/xe nào/lý do',
      ghiDung,
      `vai trò ${dongDau.user_role} · ${String(dongDau.so_xe)} xe · "${dongDau.reason}"`,
    );

    // ---- ④ BÀN GIAO XE MỚI --------------------------------------------------------------
    tieuDe(5, 'Bàn giao xe mới: kích hoạt theo VIN tới tick xanh (F-F2)');
    const mo = await app.inject({
      method: 'POST',
      url: '/provisioning',
      headers: { authorization: ad },
      payload: { vin: VIN_CHUA_KICH_HOAT },
    });
    if (mo.statusCode !== 201) {
      canhBao(`không mở được phiên kích hoạt: ${mo.body}`);
    } else {
      const phienId = mo.json().id as string;
      await app.inject({
        method: 'POST',
        url: `/provisioning/${phienId}/thiet-bi`,
        headers: { authorization: ad },
        payload: { device_serial: 'G3-SIM-DEV-0021', firmware_version: '1.2.0-sim' },
      });

      const vb = await app.inject({
        method: 'GET',
        url: '/provisioning/consent',
        headers: { authorization: ad },
      });
      const laBanNhap = vb.json().la_ban_nhap as boolean;
      // Q7 đang MỞ: hệ thống PHẢI tự nói ra rằng consent chưa có giá trị pháp lý.
      ghiTieuChi(
        'Q7',
        'Văn bản đồng ý tự khai là BẢN NHÁP, chưa có giá trị pháp lý',
        laBanNhap,
        laBanNhap
          ? `phiên bản ${vb.json().version as string} — [CHỜ LEGAL]`
          : 'đã có bản chính thức',
      );

      const taiXe = await app.inject({
        method: 'GET',
        url: `/provisioning/${phienId}/tai-xe`,
        headers: { authorization: ad },
      });
      const driverId = taiXe.json().items[0]?.driver_id as string | undefined;
      if (driverId) {
        await app.inject({
          method: 'POST',
          url: `/provisioning/${phienId}/consent`,
          headers: { authorization: ad },
          payload: { driver_id: driverId, consent_version: vb.json().version },
        });
      }

      // Chưa có dữ liệu về thì KHÔNG được chốt — đây là rào chắn chính của F-F2.
      const chotSom = await app.inject({
        method: 'POST',
        url: `/provisioning/${phienId}/hoan-tat`,
        headers: { authorization: ad },
      });
      ghiTieuChi(
        'F-F2',
        'Chưa có telemetry thì KHÔNG chốt được (tick xanh không thể làm dối)',
        chotSom.statusCode === 400,
        chotSom.statusCode === 400
          ? 'bị từ chối đúng như mong đợi'
          : 'LỌT — chốt được khi chưa có dữ liệu',
      );

      // Thiết bị lên sóng (demo bơm 1 bản ghi; chạy simulator thật thì dùng
      // `npm run sim:vehicles -- --count 21 --vin-prefix G3-SIM-VIN`).
      await pool.query(
        `INSERT INTO telematics_readings (time, vehicle_id, schema_version, soc_pct, speed_kmh, odometer_km, position)
         SELECT now(), id, 2, 92.0, 0, 5, ST_SetSRID(ST_MakePoint(106.7, 10.8), 4326)::geography
         FROM vehicles WHERE vin = $1`,
        [VIN_CHUA_KICH_HOAT],
      );

      const kt = await app.inject({
        method: 'GET',
        url: `/provisioning/${phienId}/telemetry`,
        headers: { authorization: ad },
      });
      const chot = await app.inject({
        method: 'POST',
        url: `/provisioning/${phienId}/hoan-tat`,
        headers: { authorization: ad },
      });
      const choGiay = kt.json().cho_giay as number;
      ghiTieuChi(
        'F-F2',
        'Kích hoạt tới TICK XANH và chốt được biên bản bàn giao',
        chot.statusCode === 200 && chot.json().status === 'thanh_cong',
        `chờ telemetry ${choGiay}s (trần 60s)`,
      );
      // Thời gian chờ phải là số có nghĩa — từng bị lệch đồng hồ Node↔DB thành 14776s.
      ghiTieuChi(
        'F-F2',
        'Thời gian chờ đo bằng đồng hồ DB (con số hợp lý, không lệch đồng hồ)',
        choGiay >= 0 && choGiay <= 60,
        `${choGiay} giây`,
      );

      const kpi = (
        await app.inject({ method: 'GET', url: '/provisioning', headers: { authorization: ad } })
      ).json().kpi as { ty_le_pct: number | null; mau_so: number; dat_muc_tieu: boolean | null };
      ghiTieuChi(
        'KPI ≥98%',
        'Tỷ lệ kích hoạt thành công đo được',
        kpi.dat_muc_tieu === true,
        `${String(kpi.ty_le_pct)}% trên ${kpi.mau_so} phiên đã kết thúc`,
      );
    }

    // ---- ⑤ QUẢN TRỊ TÀI KHOẢN -----------------------------------------------------------
    tieuDe(6, 'Quản trị tài khoản: mời & khoá (F-F1)');
    const moi = await app.inject({
      method: 'POST',
      url: '/users',
      headers: { authorization: ad },
      payload: {
        email: 'taixe-demo-tuan11@test.local',
        full_name: 'Tài xế demo tuần 11 (GIẢ)',
        role: 'driver',
        phone: '0900009911',
        customer_id: (
          await pool.query<{ customer_id: string }>(
            `SELECT customer_id FROM vehicles WHERE vin = $1`,
            [VIN_CHUA_KICH_HOAT],
          )
        ).rows[0]!.customer_id,
      },
    });
    const taoDuoc = moi.statusCode === 201;
    ghiTieuChi(
      'F-F1',
      'Mời tài khoản mới, đăng nhập được ngay bằng OTP',
      taoDuoc,
      moi.statusCode === 201 ? 'đã tạo' : moi.body,
    );

    if (taoDuoc) {
      const idMoi = moi.json().id as string;
      const tokenMoi = await dangNhap(app, '0900009911');
      const truoc = await app.inject({
        method: 'GET',
        url: '/vehicles',
        headers: { authorization: tokenMoi },
      });
      await app.inject({
        method: 'PATCH',
        url: `/users/${idMoi}`,
        headers: { authorization: ad },
        payload: { is_active: false },
      });
      const sau = await app.inject({
        method: 'GET',
        url: '/vehicles',
        headers: { authorization: tokenMoi },
      });
      // Khoá tài khoản phải chặn NGAY token đang cầm, không chờ token hết hạn.
      ghiTieuChi(
        'F-F1',
        'Khoá tài khoản có hiệu lực NGAY với token đang dùng',
        truoc.statusCode === 200 && sau.statusCode === 401,
        `trước khoá ${String(truoc.statusCode)} → sau khoá ${String(sau.statusCode)}`,
      );
    }

    // ---- TỔNG KẾT ------------------------------------------------------------------------
    tieuDe(7, 'Tổng kết nghiệm thu');
    bang(
      [
        { ten: 'Mã', rong: 10 },
        { ten: 'Tiêu chí', rong: 56 },
        { ten: 'Kết quả', rong: 8 },
      ],
      tieuChi.map((t) => [t.ma, t.ten, t.dat ? 'ĐẠT' : 'HỎNG']),
    );

    const hong = tieuChi.filter((t) => !t.dat);
    if (hong.length === 0) {
      ok(`TẤT CẢ ${tieuChi.length} TIÊU CHÍ ĐẠT.`);
    } else {
      canhBao(
        `${hong.length}/${tieuChi.length} tiêu chí HỎNG: ${hong.map((t) => t.ma).join(', ')}`,
      );
      process.exitCode = 1;
    }

    console.log(
      '\n  Xem bằng mắt trên portal: http://localhost:3100 ' +
        `(đăng nhập ${SDT_QUAN_LY} — mã OTP in ra console của apps/api)\n`,
    );
  } finally {
    await app.close();
    await pool.end();
    await admin.end();
  }
}

main().catch((err: unknown) => {
  console.error(`\n  ✖ Demo hỏng: ${moTaLoi(err)}\n`);
  process.exit(1);
});
