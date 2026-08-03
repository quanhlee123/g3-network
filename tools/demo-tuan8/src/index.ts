// NGHIỆM THU TUẦN 8 — Vòng tiền & bảo hành. Demo THỨ HAI cho Ban lãnh đạo.
//
// Kịch bản: xe sạc SAI KHUNG GIỜ + trả tiền sandbox → hệ thống phải
//   ① ghi phiên sạc (F-B2, append-only NF-11)
//   ② gắn cờ vi phạm KÈM BẰNG CHỨNG, đối chiếu đúng version chính sách lúc sạc (F-B1, F-B3)
//   ③ cảnh báo tài xế/chủ xe nêu rõ hành vi & cách khắc phục (F-B5)
//   ④ thu tiền qua cổng SANDBOX, webhook idempotent (F-H1)
//   ⑤ đối soát 3 chiều trụ ↔ xe ↔ thanh toán KHỚP (F-C6, NF-10)
//   ⑥ in báo cáo sản lượng & báo cáo lệch theo ngày (F-C6)
//
// Chạy: npm run demo:tuan8   (chỉ cần `npm install` + `docker compose up -d` trước đó)
//
// Cùng nguyên tắc với demo Gate 0: MỘT tiến trình, nhưng mọi thành phần là code THẬT đi qua
// hạ tầng THẬT (PostgreSQL/TimescaleDB, MQTT EMQX, WebSocket OCPP 1.6J, HTTP API Fastify).
// Dữ liệu GIẢ 100% — không VIN thật, không SĐT thật, không tiền thật (quy tắc 12).
import pg from 'pg';
import { databaseUrl, loadEnv, runMigrations, seed } from '@g3/db';
import { ConsolePushSender, ConsoleSmsSender, MockPaymentGateway } from '@g3/contracts';
import { NotifierService } from '@g3/notify';
import {
  baoCaoLechTheoNgay,
  buildApp,
  chayDoiSoat,
  chinhSachHieuLuc,
  kiemTraViPham,
  loadConfigFromEnvFile,
  moTaKhungGio,
  sanLuongTheoKhach,
  taoGiaoDichChoPhien,
  xuLyWebhook,
} from '@g3/api';
import { IngestMetrics, IngestPipeline, MqttTelematicsSource, resolveMqttUrl } from '@g3/ingest';
import { startOcppServer, type SessionRegistry } from '@g3/csms';
import { ChargePointSim } from '@g3/ocpp-sim';
import { connectWsTransport } from '@g3/ocpp-sim/src/ws-transport';
import { FleetSimulator, MqttTelemetryPublisher, parseSimArgs } from '@g3/vehicle-sim';
import type { FastifyInstance } from 'fastify';
import {
  bang,
  buoc,
  canhBao,
  khung,
  moTaLoi,
  nghi,
  ok,
  soVn,
  tieuDe,
  tienVn,
} from '@g3/demo-gate0/src/ui';
import { khungGioLoaiTru } from './khung-gio';

const CAU_HINH = {
  vinPrefix: 'G3-SIM-VIN',
  soXe: 1, // kịch bản tuần 8 xoay quanh MỘT xe — vòng tiền phải nhìn rõ từng đồng
  maTram: 'G3-ST-004', // Gia Lâm — cùng hành lang với tuyến mặc định của vehicle-sim (D-10)
  congSuatSacKw: 120,
  giayPhienSac: 60,
  nhipXeGiay: 1,
  maChinhSach: 'BH-TUAN8',
} as const;

const VIN = `${CAU_HINH.vinPrefix}-0001`;

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
      /* lỗi lúc dọn dẹp không được che kết quả demo */
    }
  }
  process.exit(ma);
}
process.on('SIGINT', () => void tatSach(130));
process.on('SIGTERM', () => void tatSach(143));

/** Kết quả từng tiêu chí — bảng tổng kết cuối cùng đọc từ đây. */
const tieuChi: { ma: string; ten: string; dat: boolean; soLieu: string }[] = [];
function ghiTieuChi(ma: string, ten: string, dat: boolean, soLieu: string): void {
  tieuChi.push({ ma, ten, dat, soLieu });
  (dat ? ok : canhBao)(`${ma} — ${ten}: ${soLieu}`);
}

