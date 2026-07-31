// F-F3 · Test khung thông báo chạy vào database g3_test riêng (dùng lại global setup
// của packages/db — không đụng DB g3 dùng chung, đúng ranh giới CLAUDE.md).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: '../db/src/test/global-setup.ts',
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
