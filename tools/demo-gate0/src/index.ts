// DEMO GATE 0 — Chứng minh luồng end-to-end của tiêu chí Gate 0 ③ (docs/prd/03):
//   xe giả lập → cảnh báo pin → phiên sạc giả lập → đối soát 3 chiều
//
// Chạy: npm run demo:gate0   (chỉ cần `npm install` + `docker compose up -d` trước đó)
//
// Vì sao CHẠY TRONG MỘT TIẾN TRÌNH thay vì spawn nhiều tiến trình con: demo này để quay
// video báo cáo, phải chạy được ngay trên máy sạch (kể cả Windows) và tắt sạch khi Ctrl+C.
// Mọi thành phần vẫn là code THẬT của hệ thống, đi qua hạ tầng THẬT — PostgreSQL/TimescaleDB,
// MQTT EMQX, WebSocket OCPP 1.6J, HTTP API Fastify. Chỉ khác ở chỗ chúng nằm chung tiến trình.
import pg from 'pg';
import { databaseUrl, loadEnv, runMigrations, seed } from '@g3/db';
import { ConsoleSmsSender } from '@g3/contracts';
import { buildApp, chayDoiSoat, loadConfigFromEnvFile, type TomTatDoiSoat } from '@g3/api';
import { IngestMetrics, IngestPipeline, MqttTelematicsSource, resolveMqttUrl } from '@g3/ingest';
import { startOcppServer, type SessionRegistry } from '@g3/csms';
import { ChargePointSim } from '@g3/ocpp-sim';
import { connectWsTransport } from '@g3/ocpp-sim/src/ws-transport';
import { FleetSimulator, MqttTelemetryPublisher, parseSimArgs } from '@g3/vehicle-sim';
import type { FastifyInstance } from 'fastify';
import { bang, buoc, canhBao, choDen, khung, nghi, ok, soVn, tieuDe, tienVn } from './ui';

// ---- Thông số kịch bản demo (đổi ở đây nếu muốn video ngắn/dài hơn) --------------------
const CAU_HINH = {
  soXeDoi: 19, // 19 xe chạy bình thường (VIN 0002…0020)
  vinPrefix: 'G3-SIM-VIN', // khớp seed (docs/simulators.md)
  vinXeTutPin: 1, // xe VIN 0001 là nhân vật chính
  maTram: 'G3-ST-001',
  nhipXeGiay: 2, // chu kỳ telemetry của đội xe
  nhipXeChinhGiay: 1, // xe chính gửi dày hơn cho mượt
  phutTutPin: 1, // SOC 100% → 5% trong 1 phút
  congSuatSacKw: 120, // đúng công suất trụ trong seed
  giayPhienSac: 120, // độ dài phiên sạc
  bomLechPct: 5, // % bơm sai có chủ ý ở chiều tiền
} as const;

const vin = (n: number): string => `${CAU_HINH.vinPrefix}-${String(n).padStart(4, '0')}`;
const VIN_CHINH = vin(CAU_HINH.vinXeTutPin);

interface DonDep {
  ten: string;
  dung: () => Promise<void> | void;
}
const donDep: DonDep[] = [];
let dangTat = false;

async function tatSach(ma = 0): Promise<never> {
  if (dangTat) process.exit(ma);
  dangTat = true;
  console.log('\n  Đang tắt sạch…');
  for (const d of [...donDep].reverse()) {
    try {
      await d.dung();
    } catch {
      /* tắt là tắt — lỗi lúc dọn dẹp không che kết quả demo */
    }
  }
  process.exit(ma);
}
process.on('SIGINT', () => void tatSach(130));
process.on('SIGTERM', () => void tatSach(143));

