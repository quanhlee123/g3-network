// F-F1 (Prompt 06) — Fastify app factory: xác thực OTP + JWT, RBAC MẶC ĐỊNH TỪ CHỐI
// theo docs/prd/09-rbac.md, audit log truy cập vị trí xe (quy tắc 5).
// OpenAPI tự sinh từ schema TypeBox của từng route (quy tắc 11, CLAUDE.md) — xem /docs.
import Fastify, { type FastifyInstance } from 'fastify';
import jwt from '@fastify/jwt';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { ConsoleSmsSender, type INotifier, type ISmsSender } from '@g3/contracts';
import { registerAuthGuard } from './auth/guard';
import { OtpService } from './auth/otp';
import type { ApiConfig } from './config';
import type { Queryable } from './db';
import { sendError } from './errors';
import { authRoutes } from './routes/auth';
import { deviceRoutes } from './routes/devices';
import { geofenceRoutes } from './routes/geofences';
import { healthRoutes } from './routes/health';
import { notificationRoutes } from './routes/notifications';
import { reconciliationRoutes } from './routes/reconciliation';
import { sessionRoutes } from './routes/sessions';
import { stationRoutes } from './routes/stations';
import { ticketRoutes } from './routes/tickets';
import { vehicleRoutes } from './routes/vehicles';

export interface BuildAppOptions {
  logger?: boolean;
  config: ApiConfig;
  db: Queryable;
  /** Phase 1 mặc định ConsoleSmsSender (quy tắc 2 & 12 — không gửi SMS thật). */
  sms?: ISmsSender;
  /** F-F3: cổng thông báo. Không truyền = chỉ ghi alerts/tickets, không báo cho người. */
  notifier?: INotifier;
  /** Tiêm mã OTP cố định trong test. */
  otpCodeFactory?: () => string;
  /**
   * Thu thập mọi route lúc đăng ký. Dùng cho test "không route nào quên khai báo quyền"
   * (quy tắc 6) — Fastify không cho đọc lại config sau khi đã dựng xong.
   */
  onRoute?: (route: { method: string | string[]; url: string; config: RouteGuardConfig }) => void;
}

/** Phần cấu hình bảo vệ của một route (xem auth/guard.ts). */
export interface RouteGuardConfig {
  public?: boolean;
  authenticated?: boolean;
  permission?: string;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { config, db } = options;
  const app = Fastify({ logger: options.logger ?? true }).withTypeProvider<TypeBoxTypeProvider>();

  if (options.onRoute) {
    const collect = options.onRoute;
    app.addHook('onRoute', (route) => {
      collect({
        method: route.method,
        url: route.url,
        config: (route.config ?? {}) as RouteGuardConfig,
      });
    });
  }

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'G3 Network API',
        description:
          'API nền tảng vận hành xe tải điện — Phase 1 (simulator, dữ liệu giả 100%).\n\n' +
          'Đăng nhập: POST /auth/otp/request → mã in ra console → POST /auth/otp/verify → ' +
          'gắn header `Authorization: Bearer <token>`.\n\n' +
          'Phân quyền theo docs/prd/09-rbac.md, mặc định TỪ CHỐI. Truy cập vị trí xe luôn ' +
          'ghi audit log (NF-06, Nghị định 13/2023).',
        version: '0.2.0',
      },
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
      security: [{ bearerAuth: [] }],
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });
  await app.register(jwt, { secret: config.jwtSecret });

  // Lỗi validate schema phải ra ĐÚNG định dạng lỗi chung của API.
  //
  // Không có chỗ này thì Fastify trả body mặc định {statusCode, error, message}; route nào
  // khai `400: ErrorSchema` sẽ serialize hỏng và biến lỗi nhập liệu 400 thành 500 —
  // lỗi của người gọi bị báo thành lỗi hệ thống. Phát hiện khi làm F-A5; POST /auth/otp/request
  // (khai 400 từ Prompt 06) cũng đang dính đúng lỗi này.
  app.setErrorHandler((error: unknown, request, reply) => {
    const err = error as { validation?: unknown; message?: string; statusCode?: number };
    if (err.validation) {
      return sendError(
        reply,
        400,
        'du_lieu_khong_hop_le',
        `Dữ liệu gửi lên không hợp lệ: ${err.message ?? ''}`,
      );
    }
    request.log.error({ err }, 'Lỗi không lường trước');
    const status = err.statusCode !== undefined && err.statusCode < 500 ? err.statusCode : 500;
    // KHÔNG lộ chi tiết nội bộ (tên bảng, SQL) ra ngoài — xem errors.ts.
    return sendError(reply, status, 'loi_he_thong', 'Lỗi hệ thống. Vui lòng thử lại sau.');
  });

  // Cổng chặn mặc định từ chối — đăng ký TRƯỚC mọi route (quy tắc 6).
  registerAuthGuard(app, db);

  const sms = options.sms ?? new ConsoleSmsSender();
  const otp = new OtpService(db, sms, {
    ttlSeconds: config.otpTtlS,
    maxAttempts: config.otpMaxAttempts,
    maxRequestsPerWindow: config.otpMaxRequestsPerWindow,
    requestWindowSeconds: config.otpRequestWindowS,
    jwtSecret: config.jwtSecret,
    codeFactory: options.otpCodeFactory,
    log: (m) => app.log.warn(m),
  });

  await app.register(healthRoutes);
  await app.register(authRoutes, { db, otp, jwtExpiresIn: config.jwtExpiresIn });
  await app.register(vehicleRoutes, {
    db,
    telemetryHistoryMaxRows: config.telemetryHistoryMaxRows,
  });
  await app.register(stationRoutes, { db });
  await app.register(sessionRoutes, { db });
  await app.register(deviceRoutes, { db });
  await app.register(geofenceRoutes, { db });
  await app.register(ticketRoutes, {
    db,
    ...(options.notifier ? { notifier: options.notifier } : {}),
  });
  await app.register(notificationRoutes, { db });
  await app.register(reconciliationRoutes, { db, config });

  return app;
}
