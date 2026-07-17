// Khung khởi tạo (Prompt 01, chưa gắn F-xx) — trang chào portal đội xe.
import { getGreeting } from '../lib/greeting';

export default function HomePage() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px' }}>
      <h1 style={{ fontSize: '2.25rem', lineHeight: 1.25 }}>{getGreeting()}</h1>
      <p style={{ fontSize: '1.25rem' }}>
        Khung khởi tạo Phase 1 — chạy trên simulator, dữ liệu giả 100%.
      </p>
      <p style={{ fontSize: '1.25rem' }}>
        Màn hình quản lý đội xe sẽ được xây ở Prompt 10. API:{' '}
        <code>http://localhost:3000/health</code> · Tài liệu API:{' '}
        <code>http://localhost:3000/docs</code>
      </p>
    </main>
  );
}