async function main(): Promise<void> {
  loadEnv();
  const batDauDemo = new Date();

  khung([
    'G3 NETWORK — DEMO GATE 0',
    '',
    'Tiêu chí Gate 0 ③: luồng mock end-to-end phải chạy được',
    '   xe giả lập → cảnh báo pin → phiên sạc giả lập → đối soát',
    '',
    'Dữ liệu GIẢ 100%: không VIN thật, không SĐT thật, không tiền thật.',
  ]);

  // ---- BƯỚC 1 — Hạ tầng & dữ liệu nền ------------------------------------------------
  tieuDe(1, 'Chuẩn bị database (migration + dữ liệu giả)');
  const admin = new pg.Client({ connectionString: databaseUrl() });
  try {
    await admin.connect();
  } catch (err) {
    console.error(
      `\n  ✖ Không kết nối được PostgreSQL (${err instanceof Error ? err.message : String(err)}).\n` +
        '    → Chạy: docker compose -f infra/docker-compose.yml up -d\n',
    );
    process.exit(1);
  }
  const daAp = await runMigrations(admin);
  ok(`migration: ${daAp.length > 0 ? `vừa áp ${daAp.length} file` : 'đã ở bản mới nhất'}`);
  await seed(admin);
  ok('seed: 20 xe · 3 trạm × 4 trụ · 7 tài khoản (dữ liệu GIẢ)');
  await donDepDuLieuDemoCu(admin);

  const pool = new pg.Pool({ connectionString: databaseUrl(), max: 10 });
  donDep.push({ ten: 'pool', dung: () => pool.end() });
  donDep.push({ ten: 'admin', dung: () => admin.end() });

  // ---- BƯỚC 2 — Khởi động các thành phần ---------------------------------------------
  tieuDe(2, 'Khởi động ingest · CSMS · API');
  const config = loadConfigFromEnvFile();

  const metrics = new IngestMetrics();
  const pipeline = new IngestPipeline(
    pool,
    metrics,
    () => Date.now(),
    (m) => console.log(`  ${m}`),
  );
  const nguon = new MqttTelematicsSource(resolveMqttUrl(process.env));
  nguon.subscribe((msg) => pipeline.handle(msg));
  try {
    await nguon.connect();
  } catch (err) {
    console.error(
      `\n  ✖ Không kết nối được MQTT (${err instanceof Error ? err.message : String(err)}).\n` +
        '    → Chạy: docker compose -f infra/docker-compose.yml up -d\n',
    );
    await tatSach(1);
  }
  donDep.push({ ten: 'ingest', dung: () => nguon.disconnect() });
  ok(`ingest: đang nhận telemetry từ ${resolveMqttUrl(process.env)}`);

  const phienTram: SessionRegistry = new Map();
  const congCsms = Number(process.env.CSMS_WS_PORT ?? 9220);
  const wss = startOcppServer(congCsms, pool, phienTram, { log: (m) => console.log(`  ${m}`) });
  donDep.push({ ten: 'csms', dung: () => void wss.close() });
  ok(`CSMS: OCPP 1.6J tại ws://localhost:${congCsms}/ocpp/{maTram}`);

  const sms = new ConsoleSmsSender(() => {
    /* mã OTP lấy trực tiếp trong bước RBAC, không cần in ra */
  });
  const app: FastifyInstance = await buildApp({ logger: false, config, db: pool, sms });
  await app.listen({ port: config.port, host: '0.0.0.0' });
  donDep.push({ ten: 'api', dung: () => app.close() });
  ok(`API: http://localhost:${config.port}  ·  tài liệu: http://localhost:${config.port}/docs`);

  // ---- BƯỚC 3 — Đội xe 20 chiếc lăn bánh ---------------------------------------------
  tieuDe(3, `Giả lập ${CAU_HINH.soXeDoi + 1} xe gửi telemetry qua MQTT`);
  const doiXe = taoDoiXe([
    '--count',
    String(CAU_HINH.soXeDoi),
    '--vin-prefix',
    CAU_HINH.vinPrefix,
    '--vin-start',
    '2',
    '--scenario',
    'normal',
    '--interval-ms',
    String(CAU_HINH.nhipXeGiay * 1000),
  ]);
  await doiXe.start();
  await doiXe.tick(Date.now());
  doiXe.startLoop();
  donDep.push({ ten: 'doi-xe', dung: () => doiXe.stop() });
  ok(`${CAU_HINH.soXeDoi} xe (${vin(2)}…${vin(20)}) đang chạy tuyến Hà Nội – Lạng Sơn`);

  const xeTutPin = taoDoiXe([
    '--count',
    '1',
    '--vin-prefix',
    CAU_HINH.vinPrefix,
    '--vin-start',
    String(CAU_HINH.vinXeTutPin),
    '--scenario',
    'drain',
    '--drain-minutes',
    String(CAU_HINH.phutTutPin),
    '--interval-ms',
    String(CAU_HINH.nhipXeChinhGiay * 1000),
  ]);
  await xeTutPin.start();
  await xeTutPin.tick(Date.now());
  xeTutPin.startLoop();
  // Phải đăng ký dọn dẹp NGAY: nếu demo hỏng hoặc bị Ctrl+C ở bước 4 thì simulator này
  // vẫn còn chạy và giữ kết nối MQTT, tiến trình không thoát được.
  donDep.push({ ten: 'xe-tut-pin', dung: () => xeTutPin.stop() });
  ok(`xe ${VIN_CHINH} bắt đầu tụt pin 100% → 5% trong ${CAU_HINH.phutTutPin} phút`);

  const xeChinhId = await layIdXe(pool, VIN_CHINH);

  // ---- BƯỚC 4 — Cảnh báo pin phân cấp (F-A2) -----------------------------------------
  tieuDe(4, 'Cảnh báo pin phân cấp 30% / 20% / 10% (F-A2)');
  buoc('chờ SOC cắt qua từng ngưỡng…');
  const duCanhBao = await choDen(
    'cảnh báo pin nguy cấp (10%)',
    async () => (await demCanhBaoPin(pool, xeChinhId)) >= 3,
    150,
  );
  const canhBaoPin = await docCanhBaoPin(pool, xeChinhId);
  if (!duCanhBao) canhBao('chưa đủ 3 ngưỡng trong thời gian chờ — vẫn tiếp tục demo');
  bang(
    [
      { ten: 'Mức', rong: 10 },
      { ten: 'Ngưỡng', rong: 8, phai: true },
      { ten: 'SOC lúc bắn', rong: 12, phai: true },
      { ten: 'Trạm gợi ý gần nhất', rong: 30 },
    ],
    canhBaoPin.map((a) => [
      a.muc,
      `${a.nguong_pct}%`,
      `${a.soc_pct.toFixed(1)}%`,
      a.tram ? `${a.tram.code} — ${a.tram.khoang_cach_km} km, ${a.tram.tru_trong} trụ trống` : '—',
    ]),
  );
  ok(`${canhBaoPin.length} cảnh báo, mỗi ngưỡng đúng 1 lần (chống spam — ADR-006)`);

  await xeTutPin.stop();
  buoc(`xe ${VIN_CHINH} dừng lại và cắm sạc tại trạm ${CAU_HINH.maTram}`);

  // ---- BƯỚC 5 — Phiên sạc thật qua OCPP 1.6J -----------------------------------------
  tieuDe(5, 'Phiên sạc qua OCPP 1.6J — trụ ảo ↔ CSMS');
  const socTruocSac = (await docSocMoiNhat(pool, xeChinhId)) ?? 5;

  // Xe phải BÁO SOC TĂNG trong suốt phiên: đây chính là chiều "xe" của đối soát 3 chiều.
  const xeDangSac = taoDoiXe([
    '--count',
    '1',
    '--vin-prefix',
    CAU_HINH.vinPrefix,
    '--vin-start',
    String(CAU_HINH.vinXeTutPin),
    '--scenario',
    'charge',
    '--charge-power-kw',
    String(CAU_HINH.congSuatSacKw),
    '--charge-start-soc',
    String(Math.max(0, Math.round(socTruocSac))),
    '--interval-ms',
    String(CAU_HINH.nhipXeChinhGiay * 1000),
  ]);
  await xeDangSac.start();
  await xeDangSac.tick(Date.now());
  xeDangSac.startLoop();
  donDep.push({ ten: 'xe-sac', dung: () => xeDangSac.stop() });
  ok(`BMS xe báo SOC tăng từ ${socTruocSac.toFixed(1)}% (${CAU_HINH.congSuatSacKw} kW)`);

  await nghi(2000); // để xe gửi vài bản ghi TRƯỚC khi trụ mở phiên

  const nhipTruMs = 2000;
  const soTick = Math.round((CAU_HINH.giayPhienSac * 1000) / nhipTruMs);
  const tru = new ChargePointSim(
    () => connectWsTransport(`ws://localhost:${congCsms}/ocpp/${CAU_HINH.maTram}`),
    {
      stationCode: CAU_HINH.maTram,
      idTag: VIN_CHINH, // Phase 1: idTag = VIN (ADR-005)
      scenario: 'normal',
      intervalMs: nhipTruMs,
      sessionTicks: soTick,
      powerKw: CAU_HINH.congSuatSacKw,
      meterStartWh: 1_000_000,
      log: (m) => console.log(`  ${m}`),
    },
  );
  await tru.connect();
  ok(`trụ ${CAU_HINH.maTram} kết nối CSMS — phiên sạc ~${CAU_HINH.giayPhienSac}s`);
  await tru.runSession();
  await nghi(1500); // chờ xe gửi nốt bản ghi sau mốc kết thúc phiên (phục vụ nội suy)
  await xeDangSac.stop();

  const phien = await docPhienMoiNhat(pool, xeChinhId);
  if (!phien) {
    canhBao('không ghi nhận được phiên sạc — dừng demo tại đây');
    await tatSach(1);
    return;
  }
  ok(
    `phiên sạc đã ghi (append-only, NF-11): ${soVn(phien.energy_kwh)} kWh · ` +
      `${Math.round(phien.giay)}s · trạm ${phien.ma_tram}`,
  );

  // ---- BƯỚC 6 — Thanh toán sandbox (bản ghi GIẢ) --------------------------------------
  tieuDe(6, 'Giao dịch thanh toán (bản ghi GIẢ do simulator sinh)');
  const gia = config.reconcile.giaVndMoiKwh;
  const soTien = Math.round(phien.energy_kwh * gia);
  await pool.query(
    `INSERT INTO payment_transactions (session_id, method, amount_vnd, status, gateway_ref)
     VALUES ($1, 'vnpay', $2, 'succeeded', $3)`,
    [phien.id, soTien, `SANDBOX-DEMO-${phien.id.slice(0, 8)}`],
  );
  ok(`thu ${tienVn(soTien)} = ${soVn(phien.energy_kwh)} kWh × ${tienVn(gia)}/kWh (giá GIẢ)`);

  // ---- BƯỚC 7 — Đối soát 3 chiều (NF-10) ---------------------------------------------
  tieuDe(7, 'Đối soát 3 chiều: trụ ↔ xe ↔ thanh toán (NF-10)');
  // Chỉ đối soát phiên của CHÍNH lần chạy demo này — phiên cũ trong DB dev (từ các lần
  // nghiệm thu trước) không có telemetry/thanh toán nên sẽ luôn là 'thiếu dữ liệu' và
  // làm rối bảng trình chiếu.
  const phamViDemo = { tuNgay: batDauDemo.toISOString() };
  const lanMot = await chayDoiSoat(
    pool,
    { ...config.reconcile, log: (m) => console.log(`  ${m}`) },
    phamViDemo,
  );
  inBangDoiSoat(lanMot, config.reconcile.nguongPct);
  if (lanMot.khop > 0) {
    ok(
      `khớp trong ngưỡng ${config.reconcile.nguongPct}% — ba nguồn số liệu độc lập cùng kể một câu chuyện`,
    );
  }

  // ---- BƯỚC 8 — Bơm sai số có chủ ý ---------------------------------------------------
  tieuDe(8, `Bơm sai ${CAU_HINH.bomLechPct}% có chủ ý — hệ thống phải phát hiện`);
  buoc('bảng charging_sessions là APPEND-ONLY nên không sửa được số kWh của trụ:');
  try {
    await pool.query(`UPDATE charging_sessions SET energy_kwh = energy_kwh * 1.05 WHERE id = $1`, [
      phien.id,
    ]);
    canhBao('LỖI NGHIÊM TRỌNG: sửa được bảng append-only — vi phạm NF-11!');
  } catch (err) {
    ok(`DB từ chối: ${(err as Error).message.split('\n')[0]}`);
  }

  buoc(`vậy bơm sai ở CHIỀU TIỀN: ghi thêm giao dịch dư ${CAU_HINH.bomLechPct}%`);
  await pool.query(
    `INSERT INTO payment_transactions (session_id, method, amount_vnd, status, gateway_ref)
     VALUES ($1, 'vnpay', $2, 'succeeded', $3)`,
    [
      phien.id,
      Math.round((soTien * CAU_HINH.bomLechPct) / 100),
      `SANDBOX-DEMO-LOI-${phien.id.slice(0, 8)}`,
    ],
  );
  const lanHai = await chayDoiSoat(
    pool,
    { ...config.reconcile, lamLaiTatCa: true, log: (m) => console.log(`  ${m}`) },
    phamViDemo,
  );
  inBangDoiSoat(lanHai, config.reconcile.nguongPct);
  const soAlertLech = await demAlertLech(pool);
  if (lanHai.lech > 0 && soAlertLech > 0) {
    ok(`phát hiện lệch và sinh ${soAlertLech} cảnh báo 'reconciliation_mismatch'`);
  } else {
    canhBao('KHÔNG phát hiện được sai lệch — cần xem lại job đối soát');
  }

  // ---- BƯỚC 9 — RBAC & audit log qua API thật ----------------------------------------
  tieuDe(9, 'Phân quyền sheet 9 + audit log vị trí xe (quy tắc 5)');
  await demoRbac(app, pool, xeChinhId, sms);

  // ---- BƯỚC 10 — Tóm tắt ---------------------------------------------------------------
  tieuDe(10, 'Tóm tắt kết quả');
  await inTomTat(pool, batDauDemo, config.reconcile.nguongPct, lanMot, lanHai);

  khung([
    'DEMO GATE 0 HOÀN TẤT.',
    '',
    `API vẫn đang chạy tại http://localhost:${config.port}/docs để trình bày thêm.`,
    'Nhấn Ctrl+C để tắt sạch toàn bộ.',
  ]);

  // Giữ tiến trình sống để người trình bày mở /docs, gọi thử API trong lúc quay video.
  await new Promise(() => {
    /* chờ Ctrl+C */
  });
}

