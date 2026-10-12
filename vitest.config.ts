import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The configured database is always in memory under the test runner, so no test
    // can reach data/app.db through getDatabasePath(). This wins over the shell's value.
    env: { DATABASE_PATH: ':memory:' },
  },
});
