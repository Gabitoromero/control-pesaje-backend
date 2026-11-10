import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['dist/**', 'node_modules/**', 'scripts/**'], // scripts/*.test.mjs run with node:test
    fileParallelism: false, // integration tests share a single DB — must run sequentially
  },
});