// ---- Các hàm phụ trợ ------------------------------------------------------------------

function taoDoiXe(argv: string[]): FleetSimulator {
  const cfg = parseSimArgs(argv, process.env);
  return new FleetSimulator(
    cfg,
    (clientId, will) => new MqttTelemetryPublisher(cfg.mqttUrl, clientId, will),
  );
}

/**
 * Xóa dấu vết của LẦN CHẠY DEMO TRƯỚC trên chính các xe/phiên do demo tạo ra,
 * để bảng tóm tắt phản ánh đúng lần chạy này. KHÔNG đụng dữ liệu ngoài phạm vi demo
 * (ranh giới CLAUDE.md: không xóa dữ liệu test của người khác).
 */
async function donDepDuLieuDemoCu(db: pg.Client): Promise<void> {
  await db.query(
    `DELETE FROM reconciliation_results r
     USING charging_sessions cs, vehicles v
     WHERE r.session_id = cs.id AND cs.vehicle_id = v.id AND v.vin LIKE 'G3-SIM-VIN-%'`,
  );
  await db.query(
    `DELETE FROM payment_transactions p
     USING charging_sessions cs, vehicles v
     WHERE p.session_id = cs.id AND cs.vehicle_id = v.id AND v.vin LIKE 'G3-SIM-VIN-%'`,
  );
  await db.query(
    `DELETE FROM alerts a USING vehicles v
     WHERE a.vehicle_id = v.id AND v.vin LIKE 'G3-SIM-VIN-%'`,
  );
}

