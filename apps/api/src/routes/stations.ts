// F-C1/F-C2 — Danh mục trạm sạc (CRUD) + trạng thái trụ realtime + bản đồ cho app.
//
// RANH GIỚI QUAN TRỌNG giữa hai loại "trạng thái", và nó không được phép mờ:
//   - `charging_stations.status` là QUYẾT ĐỊNH VẬN HÀNH (đưa trạm vào bảo trì, ngừng khai
//     thác) → Vận hành G3 Energy sửa được qua API này.
//   - `connectors.status` là SỰ THẬT VẬT LÝ do trụ báo lên qua StatusNotification OCPP 1.6J
//     (F-C2, NF-02 ≤30s) → KHÔNG có đường ghi từ API, và không được có. Tiêu chí F-C2 là
//     "trạng thái súng chính xác ≥99%"; cho người sửa tay thì con số đó đo cái gì?
import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/guard';
import type { Queryable } from '../db';
import { AUTH_ERROR_RESPONSES, ErrorSchema, sendError } from '../errors';

export interface StationRoutesDeps {
  db: Queryable;
}

const NullableNumber = Type.Union([Type.Number(), Type.Null()]);

const ConnectorSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  ocpp_connector_id: Type.Integer(),
  max_power_kw: Type.Number(),
  standard: Type.String(),
  status: Type.String({ description: 'Available | Charging | Faulted | Unavailable' }),
  updated_at: Type.String({ format: 'date-time' }),
});

const StationSummary = Type.Object({
  id: Type.String({ format: 'uuid' }),
  code: Type.String(),
  name: Type.String(),
  area: Type.Union([Type.String(), Type.Null()]),
  status: Type.String(),
  total_power_kw: NullableNumber,
  connector_standard: Type.String(),
  operating_hours: Type.Union([Type.String(), Type.Null()]),
  lat: Type.Number(),
  lng: Type.Number(),
  connectors_total: Type.Integer(),
  connectors_available: Type.Integer(),
  connectors_charging: Type.Integer(),
  connectors_faulted: Type.Integer(),
  connectors_unavailable: Type.Integer(),
});

/** Cột của một dòng trạm + tổng hợp trạng thái trụ. Tách khỏi FROM để chèn được cột tính thêm. */
const STATION_COLS = `
  s.id, s.code, s.name, s.area, s.status::text AS status,
  s.total_power_kw::float8 AS total_power_kw,
  s.connector_standard, s.operating_hours,
  ST_Y(s.location::geometry)::float8 AS lat,
  ST_X(s.location::geometry)::float8 AS lng,
  count(c.id)::int                                         AS connectors_total,
  count(c.id) FILTER (WHERE c.status = 'Available')::int   AS connectors_available,
  count(c.id) FILTER (WHERE c.status = 'Charging')::int    AS connectors_charging,
  count(c.id) FILTER (WHERE c.status = 'Faulted')::int     AS connectors_faulted,
  count(c.id) FILTER (WHERE c.status = 'Unavailable')::int AS connectors_unavailable`;

const STATION_FROM = `
  FROM charging_stations s
  LEFT JOIN connectors c ON c.station_id = s.id`;

const STATION_SELECT = `SELECT ${STATION_COLS} ${STATION_FROM}`;

