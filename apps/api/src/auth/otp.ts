// F-F1 — Đăng nhập bằng OTP qua SĐT. Phase 1: mã do ConsoleSmsSender in ra console
// (quy tắc 2 — SMS đi qua ISmsSender của @g3/contracts; quy tắc 12 — không SĐT thật).
//
// Nguyên tắc bảo mật đã áp dụng:
// - DB chỉ lưu BĂM của mã (HMAC-SHA256 khóa dẫn xuất từ JWT_SECRET), không lưu mã thô.
// - So sánh bằng timingSafeEqual để không rò rỉ mã qua thời gian phản hồi.
// - Mã dùng 1 lần: đánh dấu consumed_at ngay trong câu UPDATE có điều kiện (chống dùng lại).
// - Hết hạn OTP_TTL_SECONDS, sai quá OTP_MAX_ATTEMPTS lần thì khóa mã đó.
// - SĐT không tồn tại vẫn tạo thách thức và vẫn trả 202: người ngoài không dò được
//   tài khoản nào có thật (user enumeration).
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { ISmsSender } from '@g3/contracts';
import type { UserRole } from '@g3/shared';
import type { Queryable } from '../db';

/** Nhận Pool hoặc Client của pg — cùng quy ước với services/ingest và services/csms. */
export type { Queryable } from '../db';

export interface OtpVerifiedUser {
  id: string;
  role: UserRole;
  fullName: string;
  customerId: string | null;
}

export type OtpFailure =
  | 'ma_khong_dung' // sai mã, hoặc SĐT không có tài khoản (trả lời giống hệt nhau)
  | 'ma_het_han'
  | 'qua_so_lan';

export type OtpVerifyResult =
  { ok: true; user: OtpVerifiedUser } | { ok: false; reason: OtpFailure };

/**
 * Chuẩn hóa SĐT Việt Nam về dạng 0xxxxxxxxx: bỏ khoảng trắng/dấu gạch, +84/84 → 0.
 * Nhờ vậy "0900 000 001", "+84900000001" và "0900000001" là cùng một tài khoản.
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/[\s.-]/g, '');
  if (digits.startsWith('+84')) return `0${digits.slice(3)}`;
  if (digits.startsWith('84') && digits.length >= 11) return `0${digits.slice(2)}`;
  return digits;
}

/** Mã 6 chữ số bằng randomInt (CSPRNG) — KHÔNG dùng Math.random cho mã đăng nhập. */
export function generateOtpCode(rand: (max: number) => number = (m) => randomInt(m)): string {
  return String(rand(1_000_000)).padStart(6, '0');
}

/**
 * Băm mã OTP. Khóa dẫn xuất từ JWT_SECRET kèm nhãn tách miền 'g3-otp-v1' — cùng một secret
 * nhưng khóa băm OTP và khóa ký JWT là hai giá trị khác nhau, lộ cái này không suy ra cái kia.
 * SĐT nằm trong dữ liệu băm nên mã của số A không dùng được cho số B.
 */
export function hashOtpCode(phone: string, code: string, jwtSecret: string): string {
  const key = createHmac('sha256', jwtSecret).update('g3-otp-v1').digest();
  return createHmac('sha256', key).update(`${phone}:${code}`).digest('hex');
}

function hashesEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return timingSafeEqual(bufA, bufB);
}

export interface OtpServiceOptions {
  ttlSeconds: number;
  maxAttempts: number;
  jwtSecret: string;
  clock?: () => number;
  /** Tiêm mã cố định trong test; mặc định sinh ngẫu nhiên. */
  codeFactory?: () => string;
}

export class OtpService {
  #clock: () => number;
  #codeFactory: () => string;

  constructor(
    private readonly db: Queryable,
    private readonly sms: ISmsSender,
    private readonly opts: OtpServiceOptions,
  ) {
    this.#clock = opts.clock ?? (() => Date.now());
    this.#codeFactory = opts.codeFactory ?? (() => generateOtpCode());
  }

  /**
   * Tạo thách thức OTP và gửi qua ISmsSender. Luôn thành công về phía người gọi —
   * SĐT không có tài khoản vẫn tạo bản ghi (user_id NULL) nhưng không gửi tin.
   */
  async request(phoneRaw: string): Promise<void> {
    const phone = normalizePhone(phoneRaw);
    const found = await this.db.query(
      `SELECT id, full_name FROM users WHERE phone = $1 AND is_active`,
      [phone],
    );
    const user = found.rows[0];
    const code = this.#codeFactory();
    const expiresAt = new Date(this.#clock() + this.opts.ttlSeconds * 1000);

    await this.db.query(
      `INSERT INTO auth_otp_challenges (phone, code_hash, user_id, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [phone, hashOtpCode(phone, code, this.opts.jwtSecret), user?.id ?? null, expiresAt],
    );
    if (!user) return; // không có tài khoản → không gửi gì, nhưng phía ngoài vẫn thấy 202

    const phut = Math.max(1, Math.round(this.opts.ttlSeconds / 60));
    await this.sms.send({
      to: phone,
      kind: 'otp',
      body: `G3 Network: ma dang nhap cua ban la ${code} (het han sau ${phut} phut). Khong chia se ma nay.`,
    });
  }

  /** Đổi mã lấy danh tính người dùng. Mọi nhánh thất bại đều KHÔNG tiết lộ lý do chi tiết ra API. */
  async verify(phoneRaw: string, code: string): Promise<OtpVerifyResult> {
    const phone = normalizePhone(phoneRaw);
    const res = await this.db.query(
      `SELECT id, code_hash, user_id, attempts, expires_at
       FROM auth_otp_challenges
       WHERE phone = $1 AND consumed_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [phone],
    );
    const row = res.rows[0];
    if (!row) return { ok: false, reason: 'ma_khong_dung' };

    if (new Date(row.expires_at as string).getTime() < this.#clock()) {
      return { ok: false, reason: 'ma_het_han' };
    }
    if ((row.attempts as number) >= this.opts.maxAttempts) {
      return { ok: false, reason: 'qua_so_lan' };
    }
    if (!hashesEqual(row.code_hash as string, hashOtpCode(phone, code, this.opts.jwtSecret))) {
      await this.db.query(`UPDATE auth_otp_challenges SET attempts = attempts + 1 WHERE id = $1`, [
        row.id,
      ]);
      return { ok: false, reason: 'ma_khong_dung' };
    }

    // Đánh dấu đã dùng NGAY trong câu UPDATE có điều kiện: hai request song song cùng mã
    // thì chỉ đúng một request thấy rowCount = 1.
    const consumed = await this.db.query(
      `UPDATE auth_otp_challenges SET consumed_at = now()
       WHERE id = $1 AND consumed_at IS NULL
       RETURNING user_id`,
      [row.id],
    );
    if ((consumed.rowCount ?? 0) === 0) return { ok: false, reason: 'ma_khong_dung' };

    const userId = consumed.rows[0]!.user_id as string | null;
    if (!userId) return { ok: false, reason: 'ma_khong_dung' }; // SĐT không có tài khoản

    const userRes = await this.db.query(
      `SELECT id, role, full_name, customer_id FROM users WHERE id = $1 AND is_active`,
      [userId],
    );
    const user = userRes.rows[0];
    if (!user) return { ok: false, reason: 'ma_khong_dung' }; // tài khoản bị khóa sau khi xin mã

    return {
      ok: true,
      user: {
        id: user.id as string,
        role: user.role as UserRole,
        fullName: user.full_name as string,
        customerId: (user.customer_id as string | null) ?? null,
      },
    };
  }
}
