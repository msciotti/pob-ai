import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    // These tests spawn real subprocesses (stdio) and start a real HTTP server, and
    // deliberately exercise a ~2s slow_tool — give them more headroom than vitest's
    // 5s default, especially for the concurrency/resilience suites.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // Real subprocesses + real ports don't parallelize safely across files.
    fileParallelism: false,
  },
});
