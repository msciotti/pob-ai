import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/tests/**/*.test.ts', 'scripts/**/*.test.js'],
    // All integration tests share one LuaJIT process — forks pool with a
    // single fork ensures they run sequentially in one subprocess.
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    // LuaJIT startup + build loading can take several seconds.
    testTimeout: 30000,
  },
});