async function layIdXe(db: pg.Pool, vinXe: string): Promise<string> {
  const res = await db.query<{ id: string }>(`SELECT id FROM vehicles WHERE vin = $1`, [vinXe]);
  const id = res.rows[0]?.id;
  if (!id) throw new Error(`Không tìm thấy xe ${vinXe} — chạy lại npm run db:seed`);
  return id;
}

async function demCanhBaoPin(db: pg.Pool, vehicleId: string): Promise<number> {
  const res = await db.query<{ n: string }>(
    `SELECT count(*) AS n FROM alerts
     WHERE vehicle_id = $1 AND type IN ('battery_low', 'battery_critical')`,
    [vehicleId],
  );
  return Number(res.rows[0]!.n);
}

interface DongCanhBao {
  muc: string;
  nguong_pct: number;
  soc_pct: number;
  tram: { code: string; khoang_cach_km: number; tru_trong: number } | null;
}

async function docCanhBaoPin(db: pg.Pool, vehicleId: string): Promise<DongCanhBao[]> {
  const res = await db.query<{ payload: DongCanhBao & { tram_goi_y: DongCanhBao['tram'] } }>(
    `SELECT payload FROM alerts
     WHERE vehicle_id = $1 AND type IN ('battery_low', 'battery_critical')
     ORDER BY severity`,
    [vehicleId],
  );
  return res.rows.map((r) => ({
    muc: r.payload.muc,
    nguong_pct: r.payload.nguong_pct,
    soc_pct: r.payload.soc_pct,
    tram: r.payload.tram_goi_y,
  }));
}

