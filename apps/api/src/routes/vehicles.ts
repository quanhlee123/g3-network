// F-E1/F-A1/F-A5 — Danh sách xe theo quyền + telemetry mới nhất/lịch sử + VỊ TRÍ.
//
// Toạ độ được TÁCH thành endpoint riêng GET /vehicles/:id/location: nhờ vậy quy tắc 5
// (audit log mọi truy cập vị trí — NF-06, Nghị định 13/2023) chỉ có ĐÚNG MỘT chỗ để thực thi,
// và các màn hình chỉ cần SOC/quãng đường không vô tình kéo theo dữ liệu riêng tư của tài xế.
import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import {
  ACTION_VEHICLE_LOCATION_READ,
  ACTION_VEHICLE_LOCATION_DENIED,
  hasOpenTicket,
  writeAuditLog,
} from '../audit';
import { requireScopedAuth } from '../auth/guard';
import { vehicleInScope, vehicleScopeClause } from '../auth/scope';
import type { Queryable } from '../db';
import { AUTH_ERROR_RESPONSES, ErrorSchema, sendError } from '../errors';

export interface VehicleRoutesDeps {
  db: Queryable;
  telemetryHistoryMaxRows: number;
}

const VehicleIdParams = Type.Object({ id: Type.String({ format: 'uuid' }) });

const NullableNumber = Type.Union([Type.Number(), Type.Null()]);
const NullableString = Type.Union([Type.String(), Type.Null()]);

const TelemetrySchema = Type.Object({
  time: Type.String({ format: 'date-time', description: 'Giờ THIẾT BỊ sinh bản ghi (NF-09)' }),
  schema_version: Type.Integer({ description: 'NF-16' }),
  soc_pct: NullableNumber,
  soh_pct: NullableNumber,
  battery_voltage_v: NullableNumber,
  battery_temp_c: NullableNumber,
  motor_temp_c: NullableNumber,
  speed_kmh: NullableNumber,
  odometer_km: Type.Union([Type.Number({ description: 'km (NF-17)' }), Type.Null()]),
  fault_codes: Type.Union([Type.Array(Type.String()), Type.Null()]),
});

// Danh sách cột telemetry dùng chung cho "mới nhất" và "lịch sử" — KHÔNG có cột position.
const TELEMETRY_COLUMNS = `
  time, schema_version,
  soc_pct::float8            AS soc_pct,
  soh_pct::float8            AS soh_pct,
  battery_voltage_v::float8  AS battery_voltage_v,
  battery_temp_c::float8     AS battery_temp_c,
  motor_temp_c::float8       AS motor_temp_c,
  speed_kmh::float8          AS speed_kmh,
  odometer_km::float8        AS odometer_km,
  fault_codes`;

