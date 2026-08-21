// NF-04 · Test bộ đọc metric của load test — thuần hàm, không cần database.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { testTimeout: 10_000 },
});
