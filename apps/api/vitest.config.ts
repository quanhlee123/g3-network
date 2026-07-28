// F-F1 · Test apps/api chạy vào database g3_test riêng (dùng lại global setup của
// packages/db — tạo mới g3_test + migration; không đụng DB g3 dùng chung).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: '../../packages/db/src/test/global-setup.ts',
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
