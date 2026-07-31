// F-A5 — Quản lý vùng geofence đa giác (PostGIS). Cảnh báo ra/vào vùng do
// services/ingest/src/geofence.ts sinh trên dòng telemetry.
//
// LƯU Ý QUYỀN: endpoint ở đây KHÔNG trả toạ độ xe nên không thuộc quy tắc 5 (audit vị trí);
// chúng chỉ đọc/ghi CẤU HÌNH vùng. Việc xem xe đang ở đâu vẫn phải đi qua
// GET /vehicles/{id}/location hoặc /route — hai chỗ duy nhất ghi audit.
import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { requireScopedAuth } from '../auth/guard';
import type { Queryable } from '../db';
import { AUTH_ERROR_RESPONSES, ErrorSchema, sendError } from '../errors';

export interface GeofenceRoutesDeps {
  db: Queryable;
}

const NullableString = Type.Union([Type.String(), Type.Null()]);

/** Một đa giác: mảng [lng, lat], tối thiểu 3 đỉnh (đóng vòng do server tự lo). */
const DinhSchema = Type.Array(Type.Tuple([Type.Number(), Type.Number()]), { minItems: 3 });

const GeofenceSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  code: Type.String(),
  name: Type.String(),
  customer_id: NullableString,
  vehicle_id: NullableString,
  canh_bao_vao: Type.Boolean(),
  canh_bao_ra: Type.Boolean(),
  enabled: Type.Boolean(),
  dinh: DinhSchema,
});

