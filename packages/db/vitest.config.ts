// F-G4 · Test DB chạy tuần tự vào database g3_test riêng (tạo mới mỗi lần chạy).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: './src/test/global-setup.ts',
    fileParallelism: false, // hai file test dùng chung g3_test — chạy tuần tự
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
