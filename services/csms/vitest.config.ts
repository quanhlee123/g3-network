// F-G2 · Test CSMS chạy vào database g3_test riêng (dùng lại global setup của packages/db).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: '../../packages/db/src/test/global-setup.ts',
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
