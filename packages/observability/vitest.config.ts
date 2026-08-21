// NF-14 · Test hạ tầng quan sát — thuần in-process, không cần database.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 10_000,
  },
});
