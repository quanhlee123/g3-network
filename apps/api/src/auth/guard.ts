// F-F1 — Cổng chặn MẶC ĐỊNH TỪ CHỐI (quy tắc 6, CLAUDE.md).
//
// Mọi request đi qua hook onRequest này. Chỉ 2 đường được đi tiếp:
//   1. route khai báo `config: { public: true }`  (health, docs, đăng nhập)
//   2. route khai báo `config: { permission: ... }` VÀ vai trò của người gọi có quyền đó
// Route quên khai báo → 403 kèm log lỗi. Không có nhánh "mặc định cho qua".
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { UserRole } from '@g3/shared';
import type { Queryable } from '../db';
import { ACTION_VEHICLE_LOCATION_DENIED, writeAuditLog } from '../audit';
import { sendError } from '../errors';
import { grantFor, type Grant, type Permission } from './permissions';

declare module 'fastify' {
  interface FastifyContextConfig {
    /** Route công khai — không cần token. Chỉ dùng cho health/docs/đăng nhập. */
    public?: boolean;
    /** Quyền bắt buộc để gọi route (docs/prd/09-rbac.md). */
    permission?: Permission;
    /** Chỉ cần đăng nhập, không gắn quyền nào — duy nhất cho GET /auth/me. */
    authenticated?: boolean;
  }
  interface FastifyRequest {
    /** Danh tính + phạm vi dữ liệu của người gọi; null với route công khai. */
    auth: AuthContext | null;
  }
}

export interface AuthContext {
  userId: string;
  role: UserRole;
  fullName: string;
  customerId: string | null;
  /** null khi route chỉ yêu cầu đăng nhập (config.authenticated). */
  permission: Permission | null;
  grant: Grant | null;
}

export interface JwtPayload {
  sub: string;
  role: UserRole;
}

/**
 * Tiền tố URL công khai cho các route KHÔNG do chúng ta khai báo (@fastify/swagger-ui tự
 * đăng ký /docs, /docs/json, /docs/static/*). Danh sách này cố tình ngắn và tường minh —
 * mọi route nghiệp vụ đều phải đi đường `config.permission`.
 */
const PUBLIC_URL_PREFIXES = ['/docs'];

export function registerAuthGuard(app: FastifyInstance, db: Queryable): void {
  app.decorateRequest('auth', null);

  app.addHook('onRequest', async (request, reply) => {
    // Request không khớp route nào → để notFoundHandler trả 404, không biến thành 403.
    if (request.routeOptions.url === undefined) return;
    const duongDan = request.url.split('?')[0] ?? request.url; // bỏ query string
    if (PUBLIC_URL_PREFIXES.some((p) => duongDan === p || duongDan.startsWith(`${p}/`))) {
      return;
    }

    const config = request.routeOptions.config;
    if (config.public === true) return;

    let payload: JwtPayload;
    try {
      payload = await request.jwtVerify<JwtPayload>();
    } catch {
      return sendError(
        reply,
        401,
        'chua_dang_nhap',
        'Thiếu hoặc sai token. Đăng nhập lại bằng OTP tại POST /auth/otp/verify.',
      );
    }

    // Đọc lại vai trò từ DB mỗi request: đổi quyền / khóa tài khoản có hiệu lực NGAY,
    // không phải chờ token cũ hết hạn (sheet 9: "mời/khóa tài khoản").
    const res = await db.query(
      `SELECT id, role, full_name, customer_id FROM users WHERE id = $1 AND is_active`,
      [payload.sub],
    );
    const user = res.rows[0];
    if (!user) {
      return sendError(reply, 401, 'tai_khoan_khong_hoat_dong', 'Tài khoản không còn hiệu lực.');
    }
    const role = user.role as UserRole;

    const permission = config.permission;
    if (permission === undefined && config.authenticated === true) {
      request.auth = {
        userId: user.id as string,
        role,
        fullName: user.full_name as string,
        customerId: (user.customer_id as string | null) ?? null,
        permission: null,
        grant: null,
      };
      return;
    }
    if (permission === undefined) {
      // Lỗi lập trình, KHÔNG phải lỗi người dùng: thà chặn còn hơn hở dữ liệu.
      request.log.error(
        { url: request.routeOptions.url },
        'Route chưa khai báo config.permission — bị chặn theo quy tắc mặc định từ chối',
      );
      return sendError(reply, 403, 'route_chua_khai_bao_quyen', 'Chức năng chưa được cấp quyền.');
    }

    const grant = grantFor(role, permission);
    if (!grant) {
      // QUY TẮC 5: lần CỐ xem vị trí xe cũng phải để lại dấu vết, không chỉ lần xem được.
      if (permission === 'vehicle.location.read') {
        await auditLocationDenied(db, user.id as string, request, `vai trò ${role} không có quyền`);
      }
      return sendError(
        reply,
        403,
        'khong_du_quyen',
        `Vai trò "${role}" không có quyền "${permission}" theo ma trận phân quyền (docs/prd/09-rbac.md).`,
      );
    }
    const customerId = (user.customer_id as string | null) ?? null;
    if (grant.scope === 'fleet' && customerId === null) {
      return sendError(
        reply,
        403,
        'tai_khoan_chua_gan_doi_xe',
        'Tài khoản chưa được gán vào đội xe nào nên không có dữ liệu để xem.',
      );
    }

    request.auth = {
      userId: user.id as string,
      role,
      fullName: user.full_name as string,
      customerId,
      permission,
      grant,
    };
  });
}

/**
 * Ghi audit cho lần bị từ chối ngay tại guard. Không dùng cột vehicle_id (mã xe trên URL
 * có thể không tồn tại → vi phạm khóa ngoại), mã xe được yêu cầu nằm trong metadata.
 */
async function auditLocationDenied(
  db: Queryable,
  userId: string,
  request: FastifyRequest,
  reason: string,
): Promise<void> {
  const params = request.params as { id?: string } | undefined;
  await writeAuditLog(db, {
    userId,
    action: ACTION_VEHICLE_LOCATION_DENIED,
    vehicleId: null,
    reason,
    metadata: { vehicle_id_yeu_cau: params?.id ?? null, url: request.routeOptions.url },
  });
}

/** Lấy danh tính đã xác thực; ném lỗi nếu route quên đặt permission (không bao giờ xảy ra qua guard). */
export function requireAuth(request: FastifyRequest): AuthContext {
  if (!request.auth) throw new Error('Route cần xác thực nhưng thiếu config.permission');
  return request.auth;
}

/** Như requireAuth nhưng bảo đảm có phạm vi dữ liệu — dùng cho route đọc dữ liệu xe/đội. */
export function requireScopedAuth(request: FastifyRequest): AuthContext & { grant: Grant } {
  const auth = requireAuth(request);
  if (!auth.grant) throw new Error('Route đọc dữ liệu nhưng thiếu config.permission');
  return auth as AuthContext & { grant: Grant };
}