export async function geofenceRoutes(
  app: FastifyInstance,
  deps: GeofenceRoutesDeps,
): Promise<void> {
  const { db } = deps;

  app.get(
    '/geofences',
    {
      config: { permission: 'geofence.read' },
      schema: {
        tags: ['geofence'],
        summary: 'Danh sách vùng geofence trong phạm vi của người gọi (F-A5)',
        description:
          'Vùng gắn ĐỘI chỉ hiện với người thuộc đội đó; vùng KHÔNG gắn xe/đội là vùng ' +
          'áp dụng toàn hệ (vd vùng biên giới) nên ai cũng thấy.',
        response: {
          200: Type.Object({ total: Type.Integer(), items: Type.Array(GeofenceSchema) }),
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async (request) => {
      const auth = requireScopedAuth(request);
      const params: unknown[] = [];
      let pham_vi = 'true'; // scope 'all'
      if (auth.grant.scope === 'fleet') {
        params.push(auth.customerId);
        pham_vi = `(g.customer_id = $1
                    OR g.vehicle_id IN (SELECT id FROM vehicles WHERE customer_id = $1)
                    OR (g.customer_id IS NULL AND g.vehicle_id IS NULL))`;
      }

      const res = await db.query(
        `SELECT g.id, g.code, g.name, g.customer_id, g.vehicle_id,
                g.canh_bao_vao, g.canh_bao_ra, g.enabled,
                ST_AsGeoJSON(g.vung)::jsonb -> 'coordinates' -> 0 AS dinh
         FROM geofences g
         WHERE ${pham_vi}
         ORDER BY g.code`,
        params,
      );
      return {
        total: res.rows.length,
        items: res.rows.map((r) => ({
          ...r,
          // PostGIS đóng vòng đa giác (đỉnh cuối = đỉnh đầu); bỏ đỉnh lặp khi trả ra ngoài.
          dinh: boDinhLap(r.dinh as [number, number][]),
        })),
      };
    },
  );

  app.post(
    '/geofences',
    {
      config: { permission: 'geofence.manage' },
      schema: {
        tags: ['geofence'],
        summary: 'Tạo vùng geofence đa giác (F-A5)',
        description:
          'Đỉnh truyền theo thứ tự [lng, lat] — đúng quy ước GeoJSON, KHÔNG phải [lat, lng]. ' +
          'Không cần lặp đỉnh đầu ở cuối, server tự đóng vòng.',
        body: Type.Object({
          code: Type.String({ minLength: 2, maxLength: 50 }),
          name: Type.String({ minLength: 2, maxLength: 200 }),
          dinh: DinhSchema,
          customer_id: Type.Optional(Type.String({ format: 'uuid' })),
          vehicle_id: Type.Optional(Type.String({ format: 'uuid' })),
          canh_bao_vao: Type.Optional(Type.Boolean({ default: true })),
          canh_bao_ra: Type.Optional(Type.Boolean({ default: true })),
        }),
        response: {
          201: GeofenceSchema,
          400: ErrorSchema,
          409: ErrorSchema,
          ...AUTH_ERROR_RESPONSES,
        },
      },
    },
    async (request, reply) => {
      const auth = requireScopedAuth(request);
      const body = request.body as {
        code: string;
        name: string;
        dinh: [number, number][];
        customer_id?: string;
        vehicle_id?: string;
        canh_bao_vao?: boolean;
        canh_bao_ra?: boolean;
      };

      if (body.customer_id !== undefined && body.vehicle_id !== undefined) {
        return sendError(
          reply,
          400,
          'pham_vi_khong_hop_le',
          'Một vùng chỉ gắn cho ĐỘI hoặc cho XE, không gắn cả hai.',
        );
      }

      // Phạm vi 'fleet': chỉ được tạo vùng cho chính đội mình hoặc xe của đội mình.
      // Không kiểm chỗ này thì QL đội A đặt được vùng theo dõi xe của đội B.
      if (auth.grant.scope === 'fleet') {
        if (body.customer_id !== undefined && body.customer_id !== auth.customerId) {
          return sendError(reply, 403, 'ngoai_pham_vi', 'Chỉ được tạo vùng cho đội của mình.');
        }
        if (body.vehicle_id !== undefined) {
          const thuoc = await db.query(
            `SELECT 1 FROM vehicles WHERE id = $1 AND customer_id = $2`,
            [body.vehicle_id, auth.customerId],
          );
          if (thuoc.rows.length === 0) {
            return sendError(reply, 403, 'ngoai_pham_vi', 'Xe không thuộc đội của bạn.');
          }
        }
        if (body.customer_id === undefined && body.vehicle_id === undefined) {
          return sendError(
            reply,
            403,
            'ngoai_pham_vi',
            'Vùng áp dụng toàn hệ chỉ Admin mới tạo được — nêu rõ customer_id hoặc vehicle_id.',
          );
        }
      }

      const wkt = `POLYGON((${dongVong(body.dinh)
        .map(([lng, lat]) => `${lng} ${lat}`)
        .join(', ')}))`;

      try {
        const res = await db.query(
          `INSERT INTO geofences (code, name, customer_id, vehicle_id, vung, canh_bao_vao, canh_bao_ra)
           VALUES ($1, $2, $3, $4, ST_GeogFromText($5), $6, $7)
           RETURNING id, code, name, customer_id, vehicle_id, canh_bao_vao, canh_bao_ra, enabled,
                     ST_AsGeoJSON(vung)::jsonb -> 'coordinates' -> 0 AS dinh`,
          [
            body.code,
            body.name,
            body.customer_id ?? null,
            body.vehicle_id ?? null,
            wkt,
            body.canh_bao_vao ?? true,
            body.canh_bao_ra ?? true,
          ],
        );
        const row = res.rows[0]!;
        return reply.code(201).send({ ...row, dinh: boDinhLap(row.dinh as [number, number][]) });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('geofences_code_key')) {
          return sendError(reply, 409, 'trung_ma_vung', `Đã có vùng mang mã "${body.code}".`);
        }
        // Đa giác tự cắt / không hợp lệ → PostGIS ném lỗi; trả 400 chứ không phải 500.
        return sendError(reply, 400, 'da_giac_khong_hop_le', `Đa giác không hợp lệ: ${msg}`);
      }
    },
  );
}

/** Đóng vòng đa giác: PostGIS yêu cầu đỉnh cuối trùng đỉnh đầu. */
function dongVong(dinh: [number, number][]): [number, number][] {
  const dau = dinh[0]!;
  const cuoi = dinh.at(-1)!;
  return dau[0] === cuoi[0] && dau[1] === cuoi[1] ? dinh : [...dinh, dau];
}

function boDinhLap(dinh: [number, number][]): [number, number][] {
  if (dinh.length < 2) return dinh;
  const dau = dinh[0]!;
  const cuoi = dinh.at(-1)!;
  return dau[0] === cuoi[0] && dau[1] === cuoi[1] ? dinh.slice(0, -1) : dinh;
}