async function docSocMoiNhat(db: pg.Pool, vehicleId: string): Promise<number | null> {
  const res = await db.query<{ soc: number | null }>(
    `SELECT soc_pct::float8 AS soc FROM telematics_readings
     WHERE vehicle_id = $1 ORDER BY time DESC LIMIT 1`,
    [vehicleId],
  );
  return res.rows[0]?.soc ?? null;
}

interface PhienDemo {
  id: string;
  energy_kwh: number;
  giay: number;
  ma_tram: string;
}

async function docPhienMoiNhat(db: pg.Pool, vehicleId: string): Promise<PhienDemo | null> {
  const res = await db.query<PhienDemo>(
    `SELECT cs.id, cs.energy_kwh::float8 AS energy_kwh,
            EXTRACT(EPOCH FROM (cs.ended_at - cs.started_at))::float8 AS giay,
            st.code AS ma_tram
     FROM charging_sessions cs
     JOIN charging_stations st ON st.id = cs.station_id
     WHERE cs.vehicle_id = $1 AND cs.ended_at IS NOT NULL
     ORDER BY cs.started_at DESC LIMIT 1`,
    [vehicleId],
  );
  return res.rows[0] ?? null;
}

async function demAlertLech(db: pg.Pool): Promise<number> {
  const res = await db.query<{ n: string }>(
    `SELECT count(*) AS n FROM alerts WHERE type = 'reconciliation_mismatch'`,
  );
  return Number(res.rows[0]!.n);
}

