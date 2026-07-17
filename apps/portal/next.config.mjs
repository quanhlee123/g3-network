// Khung khởi tạo (Prompt 01, chưa gắn F-xx) — cấu hình Next.js cho portal đội xe.
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Cho phép import trực tiếp mã TypeScript từ các package trong monorepo
  transpilePackages: ['@g3/shared'],
};

export default nextConfig;
