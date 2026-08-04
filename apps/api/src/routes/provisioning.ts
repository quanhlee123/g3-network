// F-F2 — Kích hoạt thiết bị theo VIN khi bàn giao xe.
//
// Hành trình 1 bước 1 (sheet 2): nhân viên G3 kích hoạt tại chỗ, đo bằng "% kích hoạt
// thành công tại chỗ (mục tiêu ≥98%)". Bốn bước, mỗi bước để lại BẰNG CHỨNG trong
// provisioning_sessions (migration 0028):
//
//   1. chon_xe       — quét/nhập VIN
//   2. gan_thiet_bi  — gán device_id cho xe
//   3. consent       — tài xế đồng ý xử lý dữ liệu cá nhân (⚠️ Q7 MỞ, xem consent_documents)
//   4. cho_telemetry — xác nhận dữ liệu ĐANG VỀ THẬT, chờ tối đa 60 giây
//
// Bước 4 là bước hay bị làm dối nhất: dễ nhất là gán thiết bị xong báo "xong". Nhưng
// "% kích hoạt thành công" chỉ có nghĩa nếu nó đo được việc dữ liệu THẬT SỰ chảy về —
// nên bằng chứng bắt buộc là một bản ghi telemetry sinh SAU khi phiên bắt đầu.
import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { requireScopedAuth } from '../auth/guard';
import type { Queryable } from '../db';
import { AUTH_ERROR_RESPONSES, ErrorSchema, sendError } from '../errors';

export interface ProvisioningRoutesDeps {
  db: Queryable;
}

/** Trần thời gian chờ telemetry (Hành trình 1: kích hoạt tại chỗ, không bắt khách đợi lâu). */
export const CHO_TELEMETRY_TOI_DA_GIAY = 60;

const NullableString = Type.Union([Type.String(), Type.Null()]);
const IdParams = Type.Object({ id: Type.String({ format: 'uuid' }) });

const PhienSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  vehicle_id: Type.String({ format: 'uuid' }),
  vin: Type.String(),
  model: Type.String(),
  customer_name: Type.String(),
  device_id: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  device_serial: NullableString,
  status: Type.String(),
  buoc: Type.String(),
  consent_version: NullableString,
  consent_at: NullableString,
  consent_driver_id: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  consent_driver_name: NullableString,
  telemetry_ok_at: NullableString,
  cho_telemetry_giay: Type.Union([Type.Integer(), Type.Null()]),
  ly_do_that_bai: NullableString,
  thuc_hien_boi_ten: Type.String(),
  bat_dau_at: Type.String({ format: 'date-time' }),
  ket_thuc_at: NullableString,
});

/** Câu SELECT dùng chung — mọi endpoint trả về cùng một hình dạng phiên. */
const CHON_PHIEN = `
  SELECT p.id, p.vehicle_id, v.vin, v.model::text AS model, c.name AS customer_name,
         p.device_id, d.device_serial, p.status::text AS status, p.buoc::text AS buoc,
         p.consent_version, p.consent_at, p.consent_driver_id,
         du.full_name AS consent_driver_name,
         p.telemetry_ok_at, p.cho_telemetry_giay, p.ly_do_that_bai,
         nv.full_name AS thuc_hien_boi_ten,
         p.bat_dau_at, p.ket_thuc_at
  FROM provisioning_sessions p
  JOIN vehicles v ON v.id = p.vehicle_id
  JOIN customers c ON c.id = v.customer_id
  JOIN users nv ON nv.id = p.thuc_hien_boi
  LEFT JOIN devices d ON d.id = p.device_id
  LEFT JOIN drivers dr ON dr.id = p.consent_driver_id
  LEFT JOIN users du ON du.id = dr.user_id`;

function raPhien(row: Record<string, unknown>): Record<string, unknown> {
  const iso = (v: unknown): string | null => (v instanceof Date ? v.toISOString() : null);
  return {
    ...row,
    consent_at: iso(row.consent_at),
    telemetry_ok_at: iso(row.telemetry_ok_at),
    bat_dau_at: (row.bat_dau_at as Date).toISOString(),
    ket_thuc_at: iso(row.ket_thuc_at),
  };
}