function inBangDoiSoat(tomTat: TomTatDoiSoat, nguongPct: number): void {
  if (tomTat.ket_qua.length === 0) {
    buoc('không có phiên nào cần đối soát ở lượt này');
    return;
  }
  bang(
    [
      { ten: 'Xe', rong: 16 },
      { ten: 'kWh trụ', rong: 9, phai: true },
      { ten: 'kWh xe', rong: 9, phai: true },
      { ten: 'kWh tiền', rong: 9, phai: true },
      { ten: 'Lệch max', rong: 9, phai: true },
      { ten: 'Kết luận', rong: 14 },
    ],
    tomTat.ket_qua.map((k) => [
      k.vin,
      soVn(k.kwh_tru),
      soVn(k.kwh_xe),
      soVn(k.kwh_thanh_toan),
      k.lech_max_pct === null ? '—' : `${k.lech_max_pct.toFixed(2)}%`,
      k.status === 'khop' ? '✔ KHỚP' : k.status === 'lech' ? '✖ LỆCH' : '… thiếu dữ liệu',
    ]),
  );
  buoc(`ngưỡng NF-10: lệch tối đa cho phép ${nguongPct}%`);
}

/** Gọi API THẬT bằng token thật để chứng minh RBAC + audit log, không giả lập kết quả. */
async function demoRbac(
  app: FastifyInstance,
  db: pg.Pool,
  vehicleId: string,
  sms: ConsoleSmsSender,
): Promise<void> {
  const dangNhap = async (phone: string): Promise<string> => {
    await app.inject({ method: 'POST', url: '/auth/otp/request', payload: { phone } });
    const ma = /\b(\d{6})\b/.exec(sms.lastTo(phone)?.body ?? '')?.[1];
    const res = await app.inject({
      method: 'POST',
      url: '/auth/otp/verify',
      payload: { phone, code: ma },
    });
    return `Bearer ${res.json().access_token as string}`;
  };

  const url = `/vehicles/${vehicleId}/location?reason=${encodeURIComponent('Demo Gate 0 — trinh bay Ban lanh dao')}`;

  const tokenEnergy = await dangNhap('0900000003'); // Vận hành G3 Energy
  const bịTuChoi = await app.inject({
    method: 'GET',
    url,
    headers: { authorization: tokenEnergy },
  });

  const tokenDoi = await dangNhap('0900000002'); // Chủ xe / QL đội
  const duocPhep = await app.inject({ method: 'GET', url, headers: { authorization: tokenDoi } });

  bang(
    [
      { ten: 'Vai trò (sheet 9)', rong: 24 },
      { ten: 'Gọi API vị trí xe', rong: 22 },
      { ten: 'Kết quả', rong: 20 },
    ],
    [
      [
        'Vận hành G3 Energy',
        'GET /vehicles/../location',
        `${bịTuChoi.statusCode} ${bịTuChoi.statusCode === 403 ? '— TỪ CHỐI ✔' : '— SAI!'}`,
      ],
      [
        'Chủ xe / QL đội',
        'GET /vehicles/../location',
        `${duocPhep.statusCode} ${duocPhep.statusCode === 200 ? '— CHO PHÉP ✔' : '— SAI!'}`,
      ],
    ],
  );

  const logs = await db.query<{ action: string; reason: string; ho_ten: string }>(
    `SELECT a.action, a.reason, u.full_name AS ho_ten
     FROM audit_logs a JOIN users u ON u.id = a.user_id
     ORDER BY a.occurred_at DESC LIMIT 2`,
  );
  buoc('audit log vừa ghi (quy tắc 5 — NF-06, Nghị định 13/2023):');
  bang(
    [
      { ten: 'Ai', rong: 26 },
      { ten: 'Hành động', rong: 26 },
      { ten: 'Lý do', rong: 20 },
    ],
    logs.rows.map((r) => [r.ho_ten, r.action, r.reason]),
  );
}

