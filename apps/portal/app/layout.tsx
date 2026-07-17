// Khung khởi tạo (Prompt 01, chưa gắn F-xx) — layout gốc portal đội xe.
// NF-12: tiếng Việt, chữ lớn, tương phản cao.
import type { ReactNode } from 'react';

export const metadata = {
  title: 'G3 Network — Portal đội xe',
  description: 'Nền tảng vận hành xe tải điện (Phase 1 — simulator)',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body
        style={{
          margin: 0,
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          fontSize: '18px',
          color: '#111111',
          backgroundColor: '#ffffff',
        }}
      >
        {children}
      </body>
    </html>
  );
}
