// F-B2/F-C6 — Danh sách phiên sạc. Bảng charging_sessions là APPEND-ONLY (NF-11) nên
// API chỉ có đường ĐỌC — không có POST/PATCH/DELETE ở đây, và sẽ không bao giờ có.
// Phiên do services/csms ghi tại StopTransaction (OCPP).
import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { requireScopedAuth } from '../auth/guard';
import { vehicleScopeClause } from '../auth/scope';
import type { Queryable } from '../db';
import { AUTH_ERROR_RESPONSES } from '../errors';

export interface SessionRoutesDeps {
  db: Queryable;
}

const NullableNumber = Type.Union([Type.Number(), Type.Null()]);
const NullableString = Type.Union([Type.String(), Type.Null()]);

export async function sessionRoutes(app: FastifyInstance, deps: SessionRoutesDeps): Promise<void> {
  const { db } = deps;

  app.get(
    '/charging-sessions',
    {
      config: { permission: 'charging_session.read' },
      schema: {
        tags: ['phien-sac'],
        summary: 'Danh sách phiên sạc theo quyền (F-B2)',
        description:
          'Phạm vi theo vai trò như danh sách xe. Cột đối soát (NF-10) nằm ở ' +
          'GET /reconciliation/results.',
        querystring: Type.Object({
          vehicle_id: Type.Optional(Type.String({ format: 'uuid' })),
          station_id: Type.Optional(Type.String({ format: 'uuid' })),
          from: Type.Optional(Type.String({ format: 'date-time' })),
          to: Type.Optional(Type.String({ format: 'date-time' })),
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 500, default: 50 })),
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
                vehicle_id: Type.String({ format: 'uuid' }),
                vin: Type.String(),
                station_id: Type.String({ format: 'uuid' }),
                station_code: Type.String(),
                ocpp_connector_id: Type.Integer(),
                ocpp_transaction_id: NullableString,
                started_at: Type.String({ format: 'date-time' }),
                ended_at: NullableString,
                duration_phut: NullableNumber,
                energy_kwh: Type.Union([
                  Type.Number({ description: 'kWh theo công tơ trụ (NF-17)' }),
                  Type.Null(),
                ]),
                soc_start_pct: NullableNumber,
                soc_end_pct: NullableNumber,
                avg_power_kw: NullableNumber,
                max_power_kw: NullableNumber,
                cost_vnd: NullableNumber,
              }),
            ),
          }),
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async (request) => {
      const auth = requireScopedAuth(request);
      const q = request.query as {
        vehicle_id?: string;
        station_id?: string;
        from?: string;
        to?: string;
        limit?: number;
        offset?: number;
      };
      const limit = q.limit ?? 50;
      const offset = q.offset ?? 0;

      const scope = vehicleScopeClause(auth, 'v', 1);
      const params: unknown[] = [...scope.params];
      const filters = [scope.sql];
      if (q.vehicle_id) {
        params.push(q.vehicle_id);
        filters.push(`cs.vehicle_id = $${params.length}`);
      }
      if (q.station_id) {
        params.push(q.station_id);
        filters.push(`cs.station_id = $${params.length}`);
      }
      if (q.from) {
        params.push(q.from);
        filters.push(`cs.started_at >= $${params.length}`);
      }
      if (q.to) {
        params.push(q.to);
        filters.push(`cs.started_at <= $${params.length}`);
      }
      const where = filters.join(' AND ');

      const totalRes = await db.query(
        `SELECT count(*)::int AS n FROM charging_sessions cs
         JOIN vehicles v ON v.id = cs.vehicle_id
         WHERE ${where}`,
        params,
      );
      const res = await db.query(
        `SELECT cs.id, cs.vehicle_id, v.vin, cs.station_id, st.code AS station_code,
                cn.ocpp_connector_id, cs.ocpp_transaction_id,
                cs.started_at, cs.ended_at,
                EXTRACT(EPOCH FROM (cs.ended_at - cs.started_at))::float8 / 60 AS duration_phut,
                cs.energy_kwh::float8    AS energy_kwh,
                cs.soc_start_pct::float8 AS soc_start_pct,
                cs.soc_end_pct::float8   AS soc_end_pct,
                cs.avg_power_kw::float8  AS avg_power_kw,
                cs.max_power_kw::float8  AS max_power_kw,
                cs.cost_vnd::float8      AS cost_vnd
         FROM charging_sessions cs
         JOIN vehicles v ON v.id = cs.vehicle_id
         JOIN charging_stations st ON st.id = cs.station_id
         JOIN connectors cn ON cn.id = cs.connector_id
         WHERE ${where}
         ORDER BY cs.started_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      );

      return {
        total: totalRes.rows[0]!.n as number,
        limit,
        offset,
        items: res.rows.map((r) => ({
          ...r,
          started_at: (r.started_at as Date).toISOString(),
          ended_at: r.ended_at instanceof Date ? r.ended_at.toISOString() : null,
        })),
      };
    },
  );
}
