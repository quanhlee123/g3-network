// F-J1 — Sức khỏe thiết bị telematics: last_seen, firmware, SIM, nguồn điện.
// Phân biệt "im lặng" (mất sóng — last_seen cũ) với "mất nguồn/tháo thiết bị"
// (power_status = 'lost', do LWT của MQTT — F-J3, services/ingest).
import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { requireScopedAuth } from '../auth/guard';
import { vehicleScopeClause } from '../auth/scope';
import type { Queryable } from '../db';
import { AUTH_ERROR_RESPONSES } from '../errors';

export interface DeviceRoutesDeps {
  db: Queryable;
}

const NullableString = Type.Union([Type.String(), Type.Null()]);
const NullableNumber = Type.Union([Type.Number(), Type.Null()]);

export async function deviceRoutes(app: FastifyInstance, deps: DeviceRoutesDeps): Promise<void> {
  const { db } = deps;

  app.get(
    '/devices/health',
    {
      config: { permission: 'device_health.read' },
      schema: {
        tags: ['thiet-bi'],
        summary: 'Sức khỏe thiết bị telematics (F-J1)',
        description:
          'im_lang_giay = số giây kể từ last_seen_at. power_status = "lost" nghĩa là thiết bị ' +
          'mất nguồn đột ngột (LWT) chứ không phải chỉ mất sóng (F-J3).',
        querystring: Type.Object({
          im_lang_qua_giay: Type.Optional(
            Type.Integer({
              minimum: 0,
              description: 'Chỉ trả thiết bị im lặng lâu hơn số giây này',
            }),
          ),
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 500, default: 100 })),
        }),
        response: {
          200: Type.Object({
            total: Type.Integer(),
            items: Type.Array(
              Type.Object({
                device_id: Type.String({ format: 'uuid' }),
                device_serial: Type.String(),
                vehicle_id: Type.String({ format: 'uuid' }),
                vin: Type.String(),
                firmware_version: NullableString,
                sim_iccid: NullableString,
                last_seen_at: NullableString,
                im_lang_giay: Type.Union([Type.Integer(), Type.Null()]),
                power_status: Type.String(),
                revoked_at: NullableString,
                // F-J3: bằng chứng của bản tin cuối + kết luận của job quét gần nhất
                supply_voltage_v: NullableNumber,
                signal_dbm: Type.Union([Type.Integer(), Type.Null()]),
                canh_bao_dang_mo: NullableString,
                loai_im_lang: NullableString,
              }),
            ),
          }),
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async (request) => {
      const auth = requireScopedAuth(request);
      const q = request.query as { im_lang_qua_giay?: number; limit?: number };
      const limit = q.limit ?? 100;

      const scope = vehicleScopeClause(auth, 'v', 1);
      const params: unknown[] = [...scope.params];
      const filters = [scope.sql];
      if (q.im_lang_qua_giay !== undefined) {
        params.push(q.im_lang_qua_giay);
        // Thiết bị chưa từng gửi (last_seen_at NULL) luôn được coi là im lặng
        filters.push(
          `(d.last_seen_at IS NULL OR EXTRACT(EPOCH FROM (now() - d.last_seen_at)) > $${params.length})`,
        );
      }

      const res = await db.query(
        `SELECT d.id AS device_id, d.device_serial, v.id AS vehicle_id, v.vin,
                d.firmware_version, d.sim_iccid, d.last_seen_at,
                CASE WHEN d.last_seen_at IS NULL THEN NULL
                     ELSE floor(EXTRACT(EPOCH FROM (now() - d.last_seen_at)))::int END AS im_lang_giay,
                d.power_status::text AS power_status, d.revoked_at,
                cuoi.supply_voltage_v, cuoi.signal_dbm,
                canh_bao.type::text AS canh_bao_dang_mo,
                canh_bao.payload ->> 'loai' AS loai_im_lang
         FROM devices d
         JOIN vehicles v ON v.id = d.vehicle_id
         -- Bằng chứng của bản tin CUỐI CÙNG (F-J3) — điện áp nguồn nuôi & cường độ sóng
         LEFT JOIN LATERAL (
           SELECT t.supply_voltage_v::float8 AS supply_voltage_v, t.signal_dbm
           FROM telematics_readings t
           WHERE t.vehicle_id = v.id
           ORDER BY t.time DESC LIMIT 1
         ) cuoi ON true
         -- Kết luận của job quét gần nhất, nếu cảnh báo còn đang mở
         LEFT JOIN LATERAL (
           SELECT a.type, a.payload FROM alerts a
           WHERE a.device_id = d.id AND a.status <> 'resolved'
             AND a.type IN ('device_offline', 'device_tamper')
           ORDER BY a.triggered_at DESC LIMIT 1
         ) canh_bao ON true
         WHERE ${filters.join(' AND ')}
         ORDER BY d.last_seen_at ASC NULLS FIRST
         LIMIT $${params.length + 1}`,
        [...params, limit],
      );

      return {
        total: res.rows.length,
        items: res.rows.map((r) => ({
          ...r,
          last_seen_at: r.last_seen_at instanceof Date ? r.last_seen_at.toISOString() : null,
          revoked_at: r.revoked_at instanceof Date ? r.revoked_at.toISOString() : null,
        })),
      };
    },
  );
}