async function inTomTat(
  db: pg.Pool,
  tuLuc: Date,
  nguongPct: number,
  lanMot: TomTatDoiSoat,
  lanHai: TomTatDoiSoat,
): Promise<void> {
  const q = async (sql: string, params: unknown[] = []): Promise<number> => {
    const res = await db.query<{ n: string }>(sql, params);
    return Number(res.rows[0]!.n);
  };

  const soXe = await q(`SELECT count(*) AS n FROM vehicles WHERE vin LIKE 'G3-SIM-VIN-%'`);
  const soBanGhi = await q(`SELECT count(*) AS n FROM telematics_readings WHERE time >= $1`, [
    tuLuc.toISOString(),
  ]);
  const soXeOnline = await q(
    `SELECT count(DISTINCT vehicle_id) AS n FROM telematics_readings WHERE time >= $1`,
    [tuLuc.toISOString()],
  );
  const soCanhBaoPin = await q(
    `SELECT count(*) AS n FROM alerts
     WHERE type IN ('battery_low', 'battery_critical') AND triggered_at >= $1`,
    [tuLuc.toISOString()],
  );
  const soQuarantine = await q(
    `SELECT count(*) AS n FROM telemetry_quarantine WHERE received_at >= $1`,
    [tuLuc.toISOString()],
  );
  const soPhien = await q(`SELECT count(*) AS n FROM charging_sessions WHERE recorded_at >= $1`, [
    tuLuc.toISOString(),
  ]);
  const soTruAvailable = await q(`SELECT count(*) AS n FROM connectors WHERE status = 'Available'`);
  const soAudit = await q(`SELECT count(*) AS n FROM audit_logs WHERE occurred_at >= $1`, [
    tuLuc.toISOString(),
  ]);
  const giay = Math.round((Date.now() - tuLuc.getTime()) / 1000);
  bang(
    [
      { ten: 'Hạng mục', rong: 46 },
      { ten: 'Kết quả', rong: 22, phai: true },
    ],
    [
      ['Thời lượng demo', `${Math.floor(giay / 60)}p ${giay % 60}s`],
      ['Xe trong hệ thống (dữ liệu GIẢ)', String(soXe)],
      ['Xe đã gửi telemetry trong lần chạy này', String(soXeOnline)],
      ['Bản ghi telemetry đã nhận (F-A1, NF-01)', String(soBanGhi)],
      ['Bản tin bị cách ly vì dữ liệu bẩn (F-G1)', String(soQuarantine)],
      ['Cảnh báo pin phân cấp đã bắn (F-A2)', String(soCanhBaoPin)],
      ['Phiên sạc ghi nhận qua OCPP (F-B2, NF-11)', String(soPhien)],
      ['Trụ sạc đang trống (F-C2)', String(soTruAvailable)],
      [
        `Đối soát lượt 1 — dữ liệu nguyên vẹn (ngưỡng ${nguongPct}%)`,
        `${lanMot.khop} khớp / ${lanMot.lech} lệch`,
      ],
      [
        `Đối soát lượt 2 — sau khi bơm sai ${CAU_HINH.bomLechPct}%`,
        `${lanHai.khop} khớp / ${lanHai.lech} lệch`,
      ],
      ['Đối soát chưa kết luận vì thiếu dữ liệu', String(lanHai.thieu_du_lieu)],
      ['Phiên KHÔNG đối soát được vì lỗi kỹ thuật', String(lanMot.loi + lanHai.loi)],
      ['Dòng audit log truy cập vị trí (quy tắc 5)', String(soAudit)],
    ],
  );
}

main().catch(async (err: unknown) => {
  console.error(`\n  ✖ Demo lỗi: ${err instanceof Error ? err.stack : String(err)}`);
  await tatSach(1);
});