export async function vehicleRoutes(app: FastifyInstance, deps: VehicleRoutesDeps): Promise<void> {
  const { db } = deps;

  // ---- F-E1: danh sách xe trong phạm vi của người gọi -------------------------------
  app.get(
    '/vehicles',
    {
      config: { permission: 'vehicle.read' },
      schema: {
        tags: ['xe'],
        summary: 'Danh sách xe theo quyền (F-E1)',
        description:
          'Phạm vi tự động theo vai trò: tài xế chỉ thấy xe được gán, quản lý đội chỉ thấy ' +
          'đội mình (sheet 9). KHÔNG kèm toạ độ — dùng GET /vehicles/{id}/location.',
        querystring: Type.Object({
          q: Type.Optional(Type.String({ description: 'Tìm theo VIN (khớp một phần)' })),
          model: Type.Optional(
            Type.Union([Type.Literal('EVT-262'), Type.Literal('EVT-400'), Type.Literal('EVT-825')]),
          ),
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200, default: 50 })),
          offset: Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
        }),
        response: {
          200: Type.Object({
            total: Type.Integer(),
            limit: Type.Integer(),
            offset: Type.Integer(),
            items: Type.Array(
              Type.Object({
                id: Type.String({ format: 'uuid' }),
                vin: Type.String(),
                model: Type.String(),
                warranty_state: Type.String(),
                customer_name: Type.String(),
                capacity_kwh: NullableNumber,
                soh_pct: NullableNumber,
                last_reading_at: NullableString,
                soc_pct: NullableNumber,
                odometer_km: NullableNumber,
                device_last_seen_at: NullableString,
                device_power_status: NullableString,
              }),
            ),
          }),
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async (request) => {
      const auth = requireScopedAuth(request);
      const query = request.query as {
        q?: string;
        model?: string;
        limit?: number;
        offset?: number;
      };
      const limit = query.limit ?? 50;
      const offset = query.offset ?? 0;

      const scope = vehicleScopeClause(auth, 'v', 1);
      const params: unknown[] = [...scope.params];
      const filters = [scope.sql];
      if (query.q) {
        params.push(`%${query.q}%`);
        filters.push(`v.vin ILIKE $${params.length}`);
      }
      if (query.model) {
        params.push(query.model);
        filters.push(`v.model = $${params.length}`);
      }
      const where = filters.join(' AND ');

      const totalRes = await db.query(
        `SELECT count(*)::int AS n FROM vehicles v WHERE ${where}`,
        params,
      );
      const rows = await db.query(
        `SELECT v.id, v.vin, v.model::text AS model, v.warranty_state::text AS warranty_state,
                c.name AS customer_name,
                b.capacity_kwh::float8 AS capacity_kwh, b.soh_pct::float8 AS soh_pct,
                t.time AS last_reading_at, t.soc_pct::float8 AS soc_pct,
                t.odometer_km::float8 AS odometer_km,
                d.last_seen_at AS device_last_seen_at,
                d.power_status::text AS device_power_status
         FROM vehicles v
         JOIN customers c ON c.id = v.customer_id
         LEFT JOIN LATERAL (
           SELECT capacity_kwh, soh_pct FROM batteries b2
           WHERE b2.vehicle_id = v.id ORDER BY b2.created_at DESC LIMIT 1
         ) b ON true
         LEFT JOIN devices d ON d.vehicle_id = v.id
         LEFT JOIN LATERAL (
           SELECT time, soc_pct, odometer_km FROM telematics_readings tr
           WHERE tr.vehicle_id = v.id ORDER BY tr.time DESC LIMIT 1
         ) t ON true
         WHERE ${where}
         ORDER BY v.vin
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      );

      return {
        total: totalRes.rows[0]!.n as number,
        limit,
        offset,
        items: rows.rows.map((r) => ({ ...r, ...isoDates(r) })),
      };
    },
  );

  // ---- F-A1: bản ghi telemetry mới nhất của 1 xe -----------------------------------
  app.get(
    '/vehicles/:id/telemetry/latest',
    {
      config: { permission: 'vehicle.read' },
      schema: {
        tags: ['xe'],
        summary: 'Dữ liệu telemetry mới nhất của 1 xe (F-A1)',
        description: 'Không kèm toạ độ (xem GET /vehicles/{id}/location).',
        params: VehicleIdParams,
        response: { 200: TelemetrySchema, 404: ErrorSchema, ...AUTH_ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const auth = requireScopedAuth(request);
      const { id } = request.params as { id: string };
      if (!(await vehicleInScope(db, auth, id))) return notFoundVehicle(reply);

      const res = await db.query(
        `SELECT ${TELEMETRY_COLUMNS} FROM telematics_readings
         WHERE vehicle_id = $1 ORDER BY time DESC LIMIT 1`,
        [id],
      );
      const row = res.rows[0];
      if (!row) {
        return sendError(
          reply,
          404,
          'chua_co_du_lieu',
          'Xe chưa gửi bản ghi telemetry nào — kiểm tra thiết bị tại GET /devices/health.',
        );
      }
      return { ...row, ...isoDates(row) };
    },
  );

  // ---- F-A1: lịch sử telemetry ------------------------------------------------------
  app.get(
    '/vehicles/:id/telemetry/history',
    {
      config: { permission: 'vehicle.read' },
      schema: {
        tags: ['xe'],
        summary: 'Lịch sử telemetry 1 xe theo khoảng thời gian (F-A1)',
        params: VehicleIdParams,
        querystring: Type.Object({
          from: Type.Optional(Type.String({ format: 'date-time' })),
          to: Type.Optional(Type.String({ format: 'date-time' })),
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 5000, default: 200 })),
        }),
        response: {
          200: Type.Object({
            vehicle_id: Type.String({ format: 'uuid' }),
            count: Type.Integer(),
            items: Type.Array(TelemetrySchema),
          }),
          404: ErrorSchema,
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async (request, reply) => {
      const auth = requireScopedAuth(request);
      const { id } = request.params as { id: string };
      if (!(await vehicleInScope(db, auth, id))) return notFoundVehicle(reply);

      const q = request.query as { from?: string; to?: string; limit?: number };
      // Trần cứng từ cấu hình: chặn 1 request quét cả hypertable 12 tháng (NF-16).
      const limit = Math.min(q.limit ?? 200, deps.telemetryHistoryMaxRows);
      const params: unknown[] = [id];
      const filters = ['vehicle_id = $1'];
      if (q.from) {
        params.push(q.from);
        filters.push(`time >= $${params.length}`);
      }
      if (q.to) {
        params.push(q.to);
        filters.push(`time <= $${params.length}`);
      }
      const res = await db.query(
        `SELECT ${TELEMETRY_COLUMNS} FROM telematics_readings
         WHERE ${filters.join(' AND ')}
         ORDER BY time DESC
         LIMIT $${params.length + 1}`,
        [...params, limit],
      );
      return {
        vehicle_id: id,
        count: res.rows.length,
        items: res.rows.map((r) => ({ ...r, ...isoDates(r) })),
      };
    },
  );

  // ---- F-E1 · QUY TẮC 5: BẢN ĐỒ TOÀN ĐỘI — một truy vấn, MỘT dòng audit -------------
  //
  // Vì sao có endpoint riêng thay vì để portal gọi /vehicles/{id}/location N lần:
  //   1. Đội 20 xe sẽ sinh 20 dòng audit MỖI LẦN mở trang chủ. Nhật ký vị trí khi đó
  //      toàn nhiễu "xem bản đồ", không còn dùng để điều tra được nữa — trái tinh thần
  //      quy tắc 5 dù vẫn đúng chữ.
  //   2. Một lần xem bản đồ là MỘT hành vi truy cập dữ liệu vị trí. Ghi đúng như vậy,
  //      kèm danh sách xe đã hiện trong metadata, mới phản ánh thật cái đã xảy ra.
  app.get(
    '/vehicles/map',
    {
      config: { permission: 'vehicle.location.read' },
      schema: {
        tags: ['xe'],
        summary: 'Vị trí mới nhất của TOÀN ĐỘI cho bản đồ tổng quan (F-E1) — có ghi audit log',
        description:
          'Trả vị trí mới nhất của mọi xe trong phạm vi người gọi. Ghi ĐÚNG MỘT dòng ' +
          'audit_logs cho cả lần xem, metadata kèm số xe và danh sách xe đã hiện (NF-06, ' +
          'Nghị định 13/2023). Vai trò CSKH KHÔNG dùng được endpoint này — xem mô tả lỗi 403.',
        querystring: Type.Object({
          reason: Type.String({
            minLength: 5,
            maxLength: 200,
            description: 'Lý do truy cập — bắt buộc, được lưu vào audit log',
          }),
          moi_trong_giay: Type.Optional(
            Type.Integer({
              minimum: 1,
              description: 'Chỉ lấy xe có vị trí mới hơn số giây này (bỏ trống = mọi xe)',
            }),
          ),
        }),
        response: {
          200: Type.Object({
            so_xe: Type.Integer(),
            items: Type.Array(
              Type.Object({
                vehicle_id: Type.String({ format: 'uuid' }),
                vin: Type.String(),
                time: Type.String({ format: 'date-time' }),
                lat: Type.Number(),
                lng: Type.Number(),
                speed_kmh: NullableNumber,
                soc_pct: NullableNumber,
                cu_giay: Type.Integer({ description: 'Số giây kể từ bản ghi vị trí đó' }),
              }),
            ),
          }),
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async (request, reply) => {
      const auth = requireScopedAuth(request);
      const { reason, moi_trong_giay: moiTrongGiay } = request.query as {
        reason: string;
        moi_trong_giay?: number;
      };

      // Sheet 9: CSKH chỉ xem vị trí khi có ticket/SOS ĐANG MỞ, và ticket luôn gắn với
      // MỘT xe. Bản đồ toàn đội không có khái niệm "ticket của cả đội" — cho phép ở đây
      // là biến một ticket thành giấy phép xem vị trí mọi tài xế. Chặn thẳng, CSKH đi
      // đường /vehicles/{id}/location kèm ticket_id như cũ. (rbac-matrix R-12)
      if (auth.grant.requireOpenTicket) {
        await writeAuditLog(db, {
          userId: auth.userId,
          action: ACTION_VEHICLE_LOCATION_DENIED,
          vehicleId: null,
          reason: `bản đồ toàn đội không mở cho vai trò cần ticket: ${reason}`,
          metadata: { endpoint: 'map', vai_tro: auth.role },
        });
        return sendError(
          reply,
          403,
          'khong_dung_duoc_ban_do_doi',
          'Vai trò của bạn chỉ được xem vị trí từng xe kèm ticket đang mở, không xem được ' +
            'bản đồ toàn đội. Dùng GET /vehicles/{id}/location với ticket_id.',
        );
      }

      const scope = vehicleScopeClause(auth, 'v', 1);
      const params: unknown[] = [...scope.params];
      const filters = [scope.sql];
      if (moiTrongGiay !== undefined) {
        params.push(moiTrongGiay);
        filters.push(`EXTRACT(EPOCH FROM (now() - t.time)) <= $${params.length}`);
      }

      const res = await db.query(
        `SELECT v.id AS vehicle_id, v.vin, t.time,
                ST_Y(t.position::geometry)::float8 AS lat,
                ST_X(t.position::geometry)::float8 AS lng,
                t.speed_kmh::float8 AS speed_kmh,
                t.soc_pct::float8 AS soc_pct,
                floor(EXTRACT(EPOCH FROM (now() - t.time)))::int AS cu_giay
         FROM vehicles v
         JOIN LATERAL (
           SELECT time, position, speed_kmh, soc_pct
           FROM telematics_readings tr
           WHERE tr.vehicle_id = v.id AND tr.position IS NOT NULL
           ORDER BY tr.time DESC LIMIT 1
         ) t ON true
         WHERE ${filters.join(' AND ')}
         ORDER BY v.vin`,
        params,
      );

      // Ghi audit TRƯỚC khi trả dữ liệu — cùng lý do như /vehicles/{id}/location:
      // không có trường hợp "đã xem vị trí nhưng không có dấu vết".
      await writeAuditLog(db, {
        userId: auth.userId,
        action: ACTION_VEHICLE_LOCATION_READ,
        vehicleId: null, // một dòng cho NHIỀU xe — danh sách nằm trong metadata
        reason,
        metadata: {
          vai_tro: auth.role,
          endpoint: 'map',
          so_xe: res.rows.length,
          vehicle_ids: res.rows.map((r) => r.vehicle_id as string),
        },
      });

      return {
        so_xe: res.rows.length,
        items: res.rows.map((r) => ({
          vehicle_id: r.vehicle_id as string,
          vin: r.vin as string,
          time: toIso(r.time),
          lat: r.lat as number,
          lng: r.lng as number,
          speed_kmh: (r.speed_kmh as number | null) ?? null,
          soc_pct: (r.soc_pct as number | null) ?? null,
          cu_giay: r.cu_giay as number,
        })),
      };
    },
  );

  // ---- F-A5 · QUY TẮC 5: vị trí xe — LUÔN ghi audit log ----------------------------
  app.get(
    '/vehicles/:id/location',
    {
      config: { permission: 'vehicle.location.read' },
      schema: {
        tags: ['xe'],
        summary: 'Vị trí mới nhất của 1 xe (F-A5) — có ghi audit log',
        description:
          'NF-06 & Nghị định 13/2023: mọi lần gọi (kể cả bị từ chối) đều ghi audit_logs gồm ' +
          'ai · lúc nào · xe nào · lý do. Vai trò CSKH bắt buộc kèm ticket_id đang mở. ' +
          'Vai trò Vận hành G3 Energy KHÔNG có quyền này (sheet 9).',
        params: VehicleIdParams,
        querystring: Type.Object({
          reason: Type.String({
            minLength: 5,
            maxLength: 200,
            description: 'Lý do truy cập — bắt buộc, được lưu vào audit log',
          }),
          ticket_id: Type.Optional(
            Type.String({ format: 'uuid', description: 'Ticket đang mở (bắt buộc với CSKH)' }),
          ),
        }),
        response: {
          200: Type.Object({
            vehicle_id: Type.String({ format: 'uuid' }),
            time: Type.String({ format: 'date-time' }),
            lat: Type.Number(),
            lng: Type.Number(),
            speed_kmh: NullableNumber,
          }),
          404: ErrorSchema,
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async (request, reply) => {
      const auth = requireScopedAuth(request);
      const { id } = request.params as { id: string };
      const { reason, ticket_id: ticketId } = request.query as {
        reason: string;
        ticket_id?: string;
      };

      if (!(await vehicleInScope(db, auth, id))) {
        await writeAuditLog(db, {
          userId: auth.userId,
          action: ACTION_VEHICLE_LOCATION_DENIED,
          vehicleId: null,
          reason: `ngoài phạm vi (${auth.grant.scope}): ${reason}`,
          metadata: { vehicle_id_yeu_cau: id },
        });
        return notFoundVehicle(reply);
      }

      // Sheet 9: CSKH chỉ xem vị trí khi có ticket/SOS đang mở.
      if (auth.grant.requireOpenTicket) {
        const ok = ticketId !== undefined && (await hasOpenTicket(db, ticketId, id));
        if (!ok) {
          await writeAuditLog(db, {
            userId: auth.userId,
            action: ACTION_VEHICLE_LOCATION_DENIED,
            vehicleId: id,
            reason: `thiếu ticket đang mở: ${reason}`,
            ticketId: null,
            metadata: { ticket_id_yeu_cau: ticketId ?? null },
          });
          return sendError(
            reply,
            403,
            'can_ticket_dang_mo',
            'Vai trò CSKH chỉ được xem vị trí xe khi có ticket/SOS đang mở — truyền ticket_id hợp lệ.',
          );
        }
      }

      const res = await db.query(
        `SELECT time,
                ST_Y(position::geometry)::float8 AS lat,
                ST_X(position::geometry)::float8 AS lng,
                speed_kmh::float8 AS speed_kmh
         FROM telematics_readings
         WHERE vehicle_id = $1 AND position IS NOT NULL
         ORDER BY time DESC LIMIT 1`,
        [id],
      );
      const row = res.rows[0];
      if (!row) {
        await writeAuditLog(db, {
          userId: auth.userId,
          action: ACTION_VEHICLE_LOCATION_READ,
          vehicleId: id,
          reason,
          ticketId: ticketId ?? null,
          metadata: { ket_qua: 'chua_co_du_lieu_vi_tri' },
        });
        return sendError(reply, 404, 'chua_co_du_lieu', 'Xe chưa có bản ghi vị trí nào.');
      }

      // Ghi audit TRƯỚC khi trả dữ liệu: nếu ghi hỏng thì request hỏng, không có
      // trường hợp "đã xem vị trí nhưng không có dấu vết".
      await writeAuditLog(db, {
        userId: auth.userId,
        action: ACTION_VEHICLE_LOCATION_READ,
        vehicleId: id,
        reason,
        ticketId: ticketId ?? null,
        metadata: { vai_tro: auth.role },
      });

      return {
        vehicle_id: id,
        time: toIso(row.time),
        lat: row.lat as number,
        lng: row.lng as number,
        speed_kmh: (row.speed_kmh as number | null) ?? null,
      };
    },
  );

  // ---- F-A5 · QUY TẮC 5: LỘ TRÌNH — cũng là dữ liệu vị trí, cũng LUÔN ghi audit ------
  app.get(
    '/vehicles/:id/route',
    {
      config: { permission: 'vehicle.location.read' },
      schema: {
        tags: ['xe'],
        summary: 'Lịch sử lộ trình 1 xe theo khoảng thời gian (F-A5) — có ghi audit log',
        description:
          'Trả chuỗi toạ độ theo thời gian. Đoạn dài được DOWNSAMPLE đều để không kéo về ' +
          'hàng chục nghìn điểm: giữ nguyên điểm đầu, điểm cuối và lấy đều ở giữa; ' +
          '`da_downsample` cho biết có rút gọn hay không, `tong_diem_goc` là số điểm thật. ' +
          'Cùng ràng buộc quyền như GET /vehicles/{id}/location: bắt buộc `reason`, ' +
          'CSKH phải kèm ticket đang mở, và mọi lần gọi đều vào audit_logs.',
        params: VehicleIdParams,
        querystring: Type.Object({
          from: Type.String({ format: 'date-time' }),
          to: Type.String({ format: 'date-time' }),
          reason: Type.String({ minLength: 5, maxLength: 200 }),
          ticket_id: Type.Optional(Type.String({ format: 'uuid' })),
          max_diem: Type.Optional(
            Type.Integer({
              minimum: 2,
              maximum: 5000,
              default: 500,
              description: 'Số điểm tối đa trả về; vượt quá thì downsample đều',
            }),
          ),
        }),
        response: {
          200: Type.Object({
            vehicle_id: Type.String({ format: 'uuid' }),
            tong_diem_goc: Type.Integer(),
            da_downsample: Type.Boolean(),
            items: Type.Array(
              Type.Object({
                time: Type.String({ format: 'date-time' }),
                lat: Type.Number(),
                lng: Type.Number(),
                speed_kmh: NullableNumber,
              }),
            ),
          }),
          404: ErrorSchema,
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async (request, reply) => {
      const auth = requireScopedAuth(request);
      const { id } = request.params as { id: string };
      const q = request.query as {
        from: string;
        to: string;
        reason: string;
        ticket_id?: string;
        max_diem?: number;
      };
      const maxDiem = q.max_diem ?? 500;

      if (!(await vehicleInScope(db, auth, id))) {
        await writeAuditLog(db, {
          userId: auth.userId,
          action: ACTION_VEHICLE_LOCATION_DENIED,
          vehicleId: null,
          reason: `ngoài phạm vi (${auth.grant.scope}): ${q.reason}`,
          metadata: { vehicle_id_yeu_cau: id, endpoint: 'route' },
        });
        return notFoundVehicle(reply);
      }

      // Sheet 9: CSKH chỉ xem vị trí khi có ticket/SOS đang mở — lộ trình cũng là vị trí,
      // thậm chí nhạy cảm hơn (biết cả nơi tài xế đã đi qua).
      if (auth.grant.requireOpenTicket) {
        const ok = q.ticket_id !== undefined && (await hasOpenTicket(db, q.ticket_id, id));
        if (!ok) {
          await writeAuditLog(db, {
            userId: auth.userId,
            action: ACTION_VEHICLE_LOCATION_DENIED,
            vehicleId: id,
            reason: `thiếu ticket đang mở: ${q.reason}`,
            ticketId: null,
            metadata: { ticket_id_yeu_cau: q.ticket_id ?? null, endpoint: 'route' },
          });
          return sendError(
            reply,
            403,
            'can_ticket_dang_mo',
            'Vai trò CSKH chỉ được xem lộ trình khi có ticket/SOS đang mở — truyền ticket_id hợp lệ.',
          );
        }
      }

      // Downsample ngay trong SQL: lấy đều theo THỨ TỰ điểm, luôn giữ điểm đầu và điểm cuối.
      // Đây là rút gọn đều, KHÔNG phải Douglas–Peucker (thuật toán giữ hình dạng tuyến).
      // Đủ cho việc vẽ lại lộ trình ở Phase 1; nếu portal cần đường mượt theo hình học thì
      // đó là việc của tầng bản đồ (Q5 — nhà cung cấp bản đồ — đang MỞ).
      const res = await db.query(
        `WITH diem AS (
           SELECT time,
                  ST_Y(position::geometry)::float8 AS lat,
                  ST_X(position::geometry)::float8 AS lng,
                  speed_kmh::float8 AS speed_kmh,
                  row_number() OVER (ORDER BY time) AS rn,
                  count(*) OVER () AS tong
           FROM telematics_readings
           WHERE vehicle_id = $1 AND position IS NOT NULL
             AND time >= $2::timestamptz AND time <= $3::timestamptz
         )
         SELECT time, lat, lng, speed_kmh, tong
         FROM diem
         WHERE tong <= $4
            OR rn = 1 OR rn = tong
            OR rn % ceil(tong::numeric / $4) = 0
         ORDER BY time`,
        [id, q.from, q.to, maxDiem],
      );

      const tongGoc = res.rows.length > 0 ? Number(res.rows[0]!.tong) : 0;

      // Ghi audit TRƯỚC khi trả dữ liệu (cùng lý do như endpoint /location).
      await writeAuditLog(db, {
        userId: auth.userId,
        action: ACTION_VEHICLE_LOCATION_READ,
        vehicleId: id,
        reason: q.reason,
        ticketId: q.ticket_id ?? null,
        metadata: {
          vai_tro: auth.role,
          endpoint: 'route',
          tu: q.from,
          den: q.to,
          so_diem_tra_ve: res.rows.length,
        },
      });

      return {
        vehicle_id: id,
        tong_diem_goc: tongGoc,
        da_downsample: tongGoc > maxDiem,
        items: res.rows.map((r) => ({
          time: toIso(r.time),
          lat: r.lat as number,
          lng: r.lng as number,
          speed_kmh: (r.speed_kmh as number | null) ?? null,
        })),
      };
    },
  );
}

function notFoundVehicle(reply: Parameters<typeof sendError>[0]) {
  // Cùng một câu trả lời cho "không tồn tại" và "ngoài phạm vi" — không lộ xe của đội khác.
  return sendError(reply, 404, 'khong_tim_thay_xe', 'Không tìm thấy xe trong phạm vi của bạn.');
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

/** pg trả timestamptz thành Date — schema OpenAPI khai date-time nên đổi sang chuỗi ISO. */
function isoDates(row: Record<string, unknown>): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value instanceof Date) out[key] = value.toISOString();
  }
  return out;
}
