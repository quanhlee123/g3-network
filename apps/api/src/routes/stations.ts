// F-C1/F-C2 — Danh mục trạm sạc + trạng thái trụ realtime.
// Trạng thái trụ do services/csms cập nhật từ StatusNotification OCPP 1.6J (NF-02 ≤30s);
// API chỉ đọc, không tự suy diễn trạng thái.
import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
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

const STATION_SELECT = `
  SELECT s.id, s.code, s.name, s.area, s.status::text AS status,
         s.total_power_kw::float8 AS total_power_kw,
         s.connector_standard, s.operating_hours,
         ST_Y(s.location::geometry)::float8 AS lat,
         ST_X(s.location::geometry)::float8 AS lng,
         count(c.id)::int                                             AS connectors_total,
         count(c.id) FILTER (WHERE c.status = 'Available')::int       AS connectors_available,
         count(c.id) FILTER (WHERE c.status = 'Charging')::int        AS connectors_charging,
         count(c.id) FILTER (WHERE c.status = 'Faulted')::int         AS connectors_faulted,
         count(c.id) FILTER (WHERE c.status = 'Unavailable')::int     AS connectors_unavailable
  FROM charging_stations s
  LEFT JOIN connectors c ON c.station_id = s.id`;

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
}