export async function stationRoutes(app: FastifyInstance, deps: StationRoutesDeps): Promise<void> {
  const { db } = deps;

  app.get(
    '/stations',
    {
      config: { permission: 'station.read' },
      schema: {
        tags: ['tram-sac'],
        summary: 'Danh sách trạm sạc kèm tổng hợp trạng thái trụ (F-C1, F-C2)',
        querystring: Type.Object({
          area: Type.Optional(Type.String({ description: 'Lọc theo khu vực (khớp một phần)' })),
          co_tru_trong: Type.Optional(
            Type.Boolean({ description: 'Chỉ trạm còn ít nhất 1 trụ Available' }),
          ),
        }),
        response: {
          200: Type.Object({ total: Type.Integer(), items: Type.Array(StationSummary) }),
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async (request) => {
      const q = request.query as { area?: string; co_tru_trong?: boolean };
      const params: unknown[] = [];
      const filters: string[] = [];
      if (q.area) {
        params.push(`%${q.area}%`);
        filters.push(`s.area ILIKE $${params.length}`);
      }
      const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
      const having =
        q.co_tru_trong === true
          ? `HAVING count(c.id) FILTER (WHERE c.status = 'Available') > 0`
          : '';

      const res = await db.query(
        `${STATION_SELECT} ${where} GROUP BY s.id ${having} ORDER BY s.code`,
        params,
      );
      return { total: res.rows.length, items: res.rows };
    },
  );

  app.get(
    '/stations/:id',
    {
      config: { permission: 'station.read' },
      schema: {
        tags: ['tram-sac'],
        summary: 'Chi tiết 1 trạm + trạng thái từng trụ (F-C2)',
        params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
        response: {
          200: Type.Intersect([
            StationSummary,
            Type.Object({ connectors: Type.Array(ConnectorSchema) }),
          ]),
          404: ErrorSchema,
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const res = await db.query(`${STATION_SELECT} WHERE s.id = $1 GROUP BY s.id`, [id]);
      const station = res.rows[0];
      if (!station) {
        return sendError(reply, 404, 'khong_tim_thay_tram', 'Không tìm thấy trạm sạc.');
      }
      const connectors = await db.query(
        `SELECT id, ocpp_connector_id, max_power_kw::float8 AS max_power_kw, standard,
                status::text AS status, updated_at
         FROM connectors WHERE station_id = $1 ORDER BY ocpp_connector_id`,
        [id],
      );
      return {
        ...station,
        connectors: connectors.rows.map((c) => ({
          ...c,
          updated_at: (c.updated_at as Date).toISOString(),
        })),
      };
    },
  );

  // -----------------------------------------------------------------------------------
  // F-C2 — Bản đồ trạm cho app tài xế
  // -----------------------------------------------------------------------------------
  app.get(
    '/stations/map',
    {
      config: { permission: 'station.read' },
      schema: {
        tags: ['tram-sac'],
        summary: 'Bản đồ trạm + trạng thái trụ realtime cho app (F-C1, F-C2)',
        description:
          'Trả trạm kèm toạ độ và số trụ theo từng trạng thái. Truyền `lat`/`lng` để sắp xếp ' +
          'theo khoảng cách và lọc trong bán kính. Chỉ trạm đang khai thác (`active`) trừ khi ' +
          'yêu cầu rõ trạng thái khác — tài xế không cần thấy trạm đang bảo trì trên bản đồ ' +
          'điều hướng.',
        querystring: Type.Object({
          lat: Type.Optional(Type.Number({ minimum: -90, maximum: 90 })),
          lng: Type.Optional(Type.Number({ minimum: -180, maximum: 180 })),
          ban_kinh_km: Type.Optional(
            Type.Number({ exclusiveMinimum: 0, maximum: 500, default: 50 }),
          ),
          chi_con_tru_trong: Type.Optional(Type.Boolean()),
          status: Type.Optional(
            Type.Union([
              Type.Literal('active'),
              Type.Literal('maintenance'),
              Type.Literal('inactive'),
            ]),
          ),
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200, default: 50 })),
        }),
        response: {
          200: Type.Object({
            total: Type.Integer(),
            items: Type.Array(
              Type.Intersect([
                StationSummary,
                Type.Object({ khoang_cach_km: Type.Union([Type.Number(), Type.Null()]) }),
              ]),
            ),
          }),
          400: ErrorSchema,
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async (request, reply) => {
      const q = request.query as {
        lat?: number;
        lng?: number;
        ban_kinh_km?: number;
        chi_con_tru_trong?: boolean;
        status?: string;
        limit?: number;
      };
      if ((q.lat === undefined) !== (q.lng === undefined)) {
        return sendError(
          reply,
          400,
          'thieu_toa_do',
          'Phải truyền CẢ hai tham số lat và lng, hoặc không truyền cái nào.',
        );
      }

      const params: unknown[] = [q.status ?? 'active'];
      let khoangCach = 'NULL::float8';
      let loc = '';
      let sapXep = 's.code';
      if (q.lat !== undefined && q.lng !== undefined) {
        params.push(q.lng, q.lat);
        const diem = `ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography`;
        khoangCach = `(ST_Distance(s.location, ${diem}) / 1000)::float8`;
        params.push((q.ban_kinh_km ?? 50) * 1000);
        loc = ` AND ST_DWithin(s.location, ${diem}, $4)`;
        sapXep = `ST_Distance(s.location, ${diem})`;
      }
      const having =
        q.chi_con_tru_trong === true
          ? `HAVING count(c.id) FILTER (WHERE c.status = 'Available') > 0`
          : '';

      const res = await db.query(
        `SELECT ${STATION_COLS}, ${khoangCach} AS khoang_cach_km
         ${STATION_FROM}
         WHERE s.status = $1::station_status${loc}
         GROUP BY s.id ${having}
         ORDER BY ${sapXep}
         LIMIT $${params.length + 1}`,
        [...params, q.limit ?? 50],
      );
      return { total: res.rows.length, items: res.rows };
    },
  );

  // -----------------------------------------------------------------------------------
  // F-C1 — CRUD danh mục trạm (sheet 9: Vận hành G3 Energy ✓, Admin ✓)
  // -----------------------------------------------------------------------------------
  app.post(
    '/stations',
    {
      config: { permission: 'station.manage' },
      schema: {
        tags: ['tram-sac'],
        summary: 'Thêm trạm sạc mới kèm danh sách trụ (F-C1)',
        description:
          'Mã trạm `code` chính là ChargePoint identity mà trụ dùng để kết nối CSMS ' +
          '(`ws://…/ocpp/{code}`) — đặt sai thì trụ không vào được hệ thống.',
        body: Type.Object({
          code: Type.String({ minLength: 1, maxLength: 64 }),
          name: Type.String({ minLength: 1, maxLength: 200 }),
          lat: Type.Number({ minimum: -90, maximum: 90 }),
          lng: Type.Number({ minimum: -180, maximum: 180 }),
          area: Type.Optional(Type.String({ maxLength: 200 })),
          total_power_kw: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
          connector_standard: Type.Optional(Type.String({ maxLength: 32, default: 'CCS2' })),
          operating_hours: Type.Optional(Type.String({ maxLength: 64 })),
          note: Type.Optional(Type.String({ maxLength: 1000 })),
          connectors: Type.Optional(
            Type.Array(
              Type.Object({
                ocpp_connector_id: Type.Integer({ minimum: 1 }),
                max_power_kw: Type.Number({ exclusiveMinimum: 0 }),
                standard: Type.Optional(Type.String({ maxLength: 32 })),
              }),
              { description: 'Bỏ trống = tạo trạm chưa có trụ, thêm sau bằng POST .../connectors' },
            ),
          ),
        }),
        response: {
          201: Type.Intersect([
            StationSummary,
            Type.Object({ connectors: Type.Array(ConnectorSchema) }),
          ]),
          400: ErrorSchema,
          409: ErrorSchema,
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request);
      const b = request.body as {
        code: string;
        name: string;
        lat: number;
        lng: number;
        area?: string;
        total_power_kw?: number;
        connector_standard?: string;
        operating_hours?: string;
        note?: string;
        connectors?: { ocpp_connector_id: number; max_power_kw: number; standard?: string }[];
      };

      const trung = await db.query(`SELECT 1 FROM charging_stations WHERE code = $1`, [b.code]);
      if ((trung.rowCount ?? 0) > 0) {
        return sendError(reply, 409, 'ma_tram_da_ton_tai', `Mã trạm "${b.code}" đã tồn tại.`);
      }
      const soTru = new Set((b.connectors ?? []).map((c) => c.ocpp_connector_id));
      if (soTru.size !== (b.connectors ?? []).length) {
        return sendError(reply, 400, 'tru_trung_so', 'Có hai trụ trùng ocpp_connector_id.');
      }

      const tao = await db.query(
        `INSERT INTO charging_stations
           (code, name, location, area, total_power_kw, connector_standard, operating_hours,
            note, updated_by)
         VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography, $5, $6,
                 coalesce($7, 'CCS2'), $8, $9, $10)
         RETURNING id`,
        [
          b.code,
          b.name,
          b.lng,
          b.lat,
          b.area ?? null,
          b.total_power_kw ?? null,
          b.connector_standard ?? null,
          b.operating_hours ?? null,
          b.note ?? null,
          auth.userId,
        ],
      );
      const id = tao.rows[0]!.id as string;
      for (const c of b.connectors ?? []) {
        await db.query(
          `INSERT INTO connectors (station_id, ocpp_connector_id, max_power_kw, standard)
           VALUES ($1, $2, $3, coalesce($4, 'CCS2'))`,
          [id, c.ocpp_connector_id, c.max_power_kw, c.standard ?? null],
        );
      }
      return reply.status(201).send(await docChiTiet(db, id));
    },
  );

  app.patch(
    '/stations/:id',
    {
      config: { permission: 'station.manage' },
      schema: {
        tags: ['tram-sac'],
        summary: 'Sửa thông tin & trạng thái khai thác của trạm (F-C1)',
        description:
          'Đổi được trạng thái KHAI THÁC của trạm (active/maintenance/inactive). KHÔNG đổi ' +
          'được trạng thái từng trụ — cái đó chỉ đến từ OCPP (F-C2). Cũng KHÔNG đổi được ' +
          '`code` vì trụ đang dùng mã đó để kết nối CSMS.',
        params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
        body: Type.Object({
          name: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
          lat: Type.Optional(Type.Number({ minimum: -90, maximum: 90 })),
          lng: Type.Optional(Type.Number({ minimum: -180, maximum: 180 })),
          area: Type.Optional(Type.Union([Type.String({ maxLength: 200 }), Type.Null()])),
          total_power_kw: Type.Optional(
            Type.Union([Type.Number({ exclusiveMinimum: 0 }), Type.Null()]),
          ),
          operating_hours: Type.Optional(Type.Union([Type.String({ maxLength: 64 }), Type.Null()])),
          status: Type.Optional(
            Type.Union([
              Type.Literal('active'),
              Type.Literal('maintenance'),
              Type.Literal('inactive'),
            ]),
          ),
          note: Type.Optional(Type.Union([Type.String({ maxLength: 1000 }), Type.Null()])),
        }),
        response: {
          200: Type.Intersect([
            StationSummary,
            Type.Object({ connectors: Type.Array(ConnectorSchema) }),
          ]),
          400: ErrorSchema,
          404: ErrorSchema,
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request);
      const { id } = request.params as { id: string };
      const b = request.body as Record<string, unknown>;

      if ((b.lat === undefined) !== (b.lng === undefined)) {
        return sendError(reply, 400, 'thieu_toa_do', 'Đổi vị trí trạm phải truyền CẢ lat lẫn lng.');
      }

      const co = await db.query(`SELECT 1 FROM charging_stations WHERE id = $1`, [id]);
      if ((co.rowCount ?? 0) === 0) {
        return sendError(reply, 404, 'khong_tim_thay_tram', 'Không tìm thấy trạm sạc.');
      }

      const gan: string[] = [];
      const params: unknown[] = [id];
      const dat = (cot: string, giaTri: unknown): void => {
        params.push(giaTri);
        gan.push(`${cot} = $${params.length}`);
      };
      for (const cot of ['name', 'area', 'total_power_kw', 'operating_hours', 'note'] as const) {
        if (b[cot] !== undefined) dat(cot, b[cot]);
      }
      if (b.status !== undefined) {
        params.push(b.status);
        gan.push(`status = $${params.length}::station_status`);
      }
      if (b.lat !== undefined && b.lng !== undefined) {
        params.push(b.lng, b.lat);
        gan.push(
          `location = ST_SetSRID(ST_MakePoint($${params.length - 1}, $${params.length}), 4326)::geography`,
        );
      }
      if (gan.length === 0) {
        return sendError(reply, 400, 'khong_co_gi_de_sua', 'Không có trường nào để cập nhật.');
      }
      params.push(auth.userId);
      gan.push(`updated_by = $${params.length}`, `updated_at = now()`);

      await db.query(`UPDATE charging_stations SET ${gan.join(', ')} WHERE id = $1`, params);
      return docChiTiet(db, id);
    },
  );

  app.post(
    '/stations/:id/connectors',
    {
      config: { permission: 'station.manage' },
      schema: {
        tags: ['tram-sac'],
        summary: 'Thêm trụ/súng vào một trạm (F-C1)',
        description:
          'Trụ mới bắt đầu ở trạng thái `Available`; từ đó trở đi trạng thái CHỈ do OCPP ' +
          'StatusNotification cập nhật.',
        params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
        body: Type.Object({
          ocpp_connector_id: Type.Integer({ minimum: 1 }),
          max_power_kw: Type.Number({ exclusiveMinimum: 0 }),
          standard: Type.Optional(Type.String({ maxLength: 32 })),
        }),
        response: {
          201: ConnectorSchema,
          404: ErrorSchema,
          409: ErrorSchema,
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const b = request.body as {
        ocpp_connector_id: number;
        max_power_kw: number;
        standard?: string;
      };

      const co = await db.query(`SELECT 1 FROM charging_stations WHERE id = $1`, [id]);
      if ((co.rowCount ?? 0) === 0) {
        return sendError(reply, 404, 'khong_tim_thay_tram', 'Không tìm thấy trạm sạc.');
      }
      const trung = await db.query(
        `SELECT 1 FROM connectors WHERE station_id = $1 AND ocpp_connector_id = $2`,
        [id, b.ocpp_connector_id],
      );
      if ((trung.rowCount ?? 0) > 0) {
        return sendError(reply, 409, 'tru_da_ton_tai', `Trạm đã có trụ số ${b.ocpp_connector_id}.`);
      }

      const res = await db.query(
        `INSERT INTO connectors (station_id, ocpp_connector_id, max_power_kw, standard)
         VALUES ($1, $2, $3, coalesce($4, 'CCS2'))
         RETURNING id, ocpp_connector_id, max_power_kw::float8 AS max_power_kw, standard,
                   status::text AS status, updated_at`,
        [id, b.ocpp_connector_id, b.max_power_kw, b.standard ?? null],
      );
      const c = res.rows[0]!;
      return reply.status(201).send({ ...c, updated_at: (c.updated_at as Date).toISOString() });
    },
  );

  app.patch(
    '/stations/:id/connectors/:connectorId',
    {
      config: { permission: 'station.manage' },
      schema: {
        tags: ['tram-sac'],
        summary: 'Sửa thông số kỹ thuật của một trụ (F-C1)',
        description:
          'Chỉ đổi được công suất và chuẩn đầu sạc. Trường `status` KHÔNG có ở đây và sẽ ' +
          'không bao giờ có: trạng thái súng là dữ liệu đo từ trụ qua OCPP (F-C2, NF-02), ' +
          'sửa tay được thì tiêu chí "chính xác ≥99%" mất ý nghĩa.',
        params: Type.Object({
          id: Type.String({ format: 'uuid' }),
          connectorId: Type.String({ format: 'uuid' }),
        }),
        body: Type.Object({
          max_power_kw: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
          standard: Type.Optional(Type.String({ maxLength: 32 })),
        }),
        response: {
          200: ConnectorSchema,
          400: ErrorSchema,
          404: ErrorSchema,
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async (request, reply) => {
      const { id, connectorId } = request.params as { id: string; connectorId: string };
      const b = request.body as { max_power_kw?: number; standard?: string };

      const gan: string[] = [];
      const params: unknown[] = [connectorId, id];
      if (b.max_power_kw !== undefined) {
        params.push(b.max_power_kw);
        gan.push(`max_power_kw = $${params.length}`);
      }
      if (b.standard !== undefined) {
        params.push(b.standard);
        gan.push(`standard = $${params.length}`);
      }
      if (gan.length === 0) {
        return sendError(reply, 400, 'khong_co_gi_de_sua', 'Không có trường nào để cập nhật.');
      }

      const res = await db.query(
        `UPDATE connectors SET ${gan.join(', ')}, updated_at = now()
         WHERE id = $1 AND station_id = $2
         RETURNING id, ocpp_connector_id, max_power_kw::float8 AS max_power_kw, standard,
                   status::text AS status, updated_at`,
        params,
      );
      const c = res.rows[0];
      if (!c) {
        return sendError(reply, 404, 'khong_tim_thay_tru', 'Không tìm thấy trụ trong trạm này.');
      }
      return { ...c, updated_at: (c.updated_at as Date).toISOString() };
    },
  );
}

/** Đọc lại trạm sau khi ghi — trả đúng hình dạng của GET /stations/{id}. */
async function docChiTiet(db: Queryable, id: string): Promise<Record<string, unknown>> {
  const res = await db.query(`${STATION_SELECT} WHERE s.id = $1 GROUP BY s.id`, [id]);
  const connectors = await db.query(
    `SELECT id, ocpp_connector_id, max_power_kw::float8 AS max_power_kw, standard,
            status::text AS status, updated_at
     FROM connectors WHERE station_id = $1 ORDER BY ocpp_connector_id`,
    [id],
  );
  return {
    ...res.rows[0]!,
    connectors: connectors.rows.map((c) => ({
      ...c,
      updated_at: (c.updated_at as Date).toISOString(),
    })),
  };
}
