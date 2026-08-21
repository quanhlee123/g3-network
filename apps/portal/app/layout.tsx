// F-E1 — Layout gốc portal đội xe. NF-12: tiếng Việt, chữ lớn, tương phản cao.
// Kiểu dáng chuyển sang app/globals.css để dùng chung cho mọi màn hình và có @media print
// (checklist bàn giao F-F2 phải in được).
import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'G3 Network — Portal đội xe',
  description: 'Nền tảng vận hành xe tải điện (Phase 1 — simulator, dữ liệu giả 100%)',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
