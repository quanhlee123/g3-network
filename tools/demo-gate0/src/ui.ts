// Tiện ích in ra console cho demo Gate 0 — bản demo này để QUAY VIDEO báo cáo Ban lãnh đạo,
// nên phần hiển thị phải rõ ràng, tiếng Việt, không jargon (NF-17).

const RONG = 78;

export function tieuDe(so: number, chu: string): void {
  console.log('');
  console.log('━'.repeat(RONG));
  console.log(`  BƯỚC ${so} · ${chu.toUpperCase()}`);
  console.log('━'.repeat(RONG));
}

export function khung(dong: string[]): void {
  console.log('┌' + '─'.repeat(RONG - 2) + '┐');
  for (const d of dong) console.log('│ ' + demChuan(d, RONG - 4) + ' │');
  console.log('└' + '─'.repeat(RONG - 2) + '┘');
}

export function buoc(chu: string): void {
  console.log(`  → ${chu}`);
}

export function ok(chu: string): void {
  console.log(`  ✔ ${chu}`);
}

export function canhBao(chu: string): void {
  console.log(`  ⚠ ${chu}`);
}

/** Cắt/đệm chuỗi về đúng độ rộng cột (tính theo ký tự — tiếng Việt có dấu vẫn 1 ô). */
function demChuan(s: string, rong: number): string {
  if (s.length > rong) return `${s.slice(0, rong - 1)}…`;
  return s.padEnd(rong);
}

export interface Cot {
  ten: string;
  rong: number;
  phai?: boolean;
}

/** Bảng kẻ khung đơn giản, không phụ thuộc thư viện ngoài. */
export function bang(cot: Cot[], hang: string[][]): void {
  const vach = (trai: string, giua: string, phai: string): string =>
    trai + cot.map((c) => '─'.repeat(c.rong + 2)).join(giua) + phai;

  const dongCua = (o: string[]): string =>
    '│ ' +
    o
      .map((v, i) => {
        const c = cot[i]!;
        const t = v.length > c.rong ? `${v.slice(0, c.rong - 1)}…` : v;
        return c.phai ? t.padStart(c.rong) : t.padEnd(c.rong);
      })
      .join(' │ ') +
    ' │';

  console.log(vach('┌', '┬', '┐'));
  console.log(dongCua(cot.map((c) => c.ten)));
  console.log(vach('├', '┼', '┤'));
  for (const h of hang) console.log(dongCua(h));
  console.log(vach('└', '┴', '┘'));
}

export function soVn(v: number | null | undefined, chuSo = 3): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return v.toLocaleString('vi-VN', {
    minimumFractionDigits: chuSo,
    maximumFractionDigits: chuSo,
  });
}

export function tienVn(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return `${Math.round(v).toLocaleString('vi-VN')} ₫`;
}

export const nghi = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Chờ tới khi điều kiện đúng, hoặc hết hạn. Trả về false nếu hết hạn —
 * demo KHÔNG được treo vô hạn khi quay video.
 */
export async function choDen(
  moTa: string,
  dieuKien: () => Promise<boolean>,
  hanGiay: number,
  nhipMs = 1000,
): Promise<boolean> {
  const han = Date.now() + hanGiay * 1000;
  let dem = 0;
  while (Date.now() < han) {
    if (await dieuKien()) return true;
    dem += 1;
    if (dem % 5 === 0) {
      process.stdout.write(`  … đang chờ ${moTa} (${Math.round((han - Date.now()) / 1000)}s)\r`);
    }
    await nghi(nhipMs);
  }
  process.stdout.write(' '.repeat(RONG) + '\r');
  return false;
}