export async function provisioningRoutes(
  app: FastifyInstance,
  deps: ProvisioningRoutesDeps,
): Promise<void> {
  const { db } = deps;

  /** Lấy phiên còn ĐANG LÀM; trả null nếu không có hoặc đã kết thúc. */
  async function phienDangLam(id: string): Promise<Record<string, unknown> | null> {
    const res = await db.query(`SELECT * FROM provisioning_sessions WHERE id = $1`, [id]);
    return res.rows[0] ?? null;
  }

  async function traPhien(id: string): Promise<Record<string, unknown>> {
    const res = await db.query(`${CHON_PHIEN} WHERE p.id = $1`, [id]);
    return raPhien(res.rows[0]!);
  }

  // ---- Văn bản đồng ý đang hiệu lực ---------------------------------------------------
  app.get(
    '/provisioning/consent',
    {
      config: { permission: 'provisioning.manage' },
      schema: {
        tags: ['kich-hoat'],
        summary: 'Văn bản đồng ý xử lý dữ liệu cá nhân đang dùng (F-F2)',
        description:
          'Ưu tiên bản CHÍNH THỨC (la_ban_nhap = false) mới nhất; chưa có thì trả bản nháp. ' +
          '⚠️ Q7 đang MỞ nên Phase 1 chỉ có bản nháp — `la_ban_nhap = true` nghĩa là chữ ký ' +
          'thu theo bản này KHÔNG có giá trị pháp lý và phải thu lại trước pilot.',
        response: {
          200: Type.Object({
            version: Type.String(),
            tieu_de: Type.String(),
            noi_dung: Type.String(),
            la_ban_nhap: Type.Boolean(),
          }),
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async () => {
      const res = await db.query(
        `SELECT version, tieu_de, noi_dung, la_ban_nhap FROM consent_documents
         ORDER BY la_ban_nhap ASC, created_at DESC LIMIT 1`,
      );
      return res.rows[0];
    },
  );

  // ---- Tài xế có thể nhận xe này -------------------------------------------------------
  app.get(
    '/provisioning/:id/tai-xe',
    {
      config: { permission: 'provisioning.manage' },
      schema: {
        tags: ['kich-hoat'],
        summary: 'Tài xế có thể được giao xe của phiên này (F-F2 bước 3)',
        description:
          'Chỉ tài xế thuộc CÙNG đội xe với xe đang bàn giao. Cho chọn tài xế của công ty ' +
          'khác là gán sai chủ thể dữ liệu ngay từ lúc ký consent (Nghị định 13/2023).',
        params: IdParams,
        response: {
          200: Type.Object({
            total: Type.Integer(),
            items: Type.Array(
              Type.Object({
                driver_id: Type.String({ format: 'uuid' }),
                full_name: Type.String(),
                phone: NullableString,
                consent_version: NullableString,
              }),
            ),
          }),
          404: ErrorSchema,
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const phien = await phienDangLam(id);
      if (!phien) return khongTimThayPhien(reply);

      const res = await db.query(
        `SELECT d.id AS driver_id, u.full_name, d.phone, d.consent_version
         FROM drivers d
         JOIN users u ON u.id = d.user_id
         WHERE u.customer_id = (SELECT customer_id FROM vehicles WHERE id = $1)
         ORDER BY u.full_name`,
        [phien.vehicle_id],
      );
      return { total: res.rows.length, items: res.rows };
    },
  );

  // ---- Bước 1: bắt đầu theo VIN --------------------------------------------------------
  app.post(
    '/provisioning',
    {
      config: { permission: 'provisioning.manage' },
      schema: {
        tags: ['kich-hoat'],
        summary: 'Bắt đầu kích hoạt xe theo VIN (F-F2 bước 1)',
        description:
          'VIN có thể nhập tay hoặc quét từ mã vạch. Mỗi xe chỉ được có MỘT phiên đang làm ' +
          'dở tại một thời điểm (unique index của migration 0028): hai nhân viên cùng kích ' +
          'hoạt một xe sẽ giẫm lên device_id của nhau và KPI đếm trùng.',
        body: Type.Object({ vin: Type.String({ minLength: 3, maxLength: 64 }) }),
        response: { 201: PhienSchema, 404: ErrorSchema, 409: ErrorSchema, ...AUTH_ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const auth = requireScopedAuth(request);
      const { vin } = request.body as { vin: string };

      const xe = await db.query(`SELECT id FROM vehicles WHERE vin = $1`, [vin.trim()]);
      if ((xe.rowCount ?? 0) === 0) {
        return sendError(
          reply,
          404,
          'khong_tim_thay_vin',
          `Không có xe nào mang VIN "${vin.trim()}". Kiểm tra lại mã trên khung xe.`,
        );
      }
      const vehicleId = xe.rows[0]!.id as string;

      const dangLam = await db.query(
        `SELECT id FROM provisioning_sessions WHERE vehicle_id = $1 AND status = 'dang_lam'`,
        [vehicleId],
      );
      if ((dangLam.rowCount ?? 0) > 0) {
        return sendError(
          reply,
          409,
          'xe_dang_duoc_kich_hoat',
          'Xe này đang có một phiên kích hoạt dở. Mở tiếp phiên đó hoặc huỷ trước khi làm lại.',
        );
      }

      const tao = await db.query(
        `INSERT INTO provisioning_sessions (vehicle_id, thuc_hien_boi) VALUES ($1, $2) RETURNING id`,
        [vehicleId, auth.userId],
      );
      return reply.status(201).send(await traPhien(tao.rows[0]!.id as string));
    },
  );

  // ---- Bước 2: gán thiết bị ------------------------------------------------------------
  app.post(
    '/provisioning/:id/thiet-bi',
    {
      config: { permission: 'provisioning.manage' },
      schema: {
        tags: ['kich-hoat'],
        summary: 'Gán thiết bị telematics cho xe (F-F2 bước 2)',
        description:
          'Nhận số sê-ri trên tem thiết bị. Thiết bị chưa có trong hệ thống thì tạo mới; ' +
          'đã có thì gắn vào xe. Thiết bị đang gắn xe KHÁC bị từ chối — một thiết bị chỉ ' +
          'thuộc một xe (UNIQUE devices.vehicle_id, migration 0001).',
        params: IdParams,
        body: Type.Object({
          device_serial: Type.String({ minLength: 3, maxLength: 64 }),
          firmware_version: Type.Optional(Type.String({ maxLength: 64 })),
          sim_iccid: Type.Optional(Type.String({ maxLength: 32, description: 'ICCID GIẢ' })),
        }),
        response: { 200: PhienSchema, 404: ErrorSchema, 409: ErrorSchema, ...AUTH_ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as {
        device_serial: string;
        firmware_version?: string;
        sim_iccid?: string;
      };

      const phien = await phienDangLam(id);
      if (!phien) return khongTimThayPhien(reply);
      if (phien.status !== 'dang_lam') return phienDaKetThuc(reply);

      const serial = body.device_serial.trim();
      const co = await db.query(`SELECT id, vehicle_id FROM devices WHERE device_serial = $1`, [
        serial,
      ]);
      const daCo = co.rows[0];

      if (daCo && daCo.vehicle_id !== null && daCo.vehicle_id !== phien.vehicle_id) {
        return sendError(
          reply,
          409,
          'thiet_bi_da_gan_xe_khac',
          `Thiết bị "${serial}" đang gắn cho xe khác. Gỡ khỏi xe cũ trước khi gán lại.`,
        );
      }

      let deviceId: string;
      if (daCo) {
        await db.query(
          `UPDATE devices SET vehicle_id = $2,
                  firmware_version = COALESCE($3, firmware_version),
                  sim_iccid = COALESCE($4, sim_iccid)
           WHERE id = $1`,
          [daCo.id, phien.vehicle_id, body.firmware_version ?? null, body.sim_iccid ?? null],
        );
        deviceId = daCo.id as string;
      } else {
        const moi = await db.query(
          `INSERT INTO devices (device_serial, vehicle_id, firmware_version, sim_iccid)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [serial, phien.vehicle_id, body.firmware_version ?? null, body.sim_iccid ?? null],
        );
        deviceId = moi.rows[0]!.id as string;
      }

      await db.query(
        `UPDATE provisioning_sessions SET device_id = $2, buoc = 'gan_thiet_bi' WHERE id = $1`,
        [id, deviceId],
      );
      return traPhien(id);
    },
  );

  // ---- Bước 3: consent tài xế ----------------------------------------------------------
  app.post(
    '/provisioning/:id/consent',
    {
      config: { permission: 'provisioning.manage' },
      schema: {
        tags: ['kich-hoat'],
        summary: 'Ghi nhận tài xế đồng ý xử lý dữ liệu cá nhân (F-F2 bước 3)',
        description:
          'Ghi vào HAI chỗ: provisioning_sessions (bằng chứng của lần bàn giao này) và ' +
          'drivers.consent_at/consent_version (trạng thái hiện tại của tài xế).\n\n' +
          '⚠️ Q7 ĐANG MỞ — văn bản hiện tại là BẢN NHÁP. Phản hồi luôn kèm `canh_bao_phap_ly` ' +
          'khi ký theo bản nháp để không ai nhầm là đã đủ căn cứ pháp lý.',
        params: IdParams,
        body: Type.Object({
          driver_id: Type.String({ format: 'uuid', description: 'Tài xế được giao xe' }),
          consent_version: Type.String({ maxLength: 64 }),
        }),
        response: {
          200: Type.Object({
            phien: PhienSchema,
            canh_bao_phap_ly: NullableString,
          }),
          400: ErrorSchema,
          404: ErrorSchema,
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as { driver_id: string; consent_version: string };

      const phien = await phienDangLam(id);
      if (!phien) return khongTimThayPhien(reply);
      if (phien.status !== 'dang_lam') return phienDaKetThuc(reply);

      const vb = await db.query(
        `SELECT version, la_ban_nhap FROM consent_documents WHERE version = $1`,
        [body.consent_version],
      );
      if ((vb.rowCount ?? 0) === 0) {
        return sendError(
          reply,
          400,
          'khong_co_ban_consent',
          `Không có văn bản đồng ý phiên bản "${body.consent_version}".`,
        );
      }

      const tx = await db.query(`SELECT id FROM drivers WHERE id = $1`, [body.driver_id]);
      if ((tx.rowCount ?? 0) === 0) {
        return sendError(reply, 400, 'khong_tim_thay_tai_xe', 'Không tìm thấy tài xế.');
      }

      await db.query(
        `UPDATE provisioning_sessions
         SET consent_driver_id = $2, consent_version = $3, consent_at = now(), buoc = 'consent'
         WHERE id = $1`,
        [id, body.driver_id, body.consent_version],
      );
      // Trạng thái consent hiện tại của tài xế (migration 0001).
      await db.query(`UPDATE drivers SET consent_at = now(), consent_version = $2 WHERE id = $1`, [
        body.driver_id,
        body.consent_version,
      ]);

      return {
        phien: await traPhien(id),
        canh_bao_phap_ly:
          vb.rows[0]!.la_ban_nhap === true
            ? 'Đây là BẢN NHÁP văn bản đồng ý (Q7 chưa chốt). Chữ ký thu theo bản này CHƯA có ' +
              'giá trị pháp lý — phải thu lại bằng bản chính thức của Legal trước pilot.'
            : null,
      };
    },
  );

  // ---- Bước 4: xác nhận telemetry đang về ----------------------------------------------
  app.get(
    '/provisioning/:id/telemetry',
    {
      config: { permission: 'provisioning.manage' },
      schema: {
        tags: ['kich-hoat'],
        summary: 'Kiểm tra dữ liệu telemetry đã về chưa (F-F2 bước 4)',
        description:
          'Trả NGAY, không chờ — màn hình tự gọi lại vài giây một lần cho tới khi `da_ve` ' +
          `hoặc quá ${String(CHO_TELEMETRY_TOI_DA_GIAY)} giây. ` +
          'Bằng chứng phải là bản ghi sinh SAU khi phiên bắt đầu: xe đã từng chạy trước đó ' +
          'vẫn còn dữ liệu cũ trong bảng, tính cả dữ liệu đó thì tick xanh là tick giả.',
        params: IdParams,
        response: {
          200: Type.Object({
            da_ve: Type.Boolean(),
            cho_giay: Type.Integer({ description: 'Đã chờ bao lâu kể từ lúc bắt đầu phiên' }),
            qua_han: Type.Boolean({
              description: `Đã quá ${String(CHO_TELEMETRY_TOI_DA_GIAY)} giây`,
            }),
            ban_ghi_dau_at: NullableString,
          }),
          404: ErrorSchema,
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const phien = await phienDangLam(id);
      if (!phien) return khongTimThayPhien(reply);

      // Đã xác nhận rồi thì giữ nguyên bằng chứng cũ, không đo lại.
      if (phien.telemetry_ok_at !== null) {
        return {
          da_ve: true,
          cho_giay: (phien.cho_telemetry_giay as number | null) ?? 0,
          qua_han: false,
          ban_ghi_dau_at: (phien.telemetry_ok_at as Date).toISOString(),
        };
      }

      // ⚠️ MỌI PHÉP TRỪ THỜI GIAN Ở ĐÂY PHẢI LÀM TRONG SQL, không dùng Date.now().
      //
      // Bắt được khi chạy thật: `bat_dau_at` do PostgreSQL sinh (DEFAULT now()), còn
      // Date.now() là đồng hồ của tiến trình Node. Hai đồng hồ này KHÔNG bảo đảm khớp —
      // trên máy dev container g3-db từng lệch tới ~4 giờ so với host sau khi máy ngủ, và
      // "chờ 14776 giây" được ghi vào cho_telemetry_giay cho một phiên vừa mở 2 phút.
      // Con số đó là đầu vào của KPI, sai nó là sai cả báo cáo.
      // Cùng cách làm với im_lang_giay của routes/devices.ts.
      const tm = await db.query(
        `SELECT t.time,
                floor(EXTRACT(EPOCH FROM (now() - p.bat_dau_at)))::int AS cho_giay
         FROM provisioning_sessions p
         LEFT JOIN LATERAL (
           SELECT time FROM telematics_readings tr
           WHERE tr.vehicle_id = p.vehicle_id AND tr.time >= p.bat_dau_at
           ORDER BY tr.time ASC LIMIT 1
         ) t ON true
         WHERE p.id = $1`,
        [id],
      );
      const dong = tm.rows[0]!;
      const choGiay = Math.max(0, dong.cho_giay as number);

      if (dong.time === null) {
        return {
          da_ve: false,
          cho_giay: choGiay,
          qua_han: choGiay > CHO_TELEMETRY_TOI_DA_GIAY,
          ban_ghi_dau_at: null,
        };
      }

      await db.query(
        `UPDATE provisioning_sessions
         SET telemetry_ok_at = $2, cho_telemetry_giay = $3, buoc = 'cho_telemetry'
         WHERE id = $1`,
        [id, (dong.time as Date).toISOString(), choGiay],
      );
      return {
        da_ve: true,
        cho_giay: choGiay,
        qua_han: false,
        ban_ghi_dau_at: (dong.time as Date).toISOString(),
      };
    },
  );

  // ---- Hoàn tất ------------------------------------------------------------------------
  app.post(
    '/provisioning/:id/hoan-tat',
    {
      config: { permission: 'provisioning.manage' },
      schema: {
        tags: ['kich-hoat'],
        summary: 'Chốt phiên kích hoạt là THÀNH CÔNG (F-F2)',
        description:
          'Chỉ chốt được khi có ĐỦ ba bằng chứng: đã gán thiết bị, tài xế đã đồng ý, và ' +
          'telemetry đã về thật. Ràng buộc này cũng được ép ở tầng DB ' +
          '(provisioning_thanh_cong_du_bang_chung, migration 0028) — không có đường tắt.',
        params: IdParams,
        response: { 200: PhienSchema, 400: ErrorSchema, 404: ErrorSchema, ...AUTH_ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const phien = await phienDangLam(id);
      if (!phien) return khongTimThayPhien(reply);
      if (phien.status !== 'dang_lam') return phienDaKetThuc(reply);

      const thieu: string[] = [];
      if (phien.device_id === null) thieu.push('chưa gán thiết bị');
      if (phien.consent_at === null) thieu.push('tài xế chưa đồng ý xử lý dữ liệu');
      if (phien.telemetry_ok_at === null) thieu.push('chưa nhận được dữ liệu telemetry');
      if (thieu.length > 0) {
        return sendError(reply, 400, 'chua_du_dieu_kien', `Chưa chốt được: ${thieu.join(', ')}.`);
      }

      await db.query(
        `UPDATE provisioning_sessions
         SET status = 'thanh_cong', buoc = 'xong', ket_thuc_at = now()
         WHERE id = $1`,
        [id],
      );
      return traPhien(id);
    },
  );

  // ---- Đánh dấu thất bại ---------------------------------------------------------------
  app.post(
    '/provisioning/:id/that-bai',
    {
      config: { permission: 'provisioning.manage' },
      schema: {
        tags: ['kich-hoat'],
        summary: 'Ghi nhận kích hoạt THẤT BẠI kèm lý do (F-F2)',
        description:
          'Bắt buộc có lý do. Đây là mẫu số của KPI ≥98%: lần hỏng không được ghi thì tỷ lệ ' +
          'thành công luôn đẹp và không ai biết quy trình đang hỏng ở đâu.',
        params: IdParams,
        body: Type.Object({
          ly_do: Type.String({ minLength: 5, maxLength: 500 }),
          /** Huỷ = nhân viên chủ động dừng (vd quét nhầm xe) — KHÔNG tính vào mẫu số KPI. */
          la_huy: Type.Optional(Type.Boolean()),
        }),
        response: { 200: PhienSchema, 404: ErrorSchema, ...AUTH_ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as { ly_do: string; la_huy?: boolean };
      const phien = await phienDangLam(id);
      if (!phien) return khongTimThayPhien(reply);
      if (phien.status !== 'dang_lam') return phienDaKetThuc(reply);

      await db.query(
        `UPDATE provisioning_sessions
         SET status = $2::provisioning_status, ly_do_that_bai = $3, ket_thuc_at = now()
         WHERE id = $1`,
        [id, body.la_huy === true ? 'huy' : 'that_bai', body.ly_do],
      );
      return traPhien(id);
    },
  );

  // ---- Chi tiết 1 phiên (dùng cho checklist bàn giao) ----------------------------------
  app.get(
    '/provisioning/:id',
    {
      config: { permission: 'provisioning.manage' },
      schema: {
        tags: ['kich-hoat'],
        summary: 'Chi tiết một phiên kích hoạt (F-F2 — nguồn cho checklist bàn giao)',
        params: IdParams,
        response: { 200: PhienSchema, 404: ErrorSchema, ...AUTH_ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const res = await db.query(`${CHON_PHIEN} WHERE p.id = $1`, [id]);
      if ((res.rowCount ?? 0) === 0) return khongTimThayPhien(reply);
      return raPhien(res.rows[0]!);
    },
  );

  // ---- Danh sách + KPI ------------------------------------------------------------------
  app.get(
    '/provisioning',
    {
      config: { permission: 'provisioning.manage' },
      schema: {
        tags: ['kich-hoat'],
        summary: 'Lịch sử kích hoạt và TỶ LỆ THÀNH CÔNG (F-F2, KPI ≥98%)',
        description:
          'Mẫu số = số phiên đã KẾT THÚC có kết luận (thành công + thất bại). Phiên đang làm ' +
          'dở chưa có kết luận nên không tính; phiên HUỶ (nhân viên quét nhầm xe rồi tự dừng) ' +
          'cũng không tính vì đó không phải lỗi của quy trình kích hoạt.',
        querystring: Type.Object({
          status: Type.Optional(
            Type.Union([
              Type.Literal('dang_lam'),
              Type.Literal('thanh_cong'),
              Type.Literal('that_bai'),
              Type.Literal('huy'),
            ]),
          ),
          from: Type.Optional(Type.String({ format: 'date-time' })),
          to: Type.Optional(Type.String({ format: 'date-time' })),
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 500, default: 50 })),
        }),
        response: {
          200: Type.Object({
            kpi: Type.Object({
              so_thanh_cong: Type.Integer(),
              so_that_bai: Type.Integer(),
              so_dang_lam: Type.Integer(),
              so_huy: Type.Integer(),
              mau_so: Type.Integer({ description: 'thành công + thất bại' }),
              ty_le_pct: Type.Union([Type.Number(), Type.Null()], {
                description: 'null khi chưa có phiên nào kết thúc — KHÔNG phải 0%',
              }),
              dat_muc_tieu: Type.Union([Type.Boolean(), Type.Null()], {
                description: 'So với mục tiêu ≥98% (Hành trình 1 bước 1)',
              }),
            }),
            total: Type.Integer(),
            items: Type.Array(PhienSchema),
          }),
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async (request) => {
      const q = request.query as { status?: string; from?: string; to?: string; limit?: number };

      const params: unknown[] = [];
      const filters: string[] = [];
      if (q.status) {
        params.push(q.status);
        filters.push(`p.status = $${String(params.length)}::provisioning_status`);
      }
      if (q.from) {
        params.push(q.from);
        filters.push(`p.bat_dau_at >= $${String(params.length)}`);
      }
      if (q.to) {
        params.push(q.to);
        filters.push(`p.bat_dau_at <= $${String(params.length)}`);
      }
      const where = filters.length > 0 ? filters.join(' AND ') : 'true';

      // KPI đếm trên TOÀN BỘ khoảng thời gian đã lọc, không phụ thuộc bộ lọc status
      // (lọc status rồi tính tỷ lệ thì luôn ra 100% hoặc 0%).
      const kpiParams: unknown[] = [];
      const kpiFilters: string[] = [];
      if (q.from) {
        kpiParams.push(q.from);
        kpiFilters.push(`bat_dau_at >= $${String(kpiParams.length)}`);
      }
      if (q.to) {
        kpiParams.push(q.to);
        kpiFilters.push(`bat_dau_at <= $${String(kpiParams.length)}`);
      }
      const kpiWhere = kpiFilters.length > 0 ? kpiFilters.join(' AND ') : 'true';

      const dem = await db.query(
        `SELECT status::text AS status, count(*)::int AS n
         FROM provisioning_sessions WHERE ${kpiWhere} GROUP BY status`,
        kpiParams,
      );
      const theo: Record<string, number> = {};
      for (const r of dem.rows) theo[r.status as string] = Number(r.n);

      const soThanhCong = theo.thanh_cong ?? 0;
      const soThatBai = theo.that_bai ?? 0;
      const mauSo = soThanhCong + soThatBai;
      // Chưa có phiên nào kết thúc thì tỷ lệ là KHÔNG XÁC ĐỊNH, không phải 0% —
      // hiện 0% lên bảng KPI sẽ báo động giả ngay ngày đầu triển khai.
      const tyLe = mauSo === 0 ? null : Math.round((soThanhCong / mauSo) * 1000) / 10;

      const res = await db.query(
        `${CHON_PHIEN} WHERE ${where} ORDER BY p.bat_dau_at DESC LIMIT $${String(params.length + 1)}`,
        [...params, q.limit ?? 50],
      );

      return {
        kpi: {
          so_thanh_cong: soThanhCong,
          so_that_bai: soThatBai,
          so_dang_lam: theo.dang_lam ?? 0,
          so_huy: theo.huy ?? 0,
          mau_so: mauSo,
          ty_le_pct: tyLe,
          dat_muc_tieu: tyLe === null ? null : tyLe >= 98,
        },
        total: res.rows.length,
        items: res.rows.map(raPhien),
      };
    },
  );
}

function khongTimThayPhien(reply: Parameters<typeof sendError>[0]) {
  return sendError(reply, 404, 'khong_tim_thay_phien', 'Không tìm thấy phiên kích hoạt.');
}

function phienDaKetThuc(reply: Parameters<typeof sendError>[0]) {
  return sendError(
    reply,
    404,
    'phien_da_ket_thuc',
    'Phiên kích hoạt này đã kết thúc — bắt đầu phiên mới nếu cần làm lại.',
  );
}