async function main(): Promise<void> {
  loadEnv();
  const batDauDemo = new Date();
  const config = loadConfigFromEnvFile();
  const muiGio = config.muiGio;

  khung([
    'G3 NETWORK — NGHIỆM THU TUẦN 8: VÒNG TIỀN & BẢO HÀNH',
    '',
    'Kịch bản: xe sạc SAI KHUNG GIỜ rồi trả tiền qua cổng sandbox.',
    'Hệ thống phải: ghi phiên · gắn cờ vi phạm kèm bằng chứng ·',
    'cảnh báo tài xế · thu tiền khớp · đối soát 3 chiều khớp.',
    '',
    'Dữ liệu GIẢ 100%: không VIN thật, không SĐT thật, không tiền thật.',
  ]);

  // ---- BƯỚC 1 — Hạ tầng --------------------------------------------------------------
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
  ok('seed: 20 xe · 6 trạm × 4 trụ · 7 tài khoản (dữ liệu GIẢ)');
  await donDepDemoCu(admin);

  const pool = new pg.Pool({ connectionString: databaseUrl(), max: 10 });
  donDep.push({ ten: 'pool', dung: () => pool.end() });
  donDep.push({ ten: 'admin', dung: () => admin.end() });

  // ---- BƯỚC 2 — Khởi động --------------------------------------------------------------
  tieuDe(2, 'Khởi động ingest · CSMS · API · cổng thanh toán');
  const metrics = new IngestMetrics();
  const pipeline = new IngestPipeline(
    pool,
    metrics,
    () => Date.now(),
    () => {},
  );
  const nguon = new MqttTelematicsSource(resolveMqttUrl(process.env));
  nguon.subscribe((msg) => pipeline.handle(msg));
  try {
    await nguon.connect();
  } catch (err) {
    console.error(
      `\n  ✖ Không kết nối được MQTT: ${moTaLoi(err)}\n` +
        '    → Bật Docker Desktop rồi: docker compose -f infra/docker-compose.yml up -d\n',
    );
    await tatSach(1);
  }
  donDep.push({ ten: 'ingest', dung: () => nguon.disconnect() });
  ok(`ingest: nhận telemetry từ ${resolveMqttUrl(process.env)}`);

  const phienTram: SessionRegistry = new Map();
  const congCsms = Number(process.env.CSMS_WS_PORT ?? 9220);
  const wss = startOcppServer(congCsms, pool, phienTram, { log: () => {} });
  donDep.push({ ten: 'csms', dung: () => void wss.close() });
  ok(`CSMS: OCPP 1.6J tại ws://localhost:${congCsms}/ocpp/{maTram}`);

  const imLang = (): void => {};
  const notifier = new NotifierService({
    db: pool,
    push: new ConsolePushSender(imLang),
    sms: new ConsoleSmsSender(imLang),
    log: imLang,
  });
  // Cổng thanh toán GIẢ nội bộ: demo không phụ thuộc tài khoản VNPay nào (ADR-012).
  const cong = new MockPaymentGateway();
  const app: FastifyInstance = await buildApp({
    logger: false,
    config,
    db: pool,
    sms: new ConsoleSmsSender(imLang),
    notifier,
    cong,
  });
  await app.listen({ port: config.port, host: '0.0.0.0' });
  donDep.push({ ten: 'api', dung: () => app.close() });
  ok(`API: http://localhost:${config.port}  ·  tài liệu: http://localhost:${config.port}/docs`);
  ok(`cổng thanh toán: ${cong.ten} — SANDBOX, không tiền thật`);

  const xeId = await layIdXe(pool, VIN);
  const doiId = await layDoiCuaXe(pool, xeId);

  // ---- BƯỚC 3 — F-B1: chính sách sạc có version ---------------------------------------
  tieuDe(3, 'Ban hành chính sách sạc & đổi version (F-B1)');
  // Khung giờ dựng LÙI VỀ QUÁ KHỨ so với lúc chạy demo, nên phiên sạc sắp tới chắc chắn
  // nằm ngoài khung — dù demo chạy vào giờ nào trong ngày (xem src/khung-gio.ts).
  const khungGio = khungGioLoaiTru(batDauDemo, muiGio);
  const v1 = await banHanhChinhSach(pool, {
    code: CAU_HINH.maChinhSach,
    version: 1,
    doiId,
    khungGio,
    socMax: 90,
    hieuLucTu: new Date(batDauDemo.getTime() - 30 * 86_400_000), // 30 ngày trước
    ghiChu: 'Ban hành theo hợp đồng bảo hành 500.000km (dữ liệu GIẢ)',
  });
  ok(
    `v1 hiệu lực từ ${ngayVn(v1.effective_from)} — chỉ cho sạc ${moTaKhungGio([khungGio])} ` +
      `(giờ ${muiGio}), SOC tối đa 90%`,
  );

  const gioHienTai = new Intl.DateTimeFormat('vi-VN', {
    timeZone: muiGio,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(batDauDemo);
  buoc(`bây giờ là ${gioHienTai} — NGOÀI khung cho phép, nên phiên sạc sắp tới là vi phạm`);

  // ---- BƯỚC 4 — Xe sạc SAI KHUNG GIỜ ---------------------------------------------------
  tieuDe(4, 'Xe sạc ngoài khung giờ — phiên qua OCPP 1.6J (F-B2)');
  const socBatDau = 35;
  const xeSac = taoXe([
    '--count',
    '1',
    '--vin-prefix',
    CAU_HINH.vinPrefix,
    '--vin-start',
    '1',
    '--scenario',
    'charge',
    '--charge-power-kw',
    String(CAU_HINH.congSuatSacKw),
    '--charge-start-soc',
    String(socBatDau),
    '--interval-ms',
    String(CAU_HINH.nhipXeGiay * 1000),
  ]);
  await xeSac.start();
  await xeSac.tick(Date.now());
  xeSac.startLoop();
  donDep.push({ ten: 'xe-sac', dung: () => xeSac.stop() });
  ok(`BMS xe ${VIN} báo SOC tăng từ ${socBatDau}% (${CAU_HINH.congSuatSacKw} kW)`);

  await nghi(2000); // xe gửi vài bản ghi TRƯỚC khi trụ mở phiên (phục vụ nội suy SOC)

  const nhipTruMs = 2000;
  const tru = new ChargePointSim(
    () => connectWsTransport(`ws://localhost:${congCsms}/ocpp/${CAU_HINH.maTram}`),
    {
      stationCode: CAU_HINH.maTram,
      idTag: VIN, // Phase 1: idTag = VIN (ADR-005)
      scenario: 'normal',
      intervalMs: nhipTruMs,
      sessionTicks: Math.round((CAU_HINH.giayPhienSac * 1000) / nhipTruMs),
      powerKw: CAU_HINH.congSuatSacKw,
      meterStartWh: 2_000_000,
      log: () => {},
    },
  );
  await tru.connect();
  buoc(`trụ ${CAU_HINH.maTram} mở phiên — sạc ~${CAU_HINH.giayPhienSac}s`);
  await tru.runSession();
  await nghi(1500); // chờ telemetry sau mốc kết thúc phiên
  await xeSac.stop();

  const phien = await docPhienMoiNhat(pool, xeId, batDauDemo);
  if (!phien) {
    canhBao('KHÔNG ghi nhận được phiên sạc — dừng nghiệm thu tại đây');
    await tatSach(1);
    return;
  }
  ghiTieuChi(
    'F-B2',
    'ghi phiên sạc (append-only NF-11)',
    true,
    `${soVn(phien.energy_kwh)} kWh · ${Math.round(phien.giay)}s · trạm ${phien.ma_tram}`,
  );

  // ---- BƯỚC 5 — F-H1: thanh toán sandbox ----------------------------------------------
  tieuDe(5, 'Thanh toán phiên sạc qua cổng SANDBOX (F-H1)');
  const optsTt = { cong, giaVndMoiKwh: config.reconcile.giaVndMoiKwh, log: () => {} };
  const giaoDich = await taoGiaoDichChoPhien(pool, optsTt, phien.id);
  buoc(
    `tạo lệnh thu ${tienVn(giaoDich.amount_vnd)} = ${soVn(giaoDich.energy_kwh)} kWh × ` +
      `${tienVn(config.reconcile.giaVndMoiKwh)}/kWh (đơn giá GIẢ)`,
  );

  const webhook = cong.taoWebhook(giaoDich.reference, { webhookId: 'WH-NGHIEM-THU-TUAN8' });
  const lan1 = await xuLyWebhook(pool, optsTt, webhook);
  // Cổng thanh toán retry là chuyện thường — gửi lại ĐÚNG webhook đó lần thứ hai.
  const lan2 = await xuLyWebhook(pool, optsTt, webhook);
  const soGiaoDich = await demGiaoDichThanhCong(pool, phien.id);
  ghiTieuChi(
    'F-H1',
    'webhook đến 2 lần → chỉ 1 giao dịch thành công',
    lan1.chapNhan && lan2.daXuLy && soGiaoDich.so === 1,
    `lần 1 = ghi nhận · lần 2 = đã xử lý · ${soGiaoDich.so} giao dịch · ` +
      `tổng thu ${tienVn(soGiaoDich.tong)}`,
  );

  // ---- BƯỚC 6 — F-B3/F-B5: gắn cờ vi phạm + cảnh báo -----------------------------------
  tieuDe(6, 'Đối chiếu chính sách → gắn cờ vi phạm kèm bằng chứng (F-B3, F-B5)');
  const apDung = await chinhSachHieuLuc(pool, xeId, phien.started_at);
  buoc(
    `chính sách áp cho phiên này: ${apDung?.code} v${apDung?.version} ` +
      `(hiệu lực từ ${ngayVn(apDung?.effective_from ?? '')})`,
  );

  const tomTatVp = await kiemTraViPham(pool, {
    muiGio,
    socBreachCount: config.viPham.socBreachCount,
    socBreachWindowDays: config.viPham.socBreachWindowDays,
    notifier,
    log: () => {},
  });
  const viPham = await docViPham(pool, phien.id);
  ghiTieuChi(
    'F-B3',
    'gắn cờ vi phạm đúng loại',
    viPham.some((v) => v.type === 'outside_hours'),
    viPham.length > 0
      ? viPham.map((v) => `${v.type} (${v.risk_level})`).join(', ')
      : `KHÔNG có vi phạm nào (đã xét ${tomTatVp.da_xet} phiên)`,
  );

  const vp = viPham.find((v) => v.type === 'outside_hours');
  if (vp) {
    const e = vp.evidence;
    bang(
      [
        { ten: 'Bằng chứng gồm', rong: 26 },
        { ten: 'Nội dung', rong: 46 },
      ],
      [
        [
          'Số phút ngoài khung',
          `${e.ket_luan.so_lieu.so_phut_ngoai_khung}/${Math.round(e.phien_sac.thoi_luong_phut)} phút của phiên`,
        ],
        ['Khung giờ của chính sách', moTaKhungGio(e.chinh_sach.allowed_hours ?? [])],
        ['Version dùng làm căn cứ', `${e.chinh_sach.code} v${e.chinh_sach.version}`],
        ['Phiên sạc', `${e.phien_sac.vin} · ${soVn(e.phien_sac.energy_kwh)} kWh`],
        ['Mã giao dịch OCPP', String(e.phien_sac.ocpp_transaction_id)],
        ['Telemetry kèm theo', `${(e.telemetry_lien_quan as unknown[]).length} mốc SOC`],
        ['Múi giờ đã dùng', String(e.cach_tinh.mui_gio_khung_gio)],
      ],
    );
    ghiTieuChi(
      'NF-11',
      'bằng chứng đủ để bên thứ ba tái dựng',
      Boolean(e.phien_sac && e.chinh_sach && e.cach_tinh && e.telemetry_lien_quan),
      'có đủ: số phiên · ngưỡng của đúng version · telemetry · cách tính',
    );
  }

  const thongBao = await docThongBaoViPham(pool, xeId);
  ghiTieuChi(
    'F-B5',
    'cảnh báo nêu rõ hành vi & cách khắc phục',
    thongBao !== null && thongBao.body.includes('Lần sau'),
    thongBao ? `gửi cho ${thongBao.soNguoi} người · "${cat(thongBao.title, 46)}"` : 'KHÔNG có',
  );
  if (thongBao) {
    console.log(`     hành vi   : ${cat(thongBao.body.split('. ')[0] ?? '', 68)}`);
    console.log(`     khắc phục : ${cat(String(thongBao.khacPhuc), 68)}`);
  }

  // ---- BƯỚC 7 — F-B1: version cũ vẫn còn ----------------------------------------------
  tieuDe(7, 'Đổi chính sách SAU khi đã kết luận — version cũ phải còn nguyên (F-B1)');
  await banHanhChinhSach(pool, {
    code: CAU_HINH.maChinhSach,
    version: 2,
    doiId,
    khungGio: null, // v2 BỎ ràng buộc khung giờ
    socMax: 80,
    hieuLucTu: new Date(batDauDemo.getTime() + 60_000),
    supersedesId: v1.id,
    ghiChu: 'Nới khung giờ theo phụ lục hợp đồng (dữ liệu GIẢ)',
  });
  const vanLaV1 = await chinhSachHieuLuc(pool, xeId, phien.started_at);
  const bayGioLaV2 = await chinhSachHieuLuc(pool, xeId, new Date(batDauDemo.getTime() + 120_000));
  ghiTieuChi(
    'F-B1',
    'phiên quá khứ vẫn đối chiếu theo version lúc sạc',
    vanLaV1?.version === 1 && bayGioLaV2?.version === 2,
    `phiên lúc ${gioHienTai} → v${vanLaV1?.version} · từ phút sau → v${bayGioLaV2?.version}`,
  );

  const suaDuoc = await thuSuaBangBatBien(pool, phien.id, vp?.id ?? null);
  ghiTieuChi(
    'NF-11',
    'DB từ chối sửa phiên sạc & vi phạm',
    !suaDuoc.phienSuaDuoc && !suaDuoc.viPhamSuaDuoc,
    `phiên sạc: ${suaDuoc.phienSuaDuoc ? 'SỬA ĐƯỢC ✖' : 'bị chặn'} · ` +
      `vi phạm: ${suaDuoc.viPhamSuaDuoc ? 'SỬA ĐƯỢC ✖' : 'bị chặn'}`,
  );

  // ---- BƯỚC 8 — F-C6: đối soát 3 chiều -------------------------------------------------
  tieuDe(8, 'Đối soát 3 chiều: trụ ↔ xe ↔ thanh toán (F-C6, NF-10)');
  const doiSoat = await chayDoiSoat(
    pool,
    { ...config.reconcile, log: () => {} },
    { tuNgay: batDauDemo.toISOString() },
  );
  const kq = doiSoat.ket_qua.find((k) => k.session_id === phien.id);
  if (kq) {
    bang(
      [
        { ten: 'Chiều đo', rong: 32 },
        { ten: 'kWh', rong: 12, phai: true },
        { ten: 'Lệch so với trụ', rong: 18, phai: true },
      ],
      [
        ['Trụ (công tơ OCPP) — chuẩn', soVn(kq.kwh_tru), '—'],
        ['Xe (ΔSOC × dung lượng pin)', soVn(kq.kwh_xe), `${soVn(kq.lech_xe_pct, 3)} %`],
        ['Thanh toán (tiền ÷ đơn giá)', soVn(kq.kwh_thanh_toan), `${soVn(kq.lech_tien_pct, 3)} %`],
      ],
    );
  }
  ghiTieuChi(
    'NF-10',
    `đối soát 3 chiều khớp (ngưỡng ${config.reconcile.nguongPct}%)`,
    kq?.status === 'khop',
    kq
      ? `lệch lớn nhất ${soVn(kq.lech_max_pct, 3)}% · kết luận "${kq.status}"`
      : 'KHÔNG có kết quả đối soát',
  );

  // ---- BƯỚC 9 — Báo cáo ----------------------------------------------------------------
  tieuDe(9, 'Báo cáo sản lượng & báo cáo lệch theo ngày (F-C6)');
  const sanLuong = await sanLuongTheoKhach(pool, { tuNgay: batDauDemo.toISOString() });
  bang(
    [
      { ten: 'Khách hàng', rong: 34 },
      { ten: 'Phiên', rong: 6, phai: true },
      { ten: 'kWh', rong: 11, phai: true },
      { ten: 'Thành tiền', rong: 16, phai: true },
    ],
    sanLuong.theo_khach.map((d) => [
      d.ten_khach ?? '(chưa gán đội)',
      String(d.so_phien),
      soVn(d.kwh),
      tienVn(d.so_tien_vnd),
    ]),
  );

  const lechNgay = await baoCaoLechTheoNgay(pool, {
    tuNgay: batDauDemo.toISOString(),
    nguongPct: config.reconcile.nguongPct,
  });
  bang(
    [
      { ten: 'Ngày', rong: 12 },
      { ten: 'Phiên', rong: 6, phai: true },
      { ten: 'Khớp', rong: 6, phai: true },
      { ten: 'Lệch', rong: 6, phai: true },
      { ten: 'Lệch tổng ngày', rong: 15, phai: true },
      { ten: 'Cần xem lại', rong: 12 },
    ],
    lechNgay.map((d) => [
      d.ngay,
      String(d.so_phien),
      String(d.khop),
      String(d.lech),
      `${soVn(d.lech_tong_pct, 3)} %`,
      d.can_xem_lai ? 'CÓ' : 'không',
    ]),
  );
  ghiTieuChi(
    'F-C6',
    'báo cáo sản lượng & lệch theo ngày',
    sanLuong.tong_phien > 0 && lechNgay.length > 0,
    `${sanLuong.tong_phien} phiên · ${soVn(sanLuong.tong_kwh)} kWh · ` +
      `${tienVn(sanLuong.tong_tien_vnd)} · ${lechNgay.filter((d) => d.can_xem_lai).length} ngày cần xem lại`,
  );

  // ---- TỔNG KẾT ------------------------------------------------------------------------
  tieuDe(10, 'Tổng kết nghiệm thu tuần 8');
  bang(
    [
      { ten: 'Mã', rong: 7 },
      { ten: 'Tiêu chí', rong: 42 },
      { ten: 'Kết quả', rong: 10 },
    ],
    tieuChi.map((t) => [t.ma, t.ten, t.dat ? 'ĐẠT' : 'CHƯA ĐẠT']),
  );

  const soDat = tieuChi.filter((t) => t.dat).length;
  const tatCaDat = soDat === tieuChi.length;
  khung([
    tatCaDat
      ? `NGHIỆM THU TUẦN 8: ĐẠT ${soDat}/${tieuChi.length} tiêu chí`
      : `NGHIỆM THU TUẦN 8: ${soDat}/${tieuChi.length} tiêu chí — CÓ MỤC CHƯA ĐẠT`,
    '',
    `Xe ${VIN} sạc lúc ${gioHienTai} (ngoài khung ${moTaKhungGio([khungGio])}),`,
    `thu ${tienVn(giaoDich.amount_vnd)} qua cổng sandbox.`,
    '',
    'Đối soát 3 chiều (ngưỡng NF-10 là 1%):',
    `  · chiều THANH TOÁN lệch ${soVn(kq?.lech_tien_pct, 3)}% so với công tơ trụ`,
    `  · chiều XE lệch ${soVn(kq?.lech_xe_pct, 3)}% — sai số lượng tử hoá SOC của BMS,`,
    '    không phải sai lệch sản lượng (SOC báo 2 chữ số thập phân).',
    '',
    'Hồ sơ vi phạm + bằng chứng: GET /violations/{id}',
    `Tài liệu API: http://localhost:${config.port}/docs`,
    '',
    'CÒN MỞ (chưa quyết): Q4 chế tài vi phạm · D-01 app tài xế ·',
    'Q3/Q9 đơn giá điện & hoá đơn — đơn giá đang dùng là GIÁ GIẢ.',
  ]);

  buoc('API vẫn chạy để trình bày thêm. Ctrl+C để tắt sạch.');
  if (!tatCaDat) process.exitCode = 1;
  await new Promise(() => {
    /* giữ tiến trình sống cho phần hỏi đáp */
  });
}

// ---- Tiện ích -------------------------------------------------------------------------

function taoXe(argv: string[]): FleetSimulator {
  const cfg = parseSimArgs(argv, process.env);
  return new FleetSimulator(
    cfg,
    (clientId, will) => new MqttTelemetryPublisher(cfg.mqttUrl, clientId, will),
  );
}

function cat(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function ngayVn(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('vi-VN');
}

async function layIdXe(db: pg.Pool, vin: string): Promise<string> {
  const res = await db.query<{ id: string }>(`SELECT id FROM vehicles WHERE vin = $1`, [vin]);
  const id = res.rows[0]?.id;
  if (!id) throw new Error(`Không tìm thấy xe ${vin} — chạy npm run db:seed trước`);
  return id;
}

async function layDoiCuaXe(db: pg.Pool, vehicleId: string): Promise<string> {
  const res = await db.query<{ customer_id: string }>(
    `SELECT customer_id FROM vehicles WHERE id = $1`,
    [vehicleId],
  );
  const id = res.rows[0]?.customer_id;
  if (!id) throw new Error('Xe demo chưa gán đội xe');
  return id;
}

/**
 * Dọn dấu vết của các lần chạy demo TRƯỚC trên DB dev.
 * Bảng append-only phải tắt trigger để dọn — đúng cách mà test world làm, và chỉ ở đây.
 */
async function donDepDemoCu(db: pg.Client): Promise<void> {
  await db.query(`DELETE FROM payment_transactions WHERE reference LIKE 'G3%'`);
  await db.query(`ALTER TABLE violations DISABLE TRIGGER violations_append_only`);
  await db.query(
    `DELETE FROM violations WHERE policy_id IN (SELECT id FROM charging_policies WHERE code = $1)`,
    [CAU_HINH.maChinhSach],
  );
  await db.query(`ALTER TABLE violations ENABLE TRIGGER violations_append_only`);
  await db.query(
    `DELETE FROM violation_checks WHERE policy_id IN (SELECT id FROM charging_policies WHERE code = $1)`,
    [CAU_HINH.maChinhSach],
  );
  await db.query(`ALTER TABLE charging_policies DISABLE TRIGGER charging_policies_khong_sua_de`);
  await db.query(`DELETE FROM charging_policies WHERE code = $1`, [CAU_HINH.maChinhSach]);
  await db.query(`ALTER TABLE charging_policies ENABLE TRIGGER charging_policies_khong_sua_de`);
  // notifications trỏ tới alerts → phải xoá TRƯỚC. Lần chạy demo ĐẦU TIÊN không lộ ra lỗi
  // này vì chưa có thông báo nào để dọn; chỉ lần chạy thứ hai mới đâm vào khoá ngoại.
  await db.query(
    `DELETE FROM notifications
     WHERE alert_id IN (SELECT id FROM alerts WHERE dedup_key LIKE 'F-B5:%')`,
  );
  await db.query(`DELETE FROM alerts WHERE dedup_key LIKE 'F-B5:%'`);
}

interface ChinhSachMoi {
  code: string;
  version: number;
  doiId: string;
  khungGio: { from: string; to: string } | null;
  socMax: number;
  hieuLucTu: Date;
  supersedesId?: string;
  ghiChu: string;
}

async function banHanhChinhSach(
  db: pg.Pool,
  p: ChinhSachMoi,
): Promise<{ id: string; effective_from: string }> {
  const res = await db.query<{ id: string; effective_from: Date }>(
    `INSERT INTO charging_policies
       (code, version, name, scope_type, customer_id, soc_min_pct, soc_max_pct, allowed_hours,
        max_power_kw, effective_from, change_note, supersedes_id)
     VALUES ($1, $2, $3, 'fleet', $4, 20, $5, $6::jsonb, 150, $7, $8, $9)
     RETURNING id, effective_from`,
    [
      p.code,
      p.version,
      `Bảo hành đội xe — nghiệm thu tuần 8 (v${p.version})`,
      p.doiId,
      p.socMax,
      p.khungGio ? JSON.stringify([p.khungGio]) : null,
      p.hieuLucTu.toISOString(),
      p.ghiChu,
      p.supersedesId ?? null,
    ],
  );
  return {
    id: res.rows[0]!.id,
    effective_from: res.rows[0]!.effective_from.toISOString(),
  };
}

interface PhienDemo {
  id: string;
  energy_kwh: number;
  giay: number;
  ma_tram: string;
  started_at: Date;
}

async function docPhienMoiNhat(
  db: pg.Pool,
  vehicleId: string,
  tu: Date,
): Promise<PhienDemo | null> {
  const res = await db.query(
    `SELECT cs.id, cs.energy_kwh::float8 AS energy_kwh, cs.started_at,
            EXTRACT(EPOCH FROM (cs.ended_at - cs.started_at))::float8 AS giay,
            st.code AS ma_tram
     FROM charging_sessions cs
     JOIN charging_stations st ON st.id = cs.station_id
     WHERE cs.vehicle_id = $1 AND cs.ended_at IS NOT NULL AND cs.started_at >= $2
     ORDER BY cs.started_at DESC LIMIT 1`,
    [vehicleId, tu.toISOString()],
  );
  const r = res.rows[0];
  return r ? (r as unknown as PhienDemo) : null;
}

async function demGiaoDichThanhCong(
  db: pg.Pool,
  sessionId: string,
): Promise<{ so: number; tong: number }> {
  const res = await db.query(
    `SELECT count(*)::int AS so, coalesce(sum(amount_vnd), 0)::float8 AS tong
     FROM payment_transactions WHERE session_id = $1 AND status = 'succeeded'`,
    [sessionId],
  );
  return { so: res.rows[0]!.so as number, tong: res.rows[0]!.tong as number };
}

interface ViPhamDemo {
  id: string;
  type: string;
  risk_level: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  evidence: any;
}

async function docViPham(db: pg.Pool, sessionId: string): Promise<ViPhamDemo[]> {
  const res = await db.query(
    `SELECT id, type::text AS type, risk_level::text AS risk_level, evidence
     FROM violations WHERE session_id = $1 ORDER BY detected_at`,
    [sessionId],
  );
  return res.rows as unknown as ViPhamDemo[];
}

async function docThongBaoViPham(
  db: pg.Pool,
  vehicleId: string,
): Promise<{ title: string; body: string; khacPhuc: unknown; soNguoi: number } | null> {
  const res = await db.query(
    `SELECT n.title, n.body, n.data, count(*) OVER ()::int AS tong
     FROM notifications n
     JOIN alerts a ON a.id = n.alert_id
     WHERE a.vehicle_id = $1 AND n.alert_type = 'charging_violation'
     ORDER BY n.created_at DESC`,
    [vehicleId],
  );
  const r = res.rows[0];
  if (!r) return null;
  const nguoi = await db.query(
    `SELECT count(DISTINCT n.user_id)::int AS n
     FROM notifications n JOIN alerts a ON a.id = n.alert_id
     WHERE a.vehicle_id = $1 AND n.alert_type = 'charging_violation'`,
    [vehicleId],
  );
  return {
    title: r.title as string,
    body: r.body as string,
    khacPhuc: (r.data as { khac_phuc?: unknown } | null)?.khac_phuc ?? '—',
    soNguoi: nguoi.rows[0]!.n as number,
  };
}

/** Thử sửa hai bảng bất biến. Trả về true nếu SỬA ĐƯỢC — tức là hàng rào NF-11 đã hỏng. */
async function thuSuaBangBatBien(
  db: pg.Pool,
  sessionId: string,
  violationId: string | null,
): Promise<{ phienSuaDuoc: boolean; viPhamSuaDuoc: boolean }> {
  let phienSuaDuoc = false;
  let viPhamSuaDuoc = false;
  try {
    await db.query(`UPDATE charging_sessions SET energy_kwh = 1 WHERE id = $1`, [sessionId]);
    phienSuaDuoc = true;
  } catch {
    /* đúng như mong đợi: trigger chặn */
  }
  if (violationId) {
    try {
      await db.query(`UPDATE violations SET evidence = '{}'::jsonb WHERE id = $1`, [violationId]);
      viPhamSuaDuoc = true;
    } catch {
      /* đúng như mong đợi */
    }
  }
  return { phienSuaDuoc, viPhamSuaDuoc };
}

main().catch((err: unknown) => {
  console.error(`\n  ✖ Nghiệm thu dừng vì lỗi: ${moTaLoi(err)}\n`);
  void tatSach(1);
});
